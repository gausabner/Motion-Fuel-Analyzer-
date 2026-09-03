import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

/**
 * Step 1 backfill — resolves FIS transactions whose Issue Vote isn't registered
 * but whose 7-digit division prefix maps unambiguously to one registered
 * division. Registers a derived CostCentre for each (never touches the
 * transaction). Idempotent and reversible:
 *
 *   npx tsx scripts/resolve-votes-by-prefix.ts          # apply
 *   npx tsx scripts/resolve-votes-by-prefix.ts --dry    # preview only
 *   npx tsx scripts/resolve-votes-by-prefix.ts --revert # remove derived rows
 *
 * Mirrors lib/vote-resolution.ts so ingestion and backfill behave identically.
 */
const prisma = new PrismaClient();
const PREFIX_LEN = 7;
const prefixOf = (v: string) => (v && v.length >= PREFIX_LEN ? v.slice(0, PREFIX_LEN) : null);

async function buildPrefixMap() {
    const ccs = await prisma.costCentre.findMany({
        where: { derivedFrom: null },
        select: { voteNo: true, division: true, department: true },
    });
    const byPrefix: Record<string, Map<string, { department: string; division: string; canonical: string }>> = {};
    for (const cc of ccs) {
        const pfx = prefixOf(cc.voteNo);
        if (!pfx) continue;
        const key = `${cc.department}||${cc.division}`;
        (byPrefix[pfx] = byPrefix[pfx] || new Map()).set(key, { department: cc.department, division: cc.division, canonical: cc.voteNo });
    }
    const map: Record<string, { department: string; division: string; canonical: string }> = {};
    const allPrefixes = new Set(Object.keys(byPrefix));
    for (const [pfx, t] of Object.entries(byPrefix)) if (t.size === 1) map[pfx] = [...t.values()][0];
    return { map, allPrefixes };
}

async function main() {
    const args = process.argv.slice(2);
    const dry = args.includes('--dry');
    const revert = args.includes('--revert');

    if (revert) {
        const toRemove = await prisma.costCentre.count({ where: { derivedFrom: { not: null } } });
        console.log(`Reverting ${toRemove} prefix-derived cost centres…`);
        const r = await prisma.costCentre.deleteMany({ where: { derivedFrom: { not: null } } });
        console.log(`Removed ${r.count}. Transactions untouched (their vote codes were never changed).`);
        return;
    }

    // Distinct FIS votes not currently matching any CostCentre, with impact.
    const unresolved = await prisma.$queryRawUnsafe(`
        SELECT t.transVoteNo AS vote, COUNT(*) AS txns, ROUND(SUM(t.transQty)) AS litres
        FROM FuelTransaction t
        LEFT JOIN CostCentre c ON t.transVoteNo = c.voteNo
        WHERE t.transType = 'FIS' AND t.transVoteNo != '' AND c.voteNo IS NULL
        GROUP BY t.transVoteNo
        ORDER BY txns DESC
    `) as { vote: string; txns: number; litres: number }[];

    const { map, allPrefixes } = await buildPrefixMap();

    const resolvable: { vote: string; txns: number; litres: number; target: any }[] = [];
    const ambiguous: string[] = [];
    const noPrefix: string[] = [];

    for (const u of unresolved) {
        const pfx = prefixOf(u.vote);
        if (!pfx) { noPrefix.push(u.vote); continue; }
        const target = map[pfx];
        if (target) resolvable.push({ ...u, target });
        else if (allPrefixes.has(pfx)) ambiguous.push(u.vote);
        else noPrefix.push(u.vote);
    }

    const txResolvable = resolvable.reduce((s, r) => s + Number(r.txns), 0);
    console.log(`Unresolved FIS votes: ${unresolved.length}`);
    console.log(`  ✓ Prefix-resolvable (unique division): ${resolvable.length} votes / ${txResolvable} txns`);
    console.log(`  · Ambiguous (>1 division):             ${ambiguous.length} votes`);
    console.log(`  · No registered prefix (needs filing): ${noPrefix.length} votes\n`);

    if (resolvable.length) {
        console.log(`${dry ? '[DRY RUN] Would register' : 'Registering'} derived cost centres:`);
        for (const r of resolvable) {
            console.log(`  ${r.vote} → ${r.target.division}  (${r.target.department})  [${Number(r.txns)} txns, ${Number(r.litres)} L, from ${r.target.canonical}]`);
        }
    }

    if (!dry) {
        let created = 0;
        for (const r of resolvable) {
            const exists = await prisma.costCentre.findUnique({ where: { voteNo: r.vote } });
            if (exists) continue;
            await prisma.costCentre.create({
                data: { voteNo: r.vote, division: r.target.division, department: r.target.department, derivedFrom: r.target.canonical },
            });
            created++;
        }
        console.log(`\nDone. Created ${created} derived cost centres → ${txResolvable} transactions now resolve.`);
        console.log(`Reversible with: npx tsx scripts/resolve-votes-by-prefix.ts --revert`);
    } else {
        console.log(`\n[DRY RUN] No changes written.`);
    }
}

main().finally(() => prisma.$disconnect());
