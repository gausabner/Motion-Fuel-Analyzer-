import { prisma } from "@/lib/prisma";
import { txFilters, type TxFilterOpts } from "@/lib/analytics";
import { buildPrefixDivisionMap, suggestTarget } from "@/lib/vote-resolution";

/**
 * Which cost centre(s) a fleet unit's fuel is booked to.
 *
 * There is no Vehicle→CostCentre link in the schema: a unit's department is
 * *derived* from the Issue Votes on its transactions
 * (FuelTransaction.transVoteNo → CostCentre.voteNo). A unit is therefore
 * "unassigned" when the votes it books to aren't registered — and assigning it
 * means registering that vote, which necessarily applies to every other unit
 * using the same vote.
 */

export type UnitVoteRow = {
    voteNo: string;
    department: string | null;   // null = vote not registered in CostCentre
    division: string | null;
    txns: number;
    litres: number;
    /** Prefix-derived suggestion, only set for unregistered votes. */
    suggestedDepartment?: string | null;
    suggestedDivision?: string | null;
};

export type UnitAttribution = {
    unitNo: string;
    /** Total litres across every vote, used to rank units. */
    litres: number;
    votes: UnitVoteRow[];
    /** Highest-litre resolved department/division. */
    primary: { department: string; division: string } | null;
    unresolved: UnitVoteRow[];
    departments: string[];
    status: "assigned" | "partial" | "unassigned";
};

export type AttributionResult = {
    query: string;
    matchedCount: number;
    /** Full detail; populated only when exactly one unit matched. */
    unit: UnitAttribution | null;
    /**
     * Every matched unit, ranked so the ones needing attention come first.
     * Lets a multi-unit search still be listed and exported.
     */
    units: UnitAttribution[];
    summary: { units: number; departments: number; unassignedUnits: number };
};

/**
 * Attribution for the unit(s) matching a vehicle search.
 *
 * Deliberately honours date + fuel type but NOT department/division: the point
 * is to reveal which department a unit belongs to, and filtering by department
 * would beg the question (and would hide unregistered votes entirely, since
 * those have no CostCentre row to match).
 */
export async function getVehicleAttribution(
    vehicleId: string,
    opts: TxFilterOpts = {}
): Promise<AttributionResult | null> {
    const query = String(vehicleId || "").trim();
    if (!query) return null;

    const { clause, params } = txFilters({
        from: opts.from, to: opts.to, fuelType: opts.fuelType, vehicleId: query,
    });

    const rows = await prisma.$queryRawUnsafe(`
        SELECT vehicleId, transVoteNo, c.department as department, c.division as division,
               COUNT(id) as txns, SUM(transQty) as litres
        FROM FuelTransaction
        LEFT JOIN CostCentre c ON transVoteNo = c.voteNo
        WHERE transType = 'FIS'${clause}
        GROUP BY vehicleId, transVoteNo, c.department, c.division
    `, ...params) as any[];

    if (rows.length === 0) {
        return { query, matchedCount: 0, unit: null, units: [], summary: { units: 0, departments: 0, unassignedUnits: 0 } };
    }

    // Group rows per unit.
    const byUnit = new Map<string, UnitVoteRow[]>();
    for (const r of rows) {
        const unit = r.vehicleId || "UNKNOWN";
        const list = byUnit.get(unit) || [];
        list.push({
            voteNo: r.transVoteNo || "",
            department: r.department ?? null,
            division: r.division ?? null,
            txns: Number(r.txns || 0),
            litres: Number(r.litres || 0),
        });
        byUnit.set(unit, list);
    }

    // Prefix suggestions are only needed when something is actually unresolved.
    const hasUnresolved = rows.some(r => !r.department);
    const prefixMap = hasUnresolved ? await buildPrefixDivisionMap() : {};

    const build = (unitNo: string, votes: UnitVoteRow[]): UnitAttribution => {
        for (const v of votes) {
            if (!v.department && v.voteNo) {
                const t = suggestTarget(v.voteNo, prefixMap);
                v.suggestedDepartment = t?.department ?? null;
                v.suggestedDivision = t?.division ?? null;
            }
        }
        votes.sort((a, b) => b.litres - a.litres);

        const resolved = votes.filter(v => v.department);
        const unresolved = votes.filter(v => !v.department);
        const top = resolved[0];
        const departments = Array.from(new Set(resolved.map(v => v.department as string)));

        return {
            unitNo,
            litres: votes.reduce((sum, v) => sum + v.litres, 0),
            votes,
            primary: top ? { department: top.department as string, division: top.division || "Unknown" } : null,
            unresolved,
            departments,
            status: unresolved.length === 0 ? "assigned" : (resolved.length === 0 ? "unassigned" : "partial"),
        };
    };

    const units = [...byUnit.entries()].map(([u, v]) => build(u, v));
    // Unresolved units first, then by volume — the ones worth acting on lead.
    const rank = (u: UnitAttribution) => (u.status === "assigned" ? 1 : 0);
    units.sort((a, b) => rank(a) - rank(b) || b.litres - a.litres);
    const allDepts = new Set<string>();
    for (const u of units) u.departments.forEach(d => allDepts.add(d));

    return {
        query,
        matchedCount: units.length,
        // Full detail only for an unambiguous single match; otherwise a summary.
        unit: units.length === 1 ? units[0] : null,
        units,
        summary: {
            units: units.length,
            departments: allDepts.size,
            unassignedUnits: units.filter(u => u.status !== "assigned").length,
        },
    };
}
