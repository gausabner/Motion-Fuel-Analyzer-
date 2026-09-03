import { prisma } from "@/lib/prisma";

/**
 * A vote number is [division][fund]: a DIVISION segment followed by a fixed
 * 7-digit FUND/project segment that varies for the same division. Division
 * segments are not a fixed width — real codes run 12 or 13 digits, giving 5- or
 * 6-digit divisions:
 *
 *     51005  1100655   (12 digits: 5-digit division)
 *     450010 1100655   (13 digits: 6-digit division)
 *
 * So the division is anchored to the END, not the start. Taking a fixed 7 from
 * the LEFT (as this once did) pulls the first digit of the fund segment into the
 * prefix, which silently splits one division into several — e.g. 1000250 vs
 * 1000251 are the same division with different funds.
 *
 * When an unregistered vote's division segment maps to exactly ONE registered
 * division, we can safely resolve it: the fuel belongs to that division whatever
 * its fund segment. Ambiguous prefixes are always refused.
 *
 * Resolution never touches the transaction: we register a CostCentre row for
 * the unresolved vote pointing at the same division, tagged `derivedFrom` (the
 * canonical vote it was inferred from) so it stays auditable and reversible.
 */

const FUND_SUFFIX_LEN = 7;

/** Vote numbers are digits only; some registry rows carry stray whitespace. */
export function normaliseVoteNo(voteNo: string): string {
    return String(voteNo ?? "").replace(/\s+/g, "");
}

function prefixOf(voteNo: string): string | null {
    const digits = normaliseVoteNo(voteNo);
    // Needs at least one division digit on top of the fund segment.
    if (digits.length <= FUND_SUFFIX_LEN) return null;
    return digits.slice(0, digits.length - FUND_SUFFIX_LEN);
}

export type PrefixTarget = { department: string; division: string; canonical: string };

/**
 * Build a map from division prefix → single division target, using only manually
 * registered / seeded cost centres (never derived ones, to avoid chaining). A
 * prefix that maps to more than one division is omitted (ambiguous = unsafe).
 */
export async function buildPrefixDivisionMap(): Promise<Record<string, PrefixTarget>> {
    const ccs = await prisma.costCentre.findMany({
        where: { derivedFrom: null },
        select: { voteNo: true, division: true, department: true },
    });

    const byPrefix: Record<string, Map<string, PrefixTarget>> = {};
    for (const cc of ccs) {
        const pfx = prefixOf(cc.voteNo);
        if (!pfx) continue;
        const key = `${cc.department}||${cc.division}`;
        (byPrefix[pfx] = byPrefix[pfx] || new Map()).set(key, {
            department: cc.department,
            division: cc.division,
            canonical: normaliseVoteNo(cc.voteNo),
        });
    }

    const map: Record<string, PrefixTarget> = {};
    for (const [pfx, targets] of Object.entries(byPrefix)) {
        if (targets.size === 1) map[pfx] = [...targets.values()][0];
    }
    return map;
}

/**
 * Prefix-based suggestion for a single unregistered vote, against a map from
 * buildPrefixDivisionMap(). Returns null when the prefix is unknown or ambiguous.
 */
export function suggestTarget(voteNo: string, map: Record<string, PrefixTarget>): PrefixTarget | null {
    const pfx = prefixOf(voteNo);
    return pfx ? (map[pfx] ?? null) : null;
}

export type UnassignedVote = {
    voteNo: string;
    txns: number;
    litres: number;
    suggestedDepartment: string | null;
};

/**
 * The worklist for the review queue: distinct FIS votes that still don't match
 * any cost-centre, ranked by transaction volume, each with a best-effort
 * department suggestion (the shortest leading-digit family — 4 then 3 digits —
 * that maps to exactly one registered department). Suggestion is a hint only.
 */
export async function getUnassignedVotes(): Promise<UnassignedVote[]> {
    const rows = await prisma.$queryRawUnsafe(`
        SELECT t.transVoteNo AS voteNo, COUNT(*) AS txns, ROUND(SUM(t.transQty)) AS litres
        FROM FuelTransaction t
        LEFT JOIN CostCentre c ON t.transVoteNo = c.voteNo
        WHERE t.transType = 'FIS' AND t.transVoteNo != '' AND c.voteNo IS NULL
        GROUP BY t.transVoteNo
        ORDER BY txns DESC
    `) as { voteNo: string; txns: number | bigint; litres: number | bigint }[];

    // department-family maps by leading 4 and 3 digits (registered entries only)
    const ccs = await prisma.costCentre.findMany({
        where: { derivedFrom: null },
        select: { voteNo: true, department: true },
    });
    const fam = (len: number) => {
        const m: Record<string, Set<string>> = {};
        for (const c of ccs) {
            const k = c.voteNo.slice(0, len);
            (m[k] = m[k] || new Set()).add(c.department);
        }
        return m;
    };
    const fam4 = fam(4);
    const fam3 = fam(3);
    const suggest = (vote: string): string | null => {
        for (const [len, map] of [[4, fam4], [3, fam3]] as [number, Record<string, Set<string>>][]) {
            const set = map[vote.slice(0, len)];
            if (set && set.size === 1) return [...set][0];
        }
        return null;
    };

    return rows.map(r => ({
        voteNo: r.voteNo,
        txns: Number(r.txns),
        litres: Number(r.litres),
        suggestedDepartment: suggest(r.voteNo),
    }));
}

/** Summary for the dashboard badge. */
export async function getUnassignedSummary(): Promise<{ codes: number; txns: number; litres: number }> {
    const rows = await prisma.$queryRawUnsafe(`
        SELECT COUNT(DISTINCT t.transVoteNo) AS codes, COUNT(*) AS txns, ROUND(SUM(t.transQty)) AS litres
        FROM FuelTransaction t
        LEFT JOIN CostCentre c ON t.transVoteNo = c.voteNo
        WHERE t.transType = 'FIS' AND t.transVoteNo != '' AND c.voteNo IS NULL
    `) as { codes: number | bigint; txns: number | bigint; litres: number | bigint }[];
    const r = rows[0] || { codes: 0, txns: 0, litres: 0 };
    return { codes: Number(r.codes), txns: Number(r.txns), litres: Number(r.litres || 0) };
}

export type ResolutionResult = {
    created: { voteNo: string; department: string; division: string; derivedFrom: string }[];
    skippedAmbiguous: string[];
    skippedNoPrefix: string[];
};

/**
 * For the given vote numbers, register a derived CostCentre for any that are
 * currently unresolved but whose division prefix maps uniquely to a division.
 * Idempotent: votes that already have a CostCentre are left untouched.
 */
export async function resolveVotesByPrefix(voteNos: string[]): Promise<ResolutionResult> {
    const distinct = [...new Set(voteNos.map(v => String(v || "").trim()).filter(Boolean))];
    const result: ResolutionResult = { created: [], skippedAmbiguous: [], skippedNoPrefix: [] };
    if (distinct.length === 0) return result;

    // Which are already registered?
    const existing = await prisma.costCentre.findMany({
        where: { voteNo: { in: distinct } },
        select: { voteNo: true },
    });
    const known = new Set(existing.map(e => e.voteNo));
    const unresolved = distinct.filter(v => !known.has(v));
    if (unresolved.length === 0) return result;

    const prefixMap = await buildPrefixDivisionMap();

    // Track which prefixes exist at all (to distinguish "ambiguous" from "no prefix in registry")
    const allPrefixes = new Set(
        (await prisma.costCentre.findMany({ where: { derivedFrom: null }, select: { voteNo: true } }))
            .map(c => prefixOf(c.voteNo))
            .filter(Boolean) as string[]
    );

    for (const voteNo of unresolved) {
        const pfx = prefixOf(voteNo);
        if (!pfx) { result.skippedNoPrefix.push(voteNo); continue; }
        const target = prefixMap[pfx];
        if (!target) {
            if (allPrefixes.has(pfx)) result.skippedAmbiguous.push(voteNo);
            else result.skippedNoPrefix.push(voteNo);
            continue;
        }
        await prisma.costCentre.create({
            data: {
                voteNo,
                division: target.division,
                department: target.department,
                derivedFrom: target.canonical,
            },
        });
        result.created.push({
            voteNo,
            department: target.department,
            division: target.division,
            derivedFrom: target.canonical,
        });
    }

    return result;
}
