import type { estypes } from "@elastic/elasticsearch";
import { prisma } from "../lib/prisma";
import { es, EMAIL_INDEX } from "../lib/elastic";

interface EmailSearchDocument {
  id: string;
  userId: string;
  toEmail: string;
  senderEmail: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: Date;
  sentAt: Date | null;
}

// Re-reads Postgres rows before indexing. Search indexing is best-effort.
export async function indexEmailIds(ids: string[]): Promise<void> {
  try {
    const chunkSize = 500;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const rows = await prisma.email.findMany({
        where: { id: { in: ids.slice(i, i + chunkSize) } },
        include: { sender: { select: { email: true } } },
      });
      if (!rows.length) continue;

      const operations: Array<estypes.BulkOperationContainer | EmailSearchDocument> = [];
      for (const row of rows) {
        operations.push({ index: { _index: EMAIL_INDEX, _id: row.id } });
        operations.push({
          id: row.id,
          userId: row.userId,
          toEmail: row.toEmail,
          senderEmail: row.sender.email,
          subject: row.subject,
          body: row.body,
          status: row.status,
          scheduledAt: row.scheduledAt,
          sentAt: row.sentAt,
        });
      }
      const result = await es.bulk({ operations });
      if (result.errors) {
        const failedItems = result.items.filter((item) => {
          const operation = item.index ?? item.create ?? item.update ?? item.delete;
          return operation?.error !== undefined;
        }).length;
        console.error(`ES bulk had ${failedItems} item error(s)`);
      }
    }
  } catch (error) {
    console.error("ES index error (non-fatal):", error instanceof Error ? error.message : error);
  }
}
