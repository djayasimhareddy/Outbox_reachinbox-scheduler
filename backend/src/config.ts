import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  ELASTIC_URL: z.string(),
  JWT_SECRET: z.string().min(8),
  FRONTEND_URL: z.string(),
  BACKEND_URL: z.string(),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  SLACK_CLIENT_ID: z.string().default(""),
  SLACK_CLIENT_SECRET: z.string().default(""),
  SLACK_REDIRECT_URI: z.string().optional(),
  WORKER_CONCURRENCY: z.coerce.number().default(5),
  MIN_DELAY_BETWEEN_EMAILS_MS: z.coerce.number().default(2000),
  DEFAULT_MAX_EMAILS_PER_HOUR: z.coerce.number().default(200),
  SENDERS_PER_USER: z.coerce.number().default(3),
});

export const config = schema.parse(process.env);