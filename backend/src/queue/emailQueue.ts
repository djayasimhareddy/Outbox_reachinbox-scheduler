import { Queue } from "bullmq";
import { redis } from "../lib/redis";

export const EMAIL_QUEUE = "email-queue";

// Job carries only the emailId. The DB row is the source of truth at send time.
export interface EmailJobData {
  emailId: string;
}

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 24 * 3600, count: 5000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});