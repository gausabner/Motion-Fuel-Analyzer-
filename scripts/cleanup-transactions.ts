import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

/**
 * Two clean-ups, both reversible only from a backup — take one first.
 *
 * 1. Rows with an impossible transDate (before 2020). These came from a single
 *    malformed workbook whose Date column held Excel serials mixed with
 *    reference codes, so the serial branch produced dates in 1909-1995.
 *
 * 2. Cross-upload duplicates. The same report was uploaded twice months apart;
 *    the unique index includes issueTime, which was blank in one copy and
 *    populated in the other, so both rows were inserted. Groups confined to a
 *    SINGLE ingest run are left alone — a file may legitimately contain a
 *    repeated transaction, and only duplication ACROSS runs is provably an
 *    accident. The surviving copy is the one carrying an issueTime.
 *
 *   npx tsx scripts/cleanup-transactions.ts --dry
 *   npx tsx scripts/cleanup-transactions.ts
 */
const prisma = new PrismaClient();

const GROUP = `substr(transDate,1,10), trim(transRefNo), vehicleId, transQty, transVoteNo`;

async function main() {
    const dry = process.argv.includes('--dry');
    const before = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) n, ROUND(SUM(transQty)) q FROM FuelTransaction WHERE transType='FIS'`
    ) as { n: number | bigint; q: number }[];
    console.log(`FIS before: ${Number(before[0].n).toLocaleString()} rows, ${Number(before[0].q).toLocaleString()} L\n`);

    // --- 1. impossible dates -------------------------------------------------
    const junk = await prisma.$queryRawUnsafe(`
        SELECT substr(transDate,1,4) yr, COUNT(*) n, ROUND(SUM(transQty)) q
        FROM FuelTransaction WHERE transDate < '2020-01-01' GROUP BY yr ORDER BY yr
    `) as { yr: string; n: number | bigint; q: number }[];
    const junkRows = junk.reduce((s, r) => s + Number(r.n), 0);
    console.log(`1. Impossible dates: ${junkRows} rows`);
    for (const j of junk) console.log(`     ${j.yr}  ${Number(j.n)} rows, ${Number(j.q)} L`);

    // --- 2. cross-upload duplicates -----------------------------------------
    const dupPlan = await prisma.$queryRawUnsafe(`
        WITH grp AS (
            SELECT ${GROUP}, COUNT(*) c, COUNT(DISTINCT createdAt) runs
            FROM FuelTransaction WHERE transType='FIS'
            GROUP BY ${GROUP} HAVING c > 1
        )
        SELECT SUM(CASE WHEN runs > 1 THEN c - 1 ELSE 0 END) removable,
               SUM(CASE WHEN runs = 1 THEN c - 1 ELSE 0 END) kept_same_run
        FROM grp
    `) as { removable: number | bigint; kept_same_run: number | bigint }[];
    console.log(`\n2. Cross-upload duplicates: ${Number(dupPlan[0].removable).toLocaleString()} rows to remove`);
    console.log(`   (${Number(dupPlan[0].kept_same_run)} same-run repeats left untouched — possibly genuine)`);

    if (dry) { console.log('\n[DRY RUN] No changes written.'); return; }

    const delJunk = await prisma.$executeRawUnsafe(
        `DELETE FROM FuelTransaction WHERE transDate < '2020-01-01'`
    );
    console.log(`\nRemoved ${delJunk} impossible-date rows.`);

    // Keep the most complete copy: one carrying an issueTime, else the earliest.
    const delDup = await prisma.$executeRawUnsafe(`
        DELETE FROM FuelTransaction WHERE rowid IN (
            SELECT rid FROM (
                SELECT t.rowid AS rid,
                       ROW_NUMBER() OVER (
                           PARTITION BY substr(t.transDate,1,10), trim(t.transRefNo), t.vehicleId, t.transQty, t.transVoteNo
                           ORDER BY CASE WHEN trim(COALESCE(t.issueTime,'')) = '' THEN 1 ELSE 0 END, t.createdAt
                       ) AS rn
                FROM FuelTransaction t
                WHERE t.transType = 'FIS'
                  AND EXISTS (
                      SELECT 1 FROM FuelTransaction g
                      WHERE g.transType = 'FIS'
                        AND substr(g.transDate,1,10) = substr(t.transDate,1,10)
                        AND trim(g.transRefNo) = trim(t.transRefNo)
                        AND g.vehicleId = t.vehicleId AND g.transQty = t.transQty
                        AND g.transVoteNo = t.transVoteNo
                      GROUP BY substr(g.transDate,1,10), trim(g.transRefNo), g.vehicleId, g.transQty, g.transVoteNo
                      HAVING COUNT(DISTINCT g.createdAt) > 1
                  )
            ) WHERE rn > 1
        )
    `);
    console.log(`Removed ${delDup} duplicate rows.`);

    const after = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) n, ROUND(SUM(transQty)) q FROM FuelTransaction WHERE transType='FIS'`
    ) as { n: number | bigint; q: number }[];
    console.log(`\nFIS after: ${Number(after[0].n).toLocaleString()} rows, ${Number(after[0].q).toLocaleString()} L`);
    console.log(`Net change: ${(Number(after[0].n) - Number(before[0].n)).toLocaleString()} rows, ${(Number(after[0].q) - Number(before[0].q)).toLocaleString()} L`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
