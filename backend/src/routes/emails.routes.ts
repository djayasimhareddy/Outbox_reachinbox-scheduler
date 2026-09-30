import { Router } from "express";
import type { estypes } from "@elastic/elasticsearch";
import { randomUUID } from "crypto";
import { z } from "zod";
import type { EmailStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import { ensureSenders } from "../services/senders.service";
import { enqueueEmails } from "../services/scheduler.service";
import { asyncHandler } from "../lib/asyncHandler";
import { es, EMAIL_INDEX } from "../lib/elastic";
import { indexEmailIds } from "../services/search.service";

const router = Router();

const scheduleSchema = z.object({
  subject: z.string().min(1).max(300),
  body: z.string().min(1),
  emails: z.array(z.string().email()).min(1).max(5000),
  startTime: z.coerce.date(),
  delaySeconds: z.coerce.number().min(0).default(config.MIN_DELAY_BETWEEN_EMAILS_MS / 1000),
  hourlyLimit: z.coerce.number().int().min(1).default(config.DEFAULT_MAX_EMAILS_PER_HOUR),
});

router.post(
  "/schedule",
  asyncHandler(async (req, res) => {
    const parsed = scheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { subject, body, startTime, delaySeconds, hourlyLimit } = parsed.data;
    const userId = req.userId!;

    const recipients = [...new Set(parsed.data.emails.map((e) => e.toLowerCase()))];
    const senders = await ensureSenders(userId);
    const startMs = Math.max(startTime.getTime(), Date.now());

    // Stagger emails by the delay; round-robin across senders
    const rows = recipients.map((toEmail, i) => ({
      id: randomUUID(),
      userId,
      senderId: senders[i % senders.length].id,
      toEmail,
      subject,
      body,
      scheduledAt: new Date(startMs + i * delaySeconds * 1000),
      hourlyLimit,
    }));

    await prisma.email.createMany({ data: rows }); // 1) DB first (source of truth)
    await enqueueEmails(rows);                     // 2) then delayed jobs in Redis
    await indexEmailIds(rows.map((r) => r.id)); // best-effort indexing

    res.status(201).json({
      scheduled: rows.length,
      firstAt: rows[0].scheduledAt,
      lastAt: rows[rows.length - 1].scheduledAt,
    });
  })
);

const listSchema = z.object({
  status: z.enum(["scheduled", "sent"]),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { status, page, limit } = parsed.data;
    const statuses: EmailStatus[] =
      status === "scheduled" ? ["SCHEDULED", "PROCESSING"] : ["SENT", "FAILED"];
    const where = { userId: req.userId!, status: { in: statuses } };

    const [data, total] = await Promise.all([
      prisma.email.findMany({
        where,
        orderBy: { scheduledAt: status === "scheduled" ? "asc" : "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, toEmail: true, subject: true, scheduledAt: true,
          status: true, sentAt: true, error: true,
        },
      }),
      prisma.email.count({ where }),
    ]);

    res.json({ data, total, page, limit });
  })
);

const searchSchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(["scheduled", "sent"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

async function searchPostgres(userId: string, q: string | undefined, status: string | undefined, page: number, limit: number) {
  const statuses: EmailStatus[] | undefined = status
    ? status === "scheduled" ? ["SCHEDULED", "PROCESSING"] : ["SENT", "FAILED"]
    : undefined;
  const where = {
    userId,
    ...(statuses ? { status: { in: statuses } } : {}),
    ...(q ? {
      OR: [
        { subject: { contains: q, mode: "insensitive" as const } },
        { body: { contains: q, mode: "insensitive" as const } },
        { toEmail: { contains: q, mode: "insensitive" as const } },
      ],
    } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.email.findMany({
      where,
      orderBy: { scheduledAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, userId: true, toEmail: true, subject: true, body: true,
        status: true, scheduledAt: true, sentAt: true,
        sender: { select: { email: true } },
      },
    }),
    prisma.email.count({ where }),
  ]);
  return {
    data: data.map(({ sender, ...email }) => ({ ...email, senderEmail: sender.email })),
    total,
  };
}

router.get(
  "/search",
  asyncHandler(async (req, res) => {
    const parsed = searchSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { q, status, page, limit } = parsed.data;
    if (!es) {
      const result = await searchPostgres(req.userId!, q, status, page, limit);
      res.json({ ...result, page, limit });
      return;
    }

    const filter: estypes.QueryDslQueryContainer[] = [{ term: { userId: req.userId! } }];
    if (status) {
      filter.push({
        terms: { status: status === "scheduled" ? ["SCHEDULED", "PROCESSING"] : ["SENT", "FAILED"] },
      });
    }

    try {
      const result = await es.search({
      index: EMAIL_INDEX,
      from: (page - 1) * limit,
      size: limit,
      query: {
        bool: {
          filter,
          must: q
            ? [{
                multi_match: {
                  query: q,
                  fields: ["toEmail^2", "subject^2", "body", "senderEmail"],
                  fuzziness: "AUTO",
                },
              }]
            : [{ match_all: {} }],
        },
      },
      ...(q ? {} : { sort: [{ scheduledAt: "desc" as const }] }),
      });

      const total = typeof result.hits.total === "number" ? result.hits.total : result.hits.total?.value ?? 0;
      res.json({ data: result.hits.hits.map((hit) => hit._source), total, page, limit });
    } catch (error) {
      console.error("ES search failed, using Postgres:", error instanceof Error ? error.message : error);
      const fallback = await searchPostgres(req.userId!, q, status, page, limit);
      res.json({ ...fallback, page, limit });
    }
  })
);
export default router;

