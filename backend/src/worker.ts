import { Worker, DelayedError, Job } from "bullmq";
import nodemailer, { Transporter } from "nodemailer";
import type { Sender } from "@prisma/client";
import { config } from "./config";
import { prisma } from "./lib/prisma";
import { redis } from "./lib/redis";
import { EMAIL_QUEUE, EmailJobData } from "./queue/emailQueue";
import { tryAcquire, release, overflowRank, nextWindowStart } from "./lib/rateLimiter";
import { notifyRateLimitHit } from "./services/slack.service";
import { enqueueEmails } from "./services/scheduler.service";
import { ensureIndex } from "./lib/elastic";
import { indexEmailIds } from "./services/search.service";

const transports = new Map<string, Transporter>();
function getTransport(s: Sender): Transporter {
  let t = transports.get(s.id);
  if (!t) {
    t = nodemailer.createTransport({
      host: s.smtpHost,
      port: s.smtpPort,
      secure: false,
      auth: { user: s.smtpUser, pass: s.smtpPass },
    });
    transports.set(s.id, t);
  }
  return t;
}

async function processEmail(job: Job<EmailJobData>, token?: string): Promise<void> {
  const email = await prisma.email.findUnique({
    where: { id: job.data.emailId },
    include: { sender: true },
  });
  if (!email) return;
  if (email.status === "SENT" || email.status === "FAILED") return; // idempotency guard

  // 1) Hourly rate limit (Redis, safe across workers)
  const { ok, window } = await tryAcquire(email.senderId, email.hourlyLimit);
  if (!ok) {
    const rank = await overflowRank(email.senderId, window);
    const resumeAt = nextWindowStart() + rank * config.MIN_DELAY_BETWEEN_EMAILS_MS;

    await prisma.email.update({
      where: { id: email.id },
      data: { scheduledAt: new Date(resumeAt), status: "SCHEDULED" },
    });
    await indexEmailIds([email.id]);
    await notifyRateLimitHit({
      userId: email.userId,
      senderId: email.senderId,
      senderEmail: email.sender.email,
      limit: email.hourlyLimit,
      window,
      resumeAt,
    });
    await job.moveToDelayed(resumeAt, token);
    throw new DelayedError(); // tells BullMQ the job was moved, not failed
  }

  // 2) Send
  await prisma.email.update({ where: { id: email.id }, data: { status: "PROCESSING" } });

  let info;
  try {
    info = await getTransport(email.sender).sendMail({
      from: email.sender.email,
      to: email.toEmail,
      subject: email.subject,
      text: email.body,
    });
  } catch (err) {
    await release(email.senderId, window); // failed send shouldn't consume quota
    const isFinal = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    await prisma.email.update({
      where: { id: email.id },
      data: {
        status: isFinal ? "FAILED" : "SCHEDULED",
        error: err instanceof Error ? err.message : String(err),
      },
    });
    await indexEmailIds([email.id]);
    throw err; // BullMQ retries with backoff if attempts remain
  }

  // 3) Record success (outside the try so a DB hiccup can't trigger a re-send)
  await prisma.email.update({
    where: { id: email.id },
    data: { status: "SENT", sentAt: new Date(), messageId: info.messageId, error: null },
  });
  await indexEmailIds([email.id]);
  console.log(`SENT ${email.toEmail} via ${email.sender.email} | preview: ${nodemailer.getTestMessageUrl(info)}`);
}

// Re-create jobs for any unsent rows (e.g. Redis data was lost). jobId = emailId makes this safe.
async function recoverOrphans() {
  const rows = await prisma.email.findMany({
    where: { status: { in: ["SCHEDULED", "PROCESSING"] } },
    select: { id: true, scheduledAt: true },
  });
  if (rows.length) await enqueueEmails(rows);
  console.log(`Recovery check: ${rows.length} unsent emails verified in queue`);
}

const worker = new Worker<EmailJobData>(EMAIL_QUEUE, processEmail, {
  connection: redis,
  concurrency: config.WORKER_CONCURRENCY,
  // Global minimum gap between sends, enforced in Redis across all workers
  limiter: { max: 1, duration: config.MIN_DELAY_BETWEEN_EMAILS_MS },
});

worker.on("failed", (job, err) => console.error(`Job ${job?.id} failed:`, err.message));
worker.on("error", (err) => console.error("Worker error:", err));

recoverOrphans().catch((e) => console.error("Recovery failed:", e));
ensureIndex().catch(() => {});
console.log(
  `Worker up | concurrency=${config.WORKER_CONCURRENCY} | min delay=${config.MIN_DELAY_BETWEEN_EMAILS_MS}ms`
);

const shutdown = async () => {
  await worker.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
