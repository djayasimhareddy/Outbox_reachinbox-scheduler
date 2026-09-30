import { emailQueue } from "../queue/emailQueue";

// jobId = emailId, so re-adding the same email is a no-op in BullMQ (idempotent).
export async function enqueueEmails(rows: { id: string; scheduledAt: Date }[]) {
  const now = Date.now();
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await emailQueue.addBulk(
      chunk.map((r) => ({
        name: "send",
        data: { emailId: r.id },
        opts: { jobId: r.id, delay: Math.max(0, r.scheduledAt.getTime() - now) },
      }))
    );
  }
}