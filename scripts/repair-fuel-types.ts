import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

/**
 * Backfills FuelTransaction.fuelType where it was stored as "Unknown".
 *
 * Fallout from the tank-number padding bug: ingestion looked the fuel type up by
 * tank id, and a padded id ("937      ") missed every TankDefinition key, so the
 * row was written as Unknown. storeNo is now trimmed on write and backfilled, so
 * the tank identifies the fuel again.
 *
 * This matters beyond tidiness — getConsumptionSummary counts petrol and diesel
 * and nothing else, so Unknown rows were being dropped from summary totals
 * entirely rather than merely mislabelled.
 *
 *   npx tsx scripts/repair-fuel-types.ts --dry
 *   npx tsx scripts/repair-fuel-types.ts
 *
 * Idempotent: only rows still reading Unknown whose tank is known are touched.
 */
const prisma = new PrismaClient();

async function main() {
    const dry = process.argv.includes('--dry');

    const plan = await prisma.$queryRawUnsafe(`
        SELECT trim(t.storeNo) AS tank, td.fuelType AS resolved, COUNT(*) AS n, ROUND(SUM(t.transQty)) AS litres
        FROM FuelTransaction t
        JOIN TankDefinition td ON trim(t.storeNo) = td.tankNo
        WHERE t.fuelType = 'Unknown'
        GROUP BY tank, resolved
        ORDER BY n DESC
    `) as { tank: string; resolved: string; n: number | bigint; litres: number }[];

    const unresolved = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*) AS n FROM FuelTransaction t
        LEFT JOIN TankDefinition td ON trim(t.storeNo) = td.tankNo
        WHERE t.fuelType = 'Unknown' AND td.tankNo IS NULL
    `) as { n: number | bigint }[];

    if (plan.length === 0) {
        console.log('Nothing to repair — no Unknown rows resolve to a known tank.');
        return;
    }

    const total = plan.reduce((s, p) => s + Number(p.n), 0);
    console.log(`Resolvable Unknown rows: ${total}`);
    for (const p of plan) {
        console.log(`  tank ${p.tank.padEnd(4)} -> ${p.resolved.padEnd(16)} ${String(Number(p.n)).padStart(5)} rows, ${Number(p.litres).toLocaleString()} L`);
    }
    if (Number(unresolved[0].n) > 0) {
        console.log(`  (${Number(unresolved[0].n)} left as Unknown — their tank is not in TankDefinition)`);
    }

    if (dry) { console.log('\n[DRY RUN] No changes written.'); return; }

    const changed = await prisma.$executeRawUnsafe(`
        UPDATE FuelTransaction
        SET fuelType = (SELECT td.fuelType FROM TankDefinition td WHERE td.tankNo = trim(FuelTransaction.storeNo))
        WHERE fuelType = 'Unknown'
          AND EXISTS (SELECT 1 FROM TankDefinition td WHERE td.tankNo = trim(FuelTransaction.storeNo))
    `);
    console.log(`\nRepaired ${changed} rows.`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
