import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

/**
 * Trims whitespace from FuelTransaction.storeNo.
 *
 * The source pads tank numbers inconsistently, so "937" and "937       " were
 * stored as separate tanks — 28 distinct ids that are really 20. Every per-tank
 * figure was split across the two spellings (tank 937 read 564,442 L instead of
 * its true 860,790 L), and any FIS-to-delivery pairing is per tank.
 *
 * lib/ingestion.ts now trims on write; this backfills what is already stored.
 *
 *   npx tsx scripts/repair-tank-numbers.ts --dry
 *   npx tsx scripts/repair-tank-numbers.ts
 *
 * Idempotent: only rows where storeNo differs from its trimmed form are touched.
 */
const prisma = new PrismaClient();

async function main() {
    const dry = process.argv.includes('--dry');

    const before = await prisma.$queryRawUnsafe(`
        SELECT COUNT(DISTINCT storeNo) raw, COUNT(DISTINCT trim(storeNo)) trimmed FROM FuelTransaction
    `) as { raw: number | bigint; trimmed: number | bigint }[];
    console.log(`Distinct tank ids: ${Number(before[0].raw)} stored, ${Number(before[0].trimmed)} once trimmed`);

    const affected = await prisma.$queryRawUnsafe(`
        SELECT storeNo, COUNT(*) c FROM FuelTransaction
        WHERE storeNo <> trim(storeNo) GROUP BY storeNo ORDER BY c DESC
    `) as { storeNo: string; c: number | bigint }[];

    if (affected.length === 0) {
        console.log('Nothing to repair — every storeNo is already trimmed.');
        return;
    }
    console.log(`\nPadded ids to fix: ${affected.length}`);
    for (const a of affected) console.log(`  "${a.storeNo}" -> "${a.storeNo.trim()}"  ${Number(a.c)} rows`);

    if (dry) { console.log('\n[DRY RUN] No changes written.'); return; }

    const res = await prisma.$executeRawUnsafe(`
        UPDATE FuelTransaction SET storeNo = trim(storeNo) WHERE storeNo <> trim(storeNo)
    `);
    console.log(`\nRepaired ${res} rows.`);

    const after = await prisma.$queryRawUnsafe(`
        SELECT COUNT(DISTINCT storeNo) raw FROM FuelTransaction
    `) as { raw: number | bigint }[];
    console.log(`Distinct tank ids now: ${Number(after[0].raw)}`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
