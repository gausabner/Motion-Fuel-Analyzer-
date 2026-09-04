import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

/**
 * Repairs FuelTransaction rows whose transDate was written as epoch
 * milliseconds instead of an ISO-8601 string.
 *
 * Every analytics query filters transDate by STRING comparison, and SQLite
 * sorts all INTEGERs below all TEXT — so an integer-dated row matches no date
 * filter anywhere. Such rows are imported and counted, but invisible across the
 * whole application.
 *
 * They came from a window where ingestion inserted via the Prisma query builder,
 * which serialises DateTime to epoch ms on SQLite. lib/ingestion.ts now writes
 * ISO strings again; this backfills the rows written meanwhile.
 *
 *   npx tsx scripts/repair-transaction-dates.ts --dry   # preview only
 *   npx tsx scripts/repair-transaction-dates.ts         # apply
 *
 * Idempotent: only rows whose stored type is not TEXT are touched.
 */
const prisma = new PrismaClient();

async function main() {
    const dry = process.argv.includes('--dry');

    const broken = await prisma.$queryRawUnsafe(`
        SELECT id, transDate FROM FuelTransaction WHERE typeof(transDate) != 'text'
    `) as { id: string; transDate: number | bigint }[];

    if (broken.length === 0) {
        console.log('Nothing to repair — every transDate is already an ISO string.');
        return;
    }

    const months: Record<string, number> = {};
    const updates: { id: string; iso: string }[] = [];
    for (const row of broken) {
        const ms = Number(row.transDate);
        const d = new Date(ms);
        if (isNaN(d.getTime())) {
            console.warn(`  ! skipping ${row.id}: ${row.transDate} is not a valid timestamp`);
            continue;
        }
        const iso = d.toISOString();
        months[iso.slice(0, 7)] = (months[iso.slice(0, 7)] || 0) + 1;
        updates.push({ id: row.id, iso });
    }

    console.log(`Rows with a non-text transDate: ${broken.length}`);
    console.log('Decoded to:');
    for (const [m, n] of Object.entries(months).sort()) console.log(`  ${m}  ${n} rows`);

    if (dry) {
        console.log('\n[DRY RUN] No changes written.');
        return;
    }

    let done = 0;
    for (const u of updates) {
        await prisma.$executeRaw`UPDATE FuelTransaction SET transDate = ${u.iso} WHERE id = ${u.id}`;
        done++;
    }
    console.log(`\nRepaired ${done} rows. They are now visible to every date filter.`);

    const left = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*) c FROM FuelTransaction WHERE typeof(transDate) != 'text'
    `) as { c: number | bigint }[];
    console.log(`Remaining non-text transDate rows: ${Number(left[0].c)}`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
