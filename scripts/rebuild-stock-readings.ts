/**
 * Read stock on hand ("Tot on Hand Qty") from every stores report (HR440)
 * already uploaded, replacing what is stored. Safe to run again: it only
 * writes StockReading rows and never touches transactions.
 *
 *   npx tsx scripts/rebuild-stock-readings.ts
 */
import "dotenv/config";
import { rebuildStockReadings } from "@/lib/stock-readings";
import { prisma } from "@/lib/prisma";

rebuildStockReadings()
    .then(r => console.log(`Read stock on hand from ${r.files} uploaded file(s): ${r.readings} tank-day readings.`))
    .catch(e => { console.error(e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
