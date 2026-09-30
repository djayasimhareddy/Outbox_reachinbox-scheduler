import { Client } from "@elastic/elasticsearch";
import { config } from "../config";

export const es = config.ELASTIC_URL ? new Client({ node: config.ELASTIC_URL }) : null;
export const EMAIL_INDEX = "emails";

export async function ensureIndex(): Promise<void> {
  if (!es) return;
  try {
    const exists = await es.indices.exists({ index: EMAIL_INDEX });
    if (exists) return;
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
    if (cause.meta?.body?.error?.type !== "resource_already_exists_exception") {
      console.error("ES index setup failed (non-fatal):", error instanceof Error ? error.message : error);
    }
  }
}
