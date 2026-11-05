import { prisma } from "@/lib/prisma";

// transDate is stored as ISO-8601 TEXT (raw INSERT path in ingestion).
// Prisma-native DateTime filters do NOT match these rows on SQLite, so all
// date filtering here uses raw SQL string comparison, matching the dashboard.
function dateCondition(from?: string, to?: string): { clause: string; params: string[] } {
    let clause = '';
    const params: string[] = [];
    if (from) {
        clause += ` AND transDate >= ?`;
        params.push(new Date(from).toISOString());
    }
    if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        clause += ` AND transDate <= ?`;
        params.push(toDate.toISOString());
    }
    return { clause, params };
}

// Full transaction filter set shared by FIS/FRE pages, the Fleet table, and the
// CSV export route so the exported rows always match the on-screen KPIs.
export interface TxFilterOpts {
    from?: string;
    to?: string;
    fuelType?: string;   // "all"/"" = no filter; otherwise LIKE %value%
    vehicleId?: string;  // LIKE %value%
    department?: string; // resolved via CostCentre.voteNo subquery
    division?: string;
}

// Builds the WHERE-clause tail (each condition starts with " AND ...") plus the
// bound params. Column names are unqualified — every referenced column exists on
// FuelTransaction only, and department/division are matched through a CostCentre
// subquery, so this composes onto any `... WHERE transType = 'FIS'` base without
// a JOIN or alias ambiguity.
export function txFilters(opts: TxFilterOpts = {}): { clause: string; params: string[] } {
    const { clause, params } = dateCondition(opts.from, opts.to);
    if (opts.fuelType && opts.fuelType !== 'all') {
        return applyRest({ clause: clause + ` AND fuelType LIKE ?`, params: [...params, `%${opts.fuelType}%`] }, opts);
    }
    return applyRest({ clause, params }, opts);
}

function applyRest(acc: { clause: string; params: string[] }, opts: TxFilterOpts) {
    let { clause } = acc;
    const params = acc.params;
    if (opts.vehicleId) {
        clause += ` AND vehicleId LIKE ?`;
        params.push(`%${opts.vehicleId}%`);
    }
    if (opts.department || opts.division) {
        const conds: string[] = [];
        if (opts.department) { conds.push(`department LIKE ?`); }
        if (opts.division) { conds.push(`division LIKE ?`); }
        clause += ` AND transVoteNo IN (SELECT voteNo FROM CostCentre WHERE ${conds.join(' AND ')})`;
        if (opts.department) params.push(`%${opts.department}%`);
        if (opts.division) params.push(`%${opts.division}%`);
    }
    return { clause, params };
}

export async function getFISData(limit = 100, opts: TxFilterOpts = {}) {
    const { clause, params } = txFilters(opts);
    return await prisma.$queryRawUnsafe(`
        SELECT id, transDate, transVoteNo, vehicleId, storeNo, transQty, transAmt, fuelType
        FROM FuelTransaction
        WHERE transType = 'FIS'${clause}
        ORDER BY transDate DESC
        LIMIT ${Number(limit)}
    `, ...params) as any[];
}

export async function getFREData(limit = 100, opts: TxFilterOpts = {}) {
    const { clause, params } = txFilters(opts);
    return await prisma.$queryRawUnsafe(`
        SELECT id, transDate, transRefNo, transVoteNo, vehicleId, storeNo, transQty, transAmt, fuelType
        FROM FuelTransaction
        WHERE transType = 'FRE'${clause}
        ORDER BY transDate DESC
        LIMIT ${Number(limit)}
    `, ...params) as any[];
}

/**
 * Ingestion writes this placeholder when a transaction carries no fleet unit.
 * It is not a vehicle: it currently holds ~28.5k litres across 78 different
 * votes and would otherwise rank 3rd of 915 "units".
 *
 * It stays in totals and tables — the fuel is real and hiding it would make
 * litres stop reconciling — but it is excluded from rankings and per-unit
 * comparisons, where a placeholder is actively misleading, and labelled in the
 * UI via unitLabel().
 */
export const UNATTRIBUTED_UNIT = "UNKNOWN";

export const isUnattributedUnit = (id: string | null | undefined) =>
    !id || String(id).trim().toUpperCase() === UNATTRIBUTED_UNIT;

/** Display name for a fleet unit id. */
export const unitLabel = (id: string | null | undefined) =>
    isUnattributedUnit(id) ? "Unattributed" : String(id);

export interface FleetUnit {
    id: string;
    petrolVolume: number;
    dieselVolume: number;
    totalCost: number;
    transactionCount: number;
}

// Per-vehicle FIS performance (petrol/diesel litres, cost, fills), honouring the
// full filter set. Single source of truth for the Fleet page table and its CSV
// export. Sorted by total volume, highest first.
export async function getFleetPerformance(opts: TxFilterOpts = {}): Promise<FleetUnit[]> {
    const { clause, params } = txFilters(opts);
    const rows = await prisma.$queryRawUnsafe(`
        SELECT vehicleId, fuelType,
               SUM(transQty) as totalQty,
               SUM(transAmt) as totalCost,
               COUNT(id) as transCount
        FROM FuelTransaction
        WHERE transType = 'FIS'${clause}
        GROUP BY vehicleId, fuelType
        ORDER BY vehicleId ASC
    `, ...params) as any[];

    const fleet = rows.reduce((acc: FleetUnit[], curr: any) => {
        const vId = curr.vehicleId || "Unknown";
        let vehicle = acc.find(v => v.id === vId);
        if (!vehicle) {
            vehicle = { id: vId, petrolVolume: 0, dieselVolume: 0, totalCost: 0, transactionCount: 0 };
            acc.push(vehicle);
        }
        if (String(curr.fuelType).toLowerCase().includes('petrol')) {
            vehicle.petrolVolume += curr.totalQty || 0;
        } else {
            vehicle.dieselVolume += curr.totalQty || 0;
        }
        vehicle.totalCost += curr.totalCost || 0;
        vehicle.transactionCount += Number(curr.transCount);
        return acc;
    }, []);

    return fleet.sort((a, b) => (b.petrolVolume + b.dieselVolume) - (a.petrolVolume + a.dieselVolume));
}

export interface DepartmentUnit {
    id: string;            // department name, falling back to vote no, then "Unassigned"
    voteNo: string | null;
    division: string;
    petrolVolume: number;
    dieselVolume: number;
    totalCost: number;
    count: number;
}

// Per-department FIS rollup, honouring the full filter set. Single source of
// truth for the Cost Centres page table and its CSV export. Sorted by spend,
// highest first.
//
// CostCentre supplies the department/division labels via a LEFT JOIN (voteNo is
// its primary key, so the join can only ever add one row per transaction, never
// fan out). None of its columns collide with the FuelTransaction ones referenced
// here, so the unqualified names from txFilters stay unambiguous.
export async function getDepartmentBreakdown(opts: TxFilterOpts = {}): Promise<DepartmentUnit[]> {
    const { clause, params } = txFilters(opts);
    const rows = await prisma.$queryRawUnsafe(`
        SELECT transVoteNo, c.department as department, c.division as division, fuelType,
               SUM(transQty) as totalQty,
               SUM(transAmt) as totalCost,
               COUNT(id) as transCount
        FROM FuelTransaction
        LEFT JOIN CostCentre c ON transVoteNo = c.voteNo
        WHERE transType = 'FIS'${clause}
        GROUP BY transVoteNo, c.department, c.division, fuelType
    `, ...params) as any[];

    const depts = rows.reduce((acc: DepartmentUnit[], curr: any) => {
        // Group by department name where we have one, else by the raw vote no.
        const deptId = curr.department || curr.transVoteNo || "Unassigned";
        let dept = acc.find(d => d.id === deptId);
        if (!dept) {
            dept = {
                id: deptId,
                voteNo: curr.transVoteNo ?? null,
                division: curr.division || "Unassigned",
                petrolVolume: 0,
                dieselVolume: 0,
                totalCost: 0,
                count: 0,
            };
            acc.push(dept);
        }
        if (String(curr.fuelType).toLowerCase().includes('petrol')) {
            dept.petrolVolume += curr.totalQty || 0;
        } else {
            dept.dieselVolume += curr.totalQty || 0;
        }
        dept.totalCost += curr.totalCost || 0;
        dept.count += Number(curr.transCount);
        return acc;
    }, []);

    return depts.sort((a, b) => b.totalCost - a.totalCost);
}

export async function getDailyConsumption(opts: TxFilterOpts = {}) {
    const { clause, params } = txFilters(opts);
    const data = await prisma.$queryRawUnsafe(`
        SELECT transDate, fuelType, SUM(transQty) as volume, SUM(transAmt) as cost
        FROM FuelTransaction
        WHERE transType = 'FIS'${clause}
        GROUP BY transDate, fuelType
        ORDER BY transDate DESC
    `, ...params) as any[];

    return data.map(d => ({
        date: d.transDate,
        fuelType: d.fuelType,
        volume: d.volume || 0,
        cost: d.cost || 0,
    }));
}

export async function getTopFleet(fuelType?: string, opts: TxFilterOpts = {}, limit = 10) {
    // The pinned fuel type is merged last so it always wins over anything in opts.
    const { clause, params } = txFilters(fuelType ? { ...opts, fuelType } : opts);
    // A "top consuming units" list led by the no-unit placeholder is useless.
    const data = await prisma.$queryRawUnsafe(`
        SELECT vehicleId, SUM(transQty) as volume, SUM(transAmt) as cost
        FROM FuelTransaction
        WHERE transType = 'FIS' AND vehicleId != '${UNATTRIBUTED_UNIT}'${clause}
        GROUP BY vehicleId
        ORDER BY volume DESC
        LIMIT ${Number(limit)}
    `, ...params) as any[];

    return data.map(d => ({
        vehicleId: d.vehicleId,
        volume: d.volume || 0,
        cost: d.cost || 0,
    }));
}

export async function getGlobalTotals() {
    const data = await prisma.$queryRawUnsafe(`
        SELECT fuelType, SUM(transQty) as qty
        FROM FuelTransaction
        WHERE transType = 'FIS'
        GROUP BY fuelType
    `) as any[];

    let petrol = 0;
    let diesel = 0;
    for (const d of data) {
        if (String(d.fuelType).toLowerCase().includes('petrol')) petrol += (d.qty || 0);
        else if (String(d.fuelType).toLowerCase().includes('diesel')) diesel += (d.qty || 0);
    }
    return { petrol, diesel };
}

/**
 * Per-Issue-Vote petrol and diesel consumption, joined to the cost-centre registry.
 */
export async function getCostCentreAnalysis(opts: TxFilterOpts = {}) {
    const { clause, params } = txFilters(opts);
    const data = await prisma.$queryRawUnsafe(`
        SELECT transVoteNo, fuelType, SUM(transQty) as qty, SUM(transAmt) as amt
        FROM FuelTransaction
        WHERE transType = 'FIS' AND transVoteNo IS NOT NULL AND transVoteNo != ''${clause}
        GROUP BY transVoteNo, fuelType
    `, ...params) as any[];

    const votes = [...new Set(data.map(d => d.transVoteNo).filter(Boolean))];
    const costCentres = votes.length > 0 ? await prisma.costCentre.findMany({
        where: { voteNo: { in: votes as string[] } }
    }) : [];
    const ccMap = new Map(costCentres.map(c => [c.voteNo, c]));

    const byVote: Record<string, { petrol: number, diesel: number, cost: number, cc: any }> = {};
    for (const d of data) {
        if (!d.transVoteNo) continue;
        if (!byVote[d.transVoteNo]) {
            byVote[d.transVoteNo] = {
                petrol: 0,
                diesel: 0,
                cost: 0,
                cc: ccMap.get(d.transVoteNo) || { voteNo: d.transVoteNo, division: 'Unknown', department: 'Unknown' }
            };
        }
        if (String(d.fuelType).toLowerCase().includes('petrol')) byVote[d.transVoteNo].petrol += (d.qty || 0);
        else byVote[d.transVoteNo].diesel += (d.qty || 0);
        byVote[d.transVoteNo].cost += (d.amt || 0);
    }

    return Object.values(byVote).sort((a, b) => (b.petrol + b.diesel) - (a.petrol + a.diesel));
}

/**
 * Top N highest-consuming Issue Votes for a fuel type.
 */
export async function getTopVotes(fuelType: 'Petrol' | 'Diesel', opts: TxFilterOpts = {}, limit = 10) {
    // The pinned fuel type is merged last so it always wins over anything in opts.
    const { clause, params } = txFilters({ ...opts, fuelType });
    const data = await prisma.$queryRawUnsafe(`
        SELECT transVoteNo, SUM(transQty) as volume, SUM(transAmt) as cost
        FROM FuelTransaction
        WHERE transType = 'FIS' AND transVoteNo IS NOT NULL AND transVoteNo != ''${clause}
        GROUP BY transVoteNo
        ORDER BY volume DESC
        LIMIT ${Number(limit)}
    `, ...params) as any[];

    const votes = data.map(d => d.transVoteNo).filter(Boolean);
    const costCentres = votes.length > 0 ? await prisma.costCentre.findMany({
        where: { voteNo: { in: votes } }
    }) : [];
    const ccMap = new Map(costCentres.map(c => [c.voteNo, c]));

    return data.map(d => {
        const cc = ccMap.get(d.transVoteNo);
        return {
            voteNo: d.transVoteNo,
            division: cc?.division || 'Unknown',
            department: cc?.department || 'Unknown',
            volume: d.volume || 0,
            cost: d.cost || 0,
        };
    });
}

/**
 * Total petrol vs diesel consumption summary for the range.
 */
export async function getConsumptionSummary(opts: TxFilterOpts = {}) {
    const { clause, params } = txFilters(opts);
    const data = await prisma.$queryRawUnsafe(`
        SELECT fuelType, SUM(transQty) as qty, SUM(transAmt) as amt, COUNT(*) as cnt
        FROM FuelTransaction
        WHERE transType = 'FIS'${clause}
        GROUP BY fuelType
    `, ...params) as any[];

    let petrolVolume = 0, dieselVolume = 0, petrolCost = 0, dieselCost = 0;
    let petrolCount = 0, dieselCount = 0;
    for (const d of data) {
        const t = String(d.fuelType).toLowerCase();
        if (t.includes('petrol')) {
            petrolVolume += (d.qty || 0);
            petrolCost += (d.amt || 0);
            petrolCount += Number(d.cnt || 0);
        } else if (t.includes('diesel')) {
            dieselVolume += (d.qty || 0);
            dieselCost += (d.amt || 0);
            dieselCount += Number(d.cnt || 0);
        }
    }
    return { petrolVolume, dieselVolume, petrolCost, dieselCost, petrolCount, dieselCount };
}

export async function getRangeStats(from: string, to: string) {
    const summary = await getConsumptionSummary({ from, to });
    return {
        petrolVolume: summary.petrolVolume,
        dieselVolume: summary.dieselVolume,
        explicitCost: summary.petrolCost + summary.dieselCost
    };
}

// ==========================================================================
// Period comparison — compare two date ranges across a chosen dimension.
// ==========================================================================

export type CompareDimension = "total" | "fuelType" | "fleetUnit" | "department" | "division";
export type Period = { from?: string; to?: string };
export type CompareFilters = {
    fuelType?: string;    // 'Petrol' | 'Diesel' | 'all'
    department?: string;
    division?: string;
    vehicleId?: string;
};

export type CompareRow = {
    key: string;
    aVolume: number; aCost: number; aTxns: number;
    bVolume: number; bCost: number; bTxns: number;
    deltaVolume: number;    // bVolume - aVolume
    deltaPct: number | null; // % change vs A (null when A is 0)
};

export type CompareResult = {
    dimension: CompareDimension;
    rows: CompareRow[];
    totals: {
        aVolume: number; bVolume: number; aCost: number; bCost: number;
        aTxns: number; bTxns: number; deltaVolume: number; deltaPct: number | null;
    };
};

const GROUP_EXPR: Record<CompareDimension, string> = {
    total: `'Fleet total'`,
    fuelType: `CASE WHEN t.fuelType LIKE '%Petrol%' THEN 'Petrol' WHEN t.fuelType LIKE '%Diesel%' THEN 'Diesel' ELSE 'Other' END`,
    fleetUnit: `COALESCE(NULLIF(t.vehicleId, ''), 'Unknown')`,
    department: `COALESCE(c.department, 'Unassigned')`,
    division: `COALESCE(c.division, 'Unassigned')`,
};

function compareFilterClause(filters: CompareFilters): { clause: string; params: string[] } {
    let clause = "";
    const params: string[] = [];
    if (filters.fuelType && filters.fuelType !== "all") {
        clause += ` AND t.fuelType LIKE ?`;
        params.push(`%${filters.fuelType}%`);
    }
    if (filters.vehicleId) {
        clause += ` AND t.vehicleId LIKE ?`;
        params.push(`%${filters.vehicleId}%`);
    }
    if (filters.department) {
        clause += ` AND c.department = ?`;
        params.push(filters.department);
    }
    if (filters.division) {
        clause += ` AND c.division = ?`;
        params.push(filters.division);
    }
    return { clause, params };
}

async function periodAggregates(dimension: CompareDimension, period: Period, filters: CompareFilters) {
    const { clause: dateClause, params: dateParams } = dateCondition(period.from, period.to);
    const { clause: filterClause, params: filterParams } = compareFilterClause(filters);
    const groupExpr = GROUP_EXPR[dimension];

    const rows = await prisma.$queryRawUnsafe(`
        SELECT ${groupExpr} AS key,
               SUM(t.transQty) AS volume,
               SUM(t.transAmt) AS cost,
               COUNT(*) AS txns
        FROM FuelTransaction t
        LEFT JOIN CostCentre c ON t.transVoteNo = c.voteNo
        WHERE t.transType = 'FIS'${dateClause}${filterClause}
        GROUP BY ${groupExpr}
    `, ...dateParams, ...filterParams) as { key: string; volume: number; cost: number; txns: number | bigint }[];

    const map = new Map<string, { volume: number; cost: number; txns: number }>();
    for (const r of rows) {
        map.set(r.key, { volume: r.volume || 0, cost: r.cost || 0, txns: Number(r.txns) });
    }
    return map;
}

export async function getPeriodComparison(
    dimension: CompareDimension,
    periodA: Period,
    periodB: Period,
    filters: CompareFilters = {},
): Promise<CompareResult> {
    const [a, b] = await Promise.all([
        periodAggregates(dimension, periodA, filters),
        periodAggregates(dimension, periodB, filters),
    ]);

    const keys = new Set<string>([...a.keys(), ...b.keys()]);
    const rows: CompareRow[] = [];
    for (const key of keys) {
        const av = a.get(key) || { volume: 0, cost: 0, txns: 0 };
        const bv = b.get(key) || { volume: 0, cost: 0, txns: 0 };
        const deltaVolume = bv.volume - av.volume;
        const deltaPct = av.volume > 0 ? (deltaVolume / av.volume) * 100 : null;
        rows.push({
            key,
            aVolume: av.volume, aCost: av.cost, aTxns: av.txns,
            bVolume: bv.volume, bCost: bv.cost, bTxns: bv.txns,
            deltaVolume, deltaPct,
        });
    }
    // Rank by the larger of the two period volumes so movers surface regardless of direction.
    rows.sort((x, y) => Math.max(y.bVolume, y.aVolume) - Math.max(x.bVolume, x.aVolume));

    const totals = rows.reduce((acc, r) => {
        acc.aVolume += r.aVolume; acc.bVolume += r.bVolume;
        acc.aCost += r.aCost; acc.bCost += r.bCost;
        acc.aTxns += r.aTxns; acc.bTxns += r.bTxns;
        return acc;
    }, { aVolume: 0, bVolume: 0, aCost: 0, bCost: 0, aTxns: 0, bTxns: 0 });
    const totDeltaVolume = totals.bVolume - totals.aVolume;
    const totDeltaPct = totals.aVolume > 0 ? (totDeltaVolume / totals.aVolume) * 100 : null;

    return {
        dimension,
        rows,
        totals: { ...totals, deltaVolume: totDeltaVolume, deltaPct: totDeltaPct },
    };
}
