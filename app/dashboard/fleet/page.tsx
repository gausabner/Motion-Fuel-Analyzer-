import { prisma } from "@/lib/prisma";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Truck, TrendingUp, AlertTriangle } from "lucide-react";
import { IndustrialKPI } from "@/components/dashboard/IndustrialKPI";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { getFleetPerformance, isUnattributedUnit, unitLabel } from "@/lib/analytics";
import { TablePagination } from "@/components/dashboard/TablePagination";
import { paginate } from "@/lib/pagination";
import { fmtMoney, fmtLitres, DEFAULT_CURRENCY } from "@/lib/format";
import { TableCsvButton } from "@/components/reports/ReportExports";
import { getVehicleAttribution } from "@/lib/vehicle-attribution";
import { UnitAttributionCard } from "@/components/dashboard/UnitAttributionCard";
import { getSessionUser, isAdmin } from "@/lib/auth";
import { getFleetEfficiency } from "@/lib/fuel-insights";
import { FleetEfficiency } from "@/components/fuel/FleetEfficiency";
import { Plate } from "@/components/fuel/VehiclePanel";
import { toLocalYmd } from "@/lib/date-format";


export const dynamic = 'force-dynamic';

// Default rows shown in the Fleet Performance Table; overridable via ?pageSize
// (free 1–80 entry in the pagination bar).
const DEFAULT_PAGE_SIZE = 20;

import { FuelLogFilters } from "@/components/dashboard/FuelLogFilters";

// ... imports ...
import { DashboardCharts } from "@/components/dashboard/Charts";

// ... getFleetData implementation ...

async function getFleetChartData(vehicleId?: string, fuelType?: string, department?: string, division?: string, from?: string, to?: string) {
    let queryCondition = "t.transType = 'FIS'";
    const params: any[] = [];

    if (vehicleId) {
        queryCondition += ` AND t.vehicleId LIKE ?`;
        params.push(`%${vehicleId}%`);
    }

    if (fuelType && fuelType !== 'all') {
        const typePattern = fuelType === 'Petrol' ? '%Petrol%' : (fuelType === 'Diesel' ? '%Diesel%' : fuelType);
        queryCondition += ` AND t.fuelType LIKE ?`;
        params.push(`%${typePattern}%`);
    }

    if (department) {
        queryCondition += ` AND c.department LIKE ?`;
        params.push(`%${department}%`);
    }

    if (division) {
        queryCondition += ` AND c.division LIKE ?`;
        params.push(`%${division}%`);
    }

    if (from) {
        queryCondition += ` AND t.transDate >= ?`;
        params.push(from);
    }
    if (to) {
        queryCondition += ` AND t.transDate <= ?`;
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        params.push(toDate.toISOString());
    }

    const rawDaily = await (prisma as any).$queryRawUnsafe(`
        SELECT t.transDate, t.fuelType, SUM(t.transQty) as totalQty, SUM(t.transAmt) as totalAmt
        FROM FuelTransaction t
        LEFT JOIN CostCentre c ON t.transVoteNo = c.voteNo
        WHERE ${queryCondition}
        GROUP BY t.transDate, t.fuelType
        ORDER BY t.transDate ASC
    `, ...params) as any[];

    return rawDaily.map((d: any) => ({
        date: d.transDate,
        fuelType: d.fuelType,
        totalVolume: d.totalQty || 0,
        totalCost: d.totalAmt || 0
    }));
}

async function getDepartmentStats(vehicleId?: string, fuelType?: string, department?: string, division?: string, from?: string, to?: string) {
    let queryCondition = "t.transType = 'FIS'";
    const params: any[] = [];

    if (vehicleId) {
        queryCondition += ` AND t.vehicleId LIKE ?`;
        params.push(`%${vehicleId}%`);
    }

    if (fuelType && fuelType !== 'all') {
        const typePattern = fuelType === 'Petrol' ? '%Petrol%' : (fuelType === 'Diesel' ? '%Diesel%' : fuelType);
        queryCondition += ` AND t.fuelType LIKE ?`;
        params.push(`%${typePattern}%`);
    }

    if (department) {
        queryCondition += ` AND c.department LIKE ?`;
        params.push(`%${department}%`);
    }

    if (division) {
        queryCondition += ` AND c.division LIKE ?`;
        params.push(`%${division}%`);
    }

    if (from) {
        queryCondition += ` AND t.transDate >= ?`;
        params.push(from);
    }
    if (to) {
        queryCondition += ` AND t.transDate <= ?`;
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        params.push(toDate.toISOString());
    }

    const deptStats = await (prisma as any).$queryRawUnsafe(`
        SELECT 
            c.department, 
            SUM(t.transQty) as totalQty,
            SUM(CASE WHEN t.fuelType LIKE '%Petrol%' THEN t.transQty ELSE 0 END) as petrolVolume,
            SUM(CASE WHEN t.fuelType LIKE '%Diesel%' OR t.fuelType NOT LIKE '%Petrol%' THEN t.transQty ELSE 0 END) as dieselVolume
        FROM FuelTransaction t
        LEFT JOIN CostCentre c ON t.transVoteNo = c.voteNo
        WHERE ${queryCondition}
        AND c.department IS NOT NULL
        GROUP BY c.department
        ORDER BY totalQty DESC
        LIMIT 10
    `, ...params) as any[];

    return deptStats.map((d: any, index: number) => ({
        name: `#${index + 1} ${d.department}`,
        value: d.totalQty,
        petrol: d.petrolVolume,
        diesel: d.dieselVolume
    }));
}

// ... FleetPage component ...
export default async function FleetPage({
    searchParams
}: {
    searchParams: Promise<{ vehicleId?: string, fuelType?: string, department?: string, division?: string, from?: string, to?: string, page?: string, pageSize?: string }>
}) {
    const params = await searchParams;
    const filters = {
        vehicleId: params.vehicleId,
        fuelType: params.fuelType,
        department: params.department,
        division: params.division,
        from: params.from,
        to: params.to,
    };
    const fleet = await getFleetPerformance(filters);
    // Attribution only matters when the view is scoped to a unit.
    const [attribution, sessionUser] = await Promise.all([
        getVehicleAttribution(params.vehicleId || "", filters),
        getSessionUser(),
    ]);
    const dailyData = await getFleetChartData(params.vehicleId, params.fuelType, params.department, params.division, params.from, params.to);
    const topVotesForChart = await getDepartmentStats(params.vehicleId, params.fuelType, params.department, params.division, params.from, params.to);

    // Efficiency follows the date range only; the other filters narrow it to the units still in the table.
    const eff = await getFleetEfficiency(params.from ? toLocalYmd(params.from) : undefined, params.to ? toLocalYmd(params.to) : undefined);
    const inView = new Set(fleet.map(f => f.id));
    const effUnits = eff.units.filter(u => inView.has(u.unit));
    const effByUnit = new Map(effUnits.map(u => [u.unit, u]));
    const maxRatio = 3;

    const totalFuel = fleet.reduce((sum, v) => sum + v.petrolVolume + v.dieselVolume, 0);
    const avgFill = fleet.length > 0 ? totalFuel / fleet.length : 0;

    // Prepare Top Lists
    // Rankings exclude the no-unit placeholder: it is not a vehicle, and it would
    // otherwise rank 3rd overall. It stays in the table and in every total below.
    const rankable = fleet.filter(f => !isUnattributedUnit(f.id));

    // "High usage" has to compare like with like. This badge used to test a
    // unit's cost in N$ against the fleet's MEAN litres — two different units of
    // measurement — so 785 of 921 units lit up. A flag that fires on 85% of the
    // table is noise the reader learns to ignore.
    //
    // The stray 1.5 was the giveaway: that constant belongs to the Tukey fence,
    // Q3 + 1.5 x IQR, the standard rule for "unusually high" in a skewed
    // distribution. Fuel use is exactly that — a long tail of heavy plant — so
    // mean and standard deviation both mislead here. The fence flags 89 of 921
    // units (9.7%), which is what an exception flag is for.
    //
    // The placeholder row is excluded from the basis for the same reason it is
    // excluded from the rankings: it is not a vehicle.
    const sortedLitres = rankable
        .map(v => v.petrolVolume + v.dieselVolume)
        .sort((a, b) => a - b);
    /** Linear-interpolated quantile; matches the usual spreadsheet definition. */
    const quantile = (sorted: number[], q: number) => {
        if (sorted.length === 0) return 0;
        const pos = (sorted.length - 1) * q;
        const base = Math.floor(pos);
        const rest = pos - base;
        const next = sorted[base + 1];
        return next === undefined ? sorted[base] : sorted[base] + rest * (next - sorted[base]);
    };
    const q1 = quantile(sortedLitres, 0.25);
    const q3 = quantile(sortedLitres, 0.75);
    const highUsageLitres = q3 + 1.5 * (q3 - q1);
    const topFleetForChart = rankable.slice(0, 10).map(f => ({ name: f.id, value: f.petrolVolume + f.dieselVolume }));

    const highConsumer = rankable[0]?.id ?? "N/A";

    // --- Pagination for the Fleet Performance Table (all KPIs above use the
    // full filtered set; only the table rows are windowed). ---
    const { page: currentPage, pageSize, start, end } = paginate(fleet.length, params.page, params.pageSize, DEFAULT_PAGE_SIZE);
    const pageRows = fleet.slice(start, end);

    // Build the CSV export URL from the active filters (never page/pageSize —
    // the export is the whole filtered set, not the current page).
    const exportParams = new URLSearchParams({ report: "fleet" });
    if (params.vehicleId) exportParams.set("vehicleId", params.vehicleId);
    if (params.fuelType && params.fuelType !== "all") exportParams.set("fuelType", params.fuelType);
    if (params.department) exportParams.set("department", params.department);
    if (params.division) exportParams.set("division", params.division);
    if (params.from) exportParams.set("from", params.from);
    if (params.to) exportParams.set("to", params.to);
    const fleetExportUrl = `/api/reports/export?${exportParams.toString()}`;

    const settings = await (prisma as any).systemSettings.findFirst({ where: { id: "global" } });
    const cur = settings?.currencySymbol || DEFAULT_CURRENCY;

    // Fetch CostCentres for Filter
    const costCentres = await (prisma as any).costCentre.findMany({
        select: { department: true, division: true },
        distinct: ['department', 'division'],
        orderBy: [{ department: 'asc' }, { division: 'asc' }]
    });

    return (
        <div className="flex flex-col gap-3.5">
            <PageHeader
                title="Fleet"
                scope={[`${fleet.length.toLocaleString("en-GB")} units`, fmtLitres(totalFuel), "Fuel issues only"]}
            >
                <TableCsvButton filename="fleet_performance.csv" serverUrl={fleetExportUrl} />
            </PageHeader>

            <FuelLogFilters costCentres={costCentres} />

            <UnitAttributionCard
                attribution={attribution}
                canAssign={isAdmin(sessionUser?.role)}
                exportUrl={`/api/reports/export?report=vehicle-attribution&vehicleId=${encodeURIComponent(params.vehicleId || "")}`}
            />

            {/* KPI Cards */}
            <div className="grid gap-3.5 md:grid-cols-3 stagger-tiles">
                <IndustrialKPI label="Units fuelled" icon={Truck} value={`${fleet.length} units`} subValue="With at least one issue in this selection" />

                <IndustrialKPI label="Heaviest user" icon={AlertTriangle} value={highConsumer} subValue="Most litres in this selection" />

                <IndustrialKPI label="Average per unit" icon={TrendingUp} value={fmtLitres(avgFill)} subValue="Litres issued divided by units fuelled" />
            </div>

            <FleetEfficiency units={effUnits} medians={eff.medians} />

            <DashboardCharts
                    dailyData={dailyData}
                    topFleet={topFleetForChart}
                    topVotes={topVotesForChart}
                    currencySymbol={cur}
                />

            <Card className="monumental-card bg-card p-0 overflow-hidden">
                <CardHeader className="p-4 border-b border-border">
                    <CardTitle className="text-base font-semibold">Every unit</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead>Vehicle</TableHead>
                                    <TableHead >Petrol (L)</TableHead>
                                    <TableHead >Diesel (L)</TableHead>
                                    <TableHead className="text-right">Total Cost</TableHead>
                                    <TableHead className="text-center">Fills</TableHead>
                                    <TableHead className="text-right">L/100 km</TableHead>
                                    <TableHead>Against class median</TableHead>
                                    <TableHead className="text-center">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {fleet.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground font-medium">
                                            No fleet data available. Upload Excel logs to see analysis.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    pageRows.map((unit) => {
                                    const unitLitres = unit.petrolVolume + unit.dieselVolume;
                                    const highUsage = highUsageLitres > 0 && unitLitres > highUsageLitres;
                                    const e = effByUnit.get(unit.id);
                                    return (
                                        <TableRow key={unit.id} >
                                            <TableCell>
                                                {isUnattributedUnit(unit.id) ? (
                                                    <span
                                                        className="text-muted-foreground italic"
                                                        title="Fuel issued without a fleet unit recorded — not a vehicle"
                                                    >
                                                        {unitLabel(unit.id)}
                                                    </span>
                                                ) : <Plate unit={unit.id} />}
                                            </TableCell>
                                            <TableCell className="mono text-muted-foreground">
                                                {unit.petrolVolume > 0 ? fmtLitres(unit.petrolVolume) : '—'}
                                            </TableCell>
                                            <TableCell className="mono text-muted-foreground">
                                                {unit.dieselVolume > 0 ? fmtLitres(unit.dieselVolume) : '—'}
                                            </TableCell>
                                            <TableCell className="mono text-right">
                                                {fmtMoney(unit.totalCost, { currency: cur })}
                                            </TableCell>
                                            <TableCell className="text-center font-medium text-muted-foreground">
                                                {unit.transactionCount}
                                            </TableCell>
                                            <TableCell className="mono text-right">
                                                {e?.l100 != null ? e.l100.toFixed(1) : <span className="text-faint" title="Not enough odometer readings to work this out">—</span>}
                                            </TableCell>
                                            <TableCell>
                                                {e?.ratio != null ? (
                                                    <span className="flex items-center gap-2" title={`${e.ratio.toFixed(2)} times the ${e.fuel.toLowerCase()} median of ${e.classMedian?.toFixed(1)} L/100 km`}>
                                                        <span className="relative block h-1.5 w-24 rounded-full bg-bar">
                                                            <span className={`absolute inset-y-0 left-0 rounded-full ${e.ratio >= 2 ? "bg-crit" : "bg-brand"}`} style={{ width: `${Math.min(100, (e.ratio / maxRatio) * 100)}%` }} />
                                                            <span className="absolute -inset-y-1 w-0.5 rounded bg-primary" style={{ left: `${100 / maxRatio}%` }} />
                                                        </span>
                                                        <span className="mono text-xs text-muted-foreground">{e.ratio.toFixed(1)}×</span>
                                                    </span>
                                                ) : <span className="text-faint">—</span>}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {isUnattributedUnit(unit.id) ? (
                                                    <span className="text-muted-foreground" title="Not a vehicle — no usage baseline applies">—</span>
                                                ) : (
                                                    <Badge
                                                        title={`${fmtLitres(unitLitres)} this period. Flagged above ${fmtLitres(highUsageLitres)}, the fleet's upper quartile (${fmtLitres(q3)}) plus 1.5x the interquartile range.`}
                                                        className={highUsage
                                                            ? 'bg-warn-soft text-foreground hover:bg-warn-soft  border-0'
                                                            : 'bg-muted text-muted-foreground hover:bg-surface-2  border-0'}
                                                    >
                                                        {highUsage ? 'High usage' : 'Normal'}
                                                    </Badge>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    {fleet.length > 0 && (
                        <div className="border-t border-border bg-card px-2">
                            <TablePagination
                                totalItems={fleet.length}
                                itemsPerPage={pageSize}
                                currentPage={currentPage}
                                showPageSize
                                unitLabel="vehicles"
                            />
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
