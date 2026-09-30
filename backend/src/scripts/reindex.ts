import { prisma } from "../lib/prisma";
import { ensureIndex } from "../lib/elastic";
import { indexEmailIds } from "../services/search.service";

async function main(): Promise<void> {
  try {
    await ensureIndex();
    const rows = await prisma.email.findMany({ select: { id: true } });
    await indexEmailIds(rows.map((row) => row.id));
    console.log(`Reindexed ${rows.length} emails`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Reindex failed:", error);
  process.exitCode = 1;
});
