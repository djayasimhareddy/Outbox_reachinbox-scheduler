import { Client } from "@elastic/elasticsearch";
import { config } from "../config";

export const es = new Client({ node: config.ELASTIC_URL });
export const EMAIL_INDEX = "emails";

export async function ensureIndex(): Promise<void> {
  const exists = await es.indices.exists({ index: EMAIL_INDEX });
  if (exists) return;
  try {
    await es.indices.create({
      index: EMAIL_INDEX,
      mappings: {
        properties: {
          id: { type: "keyword" },
          userId: { type: "keyword" },
          status: { type: "keyword" },
          toEmail: { type: "text" },
          senderEmail: { type: "text" },
          subject: { type: "text" },
          body: { type: "text" },
          scheduledAt: { type: "date" },
          sentAt: { type: "date" },
        },
      },
    });
  } catch (error) {
    const cause = error as { meta?: { body?: { error?: { type?: string } } } };
    if (cause.meta?.body?.error?.type !== "resource_already_exists_exception") throw error;
  }
}
