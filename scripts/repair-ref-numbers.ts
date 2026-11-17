import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

/**
 * Trims FuelTransaction.transRefNo.
 *
 * The source pads reference numbers ("F01297              "). transRefNo is part
 * of the @@unique key used to skip duplicates on re-upload, so a padded value on
 * one export and a clean one on another would slip past the index — the same
 * class of failure that let a whole report import twice.
 *
 *   npx tsx scripts/repair-ref-numbers.ts --dry
 *   npx tsx scripts/repair-ref-numbers.ts
 */
const prisma = new PrismaClient();

async function main() {
    const dry = process.argv.includes('--dry');
    const [{ n }] = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) n FROM FuelTransaction WHERE transRefNo <> trim(transRefNo)`
    ) as { n: number | bigint }[];
    console.log(`Rows with a padded transRefNo: ${Number(n).toLocaleString()}`);
    if (Number(n) === 0) return;

    // Trimming could collide with an existing row on the unique key; report first.
    const collisions = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*) c FROM (
            SELECT transDate, trim(transRefNo) r, vehicleId, trim(COALESCE(issueTime,'')) t, COUNT(*) n
            FROM FuelTransaction GROUP BY transDate, r, vehicleId, t HAVING n > 1
        )
    `) as { c: number | bigint }[];
    console.log(`Groups that would collide on the unique key after trimming: ${Number(collisions[0].c)}`);

    if (dry) { console.log('[DRY RUN] No changes written.'); return; }
    const done = await prisma.$executeRawUnsafe(
        `UPDATE FuelTransaction SET transRefNo = trim(transRefNo) WHERE transRefNo <> trim(transRefNo)`
    );
    console.log(`Trimmed ${done} rows.`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
