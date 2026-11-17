import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

/**
 * Repairs vote numbers that were precision-degraded by Excel scientific
 * notation (rounded to 6 significant digits, e.g. 4520151100655 became
 * 4520150000000). A degraded vote is replaced only when exactly ONE
 * registered CostCentre vote rounds to the same value — ambiguous or
 * unmatched votes are left untouched and reported.
 *
 * Safe to re-run after adding new votes to the registry.
 */
const prisma = new PrismaClient();

export function roundTo6Sig(v: string | number): string | null {
    const n = Number(v);
    if (!isFinite(n) || n <= 0) return null;
    const exp = Math.floor(Math.log10(n));
    const factor = Math.pow(10, exp - 5);
    return String(Math.round(n / factor) * factor);
}

async function main() {
    const ccs = await prisma.costCentre.findMany({ select: { voteNo: true } });
    const byRounded: Record<string, string[]> = {};
    for (const { voteNo } of ccs) {
        const key = roundTo6Sig(voteNo);
        if (!key || key === voteNo) continue; // vote is its own rounding → nothing to repair toward
        (byRounded[key] = byRounded[key] || []).push(voteNo);
    }

    const degraded = await prisma.$queryRawUnsafe(
        `SELECT DISTINCT transVoteNo FROM FuelTransaction WHERE transVoteNo LIKE '%0000000' AND transVoteNo != ''`
    ) as { transVoteNo: string }[];

    let repairedVotes = 0, repairedRows = 0;
    const skipped: string[] = [];

    for (const { transVoteNo } of degraded) {
        const candidates = byRounded[transVoteNo] || [];
        if (candidates.length === 1) {
            const rows = await prisma.$executeRawUnsafe(
                `UPDATE FuelTransaction SET transVoteNo = ? WHERE transVoteNo = ?`,
                candidates[0], transVoteNo
            );
            console.log(`${transVoteNo} → ${candidates[0]} (${rows} rows)`);
            repairedVotes++;
            repairedRows += rows;
        } else {
            skipped.push(`${transVoteNo} (${candidates.length === 0 ? 'no registry match' : 'ambiguous: ' + candidates.join(', ')})`);
        }
    }

    console.log(`\nRepaired ${repairedVotes} distinct votes across ${repairedRows} transactions.`);
    if (skipped.length) {
        console.log(`Left untouched (${skipped.length}):`);
        skipped.forEach(s => console.log('  - ' + s));
    }
}

main().finally(() => prisma.$disconnect());
