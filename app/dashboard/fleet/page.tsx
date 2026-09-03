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
import { PageHeader } from "@/components/dashboard/PageHeader";
import { getFleetPerformance } from "@/lib/analytics";
import { TablePagination } from "@/components/dashboard/TablePagination";
import { paginate } from "@/lib/pagination";
import { TableCsvButton } from "@/components/reports/ReportExports";
import { getVehicleAttribution } from "@/lib/vehicle-attribution";
import { UnitAttributionCard } from "@/components/dashboard/UnitAttributionCard";
import { getSessionUser, isAdmin } from "@/lib/auth";


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

    const totalFuel = fleet.reduce((sum, v) => sum + v.petrolVolume + v.dieselVolume, 0);
    const avgFill = fleet.length > 0 ? totalFuel / fleet.length : 0;

    // Prepare Top Lists
    const topFleetForChart = fleet.slice(0, 10).map(f => ({ name: f.id, value: f.petrolVolume + f.dieselVolume }));

    const highConsumer = fleet.length > 0 && fleet[0]?.id ? fleet[0].id : "N/A";

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

    // Fetch CostCentres for Filter
    const costCentres = await (prisma as any).costCentre.findMany({
        select: { department: true, division: true },
        distinct: ['department', 'division'],
        orderBy: [{ department: 'asc' }, { division: 'asc' }]
    });

    return (
        <div className="space-y-6">
            <PageHeader
                title="Fleet"
                scope="Unit-by-unit fuel efficiency and consumption analysis · FIS transactions only"
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
            <div className="grid gap-6 md:grid-cols-3">
                <Card className="monumental-card">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-bold uppercase text-muted-foreground tracking-widest">Active Units</CardTitle>
                        <Truck className="h-4 w-4 text-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl md:text-2xl lg:text-3xl font-extrabold text-foreground break-all">{fleet.length} Units</div>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-1">Tracking individual performance</p>
                    </CardContent>
                </Card>

                <Card className="monumental-card border-l-4 border-l-yellow-400">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-bold uppercase text-muted-foreground tracking-widest">Top Consumption</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl md:text-2xl lg:text-3xl font-extrabold text-foreground break-all">{highConsumer}</div>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-1">Highest fuel usage unit</p>
                    </CardContent>
                </Card>

                <Card className="monumental-card">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-bold uppercase text-muted-foreground tracking-widest">Avg. Unit Burn</CardTitle>
                        <TrendingUp className="h-4 w-4 text-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl md:text-2xl lg:text-3xl font-extrabold text-foreground break-all">{avgFill.toFixed(1)} L</div>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-1">Average per vehicle this period</p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Section */}
            <section className="bg-card/30 backdrop-blur-sm rounded-3xl p-1 border border-white/20 shadow-sm">
                <DashboardCharts
                    dailyData={dailyData}
                    topFleet={topFleetForChart}
                    topVotes={topVotesForChart}
                />
            </section>

            <Card className="monumental-card bg-card p-0 overflow-hidden">
                <CardHeader className="p-6 border-b border-border">
                    <CardTitle className="text-lg font-extrabold uppercase tracking-tight">Fleet Performance Table</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-black hover:bg-black">
                                    <TableHead className="font-bold text-white uppercase tracking-wider text-xs h-12 rounded-none">Vehicle ID</TableHead>
                                    <TableHead className="font-bold text-white uppercase tracking-wider text-xs h-12">Petrol (L)</TableHead>
                                    <TableHead className="font-bold text-white uppercase tracking-wider text-xs h-12">Diesel (L)</TableHead>
                                    <TableHead className="font-bold text-white uppercase tracking-wider text-xs h-12 text-right">Total Cost</TableHead>
                                    <TableHead className="font-semibold text-white uppercase tracking-wider text-xs h-12 text-center">Fills</TableHead>
                                    <TableHead className="font-semibold text-white uppercase tracking-wider text-xs h-12 text-center">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {fleet.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground font-medium">
                                            No fleet data available. Upload Excel logs to see analysis.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    pageRows.map((unit) => (
                                        <TableRow key={unit.id} className="hover:bg-muted/40 transition-colors border-b border-border last:border-0 text-xs md:text-sm">
                                            <TableCell className="font-bold text-foreground py-4">
                                                {unit.id}
                                            </TableCell>
                                            <TableCell className="font-mono font-medium text-muted-foreground">
                                                {unit.petrolVolume > 0 ? `${unit.petrolVolume.toFixed(1)} L` : '—'}
                                            </TableCell>
                                            <TableCell className="font-mono font-medium text-muted-foreground">
                                                {unit.dieselVolume > 0 ? `${unit.dieselVolume.toFixed(1)} L` : '—'}
                                            </TableCell>
                                            <TableCell className="text-right font-bold text-foreground">
                                                ${unit.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell className="text-center font-medium text-muted-foreground">
                                                {unit.transactionCount}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge
                                                    className={unit.totalCost > (totalFuel / fleet.length * 1.5)
                                                        ? 'bg-yellow-400 text-foreground hover:bg-yellow-500 rounded-none border-0'
                                                        : 'bg-muted text-muted-foreground hover:bg-zinc-200 rounded-none border-0'}
                                                >
                                                    {unit.totalCost > (totalFuel / fleet.length * 1.5) ? 'High Usage' : 'Normal'}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))
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
