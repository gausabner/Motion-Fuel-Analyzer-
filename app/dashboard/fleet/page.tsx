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

export const dynamic = 'force-dynamic';

async function getFleetData(vehicleId?: string, fuelType?: string, department?: string, division?: string, from?: string, to?: string) {
    let queryCondition = '1=1';
    const params: any[] = [];

    if (vehicleId) {
        queryCondition += ` AND t.vehicleId LIKE ?`;
        params.push(`%${vehicleId}%`);
    }

    if (fuelType && fuelType !== 'all') {
        const typePattern = fuelType === 'Petrol' ? '%Petrol%' : (fuelType === 'Diesel' ? '%Diesel%' : fuelType);
        // If specific strict match is desired:
        // queryCondition += ` AND t.fuelType = ?`;
        // params.push(fuelType);
        // But data might be 'Petrol Unleaded', so LIKE is safer if dropdown sends 'Petrol'
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

    // Aggregate stats per vehicle using Raw SQL with JOIN for Department filtering
    const fleetStats = await (prisma as any).$queryRawUnsafe(`
        SELECT 
            t.vehicleId, 
            t.fuelType, 
            SUM(t.transQty) as totalQty, 
            SUM(t.transAmt) as totalCost, 
            COUNT(t.id) as transCount
        FROM FuelTransaction t
        LEFT JOIN CostCentre c ON t.transVoteNo = c.voteNo
        WHERE ${queryCondition}
        GROUP BY t.vehicleId, t.fuelType
        ORDER BY t.vehicleId ASC
    `, ...params) as any[];

    // Group by vehicle and calculate totals
    const processedFleet = fleetStats.reduce((acc: any[], curr) => {
        const vId = curr.vehicleId || "Unknown";
        let vehicle = acc.find(v => v.id === vId);

        if (!vehicle) {
            vehicle = {
                id: vId,
                petrolVolume: 0,
                dieselVolume: 0,
                totalCost: 0,
                transactionCount: 0,
            };
            acc.push(vehicle);
        }

        if (curr.fuelType.toLowerCase().includes('petrol')) {
            vehicle.petrolVolume += curr.totalQty || 0;
        } else {
            vehicle.dieselVolume += curr.totalQty || 0;
        }

        vehicle.totalCost += curr.totalCost || 0;
        vehicle.transactionCount += Number(curr.transCount); // Ensure number

        return acc;
    }, []);

    return processedFleet.sort((a, b) => (b.petrolVolume + b.dieselVolume) - (a.petrolVolume + a.dieselVolume));
}

import { FuelLogFilters } from "@/components/dashboard/FuelLogFilters";

// ... imports ...
import { DashboardCharts } from "@/components/dashboard/Charts";

// ... getFleetData implementation ...

async function getFleetChartData(vehicleId?: string, fuelType?: string, department?: string, division?: string, from?: string, to?: string) {
    let queryCondition = '1=1';
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
    let queryCondition = '1=1';
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
    searchParams: Promise<{ vehicleId?: string, fuelType?: string, department?: string, division?: string, from?: string, to?: string }>
}) {
    const params = await searchParams;
    const fleet = await getFleetData(params.vehicleId, params.fuelType, params.department, params.division, params.from, params.to);
    const dailyData = await getFleetChartData(params.vehicleId, params.fuelType, params.department, params.division, params.from, params.to);
    const topVotesForChart = await getDepartmentStats(params.vehicleId, params.fuelType, params.department, params.division, params.from, params.to);

    const totalFuel = fleet.reduce((sum, v) => sum + v.petrolVolume + v.dieselVolume, 0);
    const avgFill = fleet.length > 0 ? totalFuel / fleet.length : 0;

    // Prepare Top Lists
    const topFleetForChart = fleet.slice(0, 10).map(f => ({ name: f.id, value: f.petrolVolume + f.dieselVolume }));

    const highConsumer = fleet.length > 0 && fleet[0]?.id ? fleet[0].id : "N/A";

    // Fetch CostCentres for Filter
    const costCentres = await (prisma as any).costCentre.findMany({
        select: { department: true, division: true },
        distinct: ['department', 'division'],
        orderBy: [{ department: 'asc' }, { division: 'asc' }]
    });

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight" style={{ color: '#212320' }}>Fleet Management</h2>
                    <p className="text-slate-500">Unit-by-unit fuel efficiency and consumption analysis</p>
                </div>
            </div>

            <FuelLogFilters costCentres={costCentres} />

            {/* KPI Cards */}
            <div className="grid gap-6 md:grid-cols-3">
                <Card className="monumental-card">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-bold uppercase text-zinc-500 tracking-widest">Active Units</CardTitle>
                        <Truck className="h-4 w-4 text-black" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl md:text-2xl lg:text-3xl font-extrabold text-black break-all">{fleet.length} Units</div>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-1">Tracking individual performance</p>
                    </CardContent>
                </Card>

                <Card className="monumental-card border-l-4 border-l-yellow-400">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-bold uppercase text-zinc-500 tracking-widest">Top Consumption</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-black" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl md:text-2xl lg:text-3xl font-extrabold text-black break-all">{highConsumer}</div>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-1">Highest fuel usage unit</p>
                    </CardContent>
                </Card>

                <Card className="monumental-card">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-bold uppercase text-zinc-500 tracking-widest">Avg. Unit Burn</CardTitle>
                        <TrendingUp className="h-4 w-4 text-black" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl md:text-2xl lg:text-3xl font-extrabold text-black break-all">{avgFill.toFixed(1)} L</div>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-1">Average per vehicle this period</p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Section */}
            <section className="bg-white/30 backdrop-blur-sm rounded-3xl p-1 border border-white/20 shadow-sm">
                <DashboardCharts
                    dailyData={dailyData}
                    topFleet={topFleetForChart}
                    topVotes={topVotesForChart}
                />
            </section>

            <Card className="monumental-card bg-white p-0 overflow-hidden">
                <CardHeader className="p-6 border-b border-zinc-200">
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
                                        <TableCell colSpan={6} className="text-center py-8 text-zinc-500 font-medium">
                                            No fleet data available. Upload Excel logs to see analysis.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    fleet.map((unit) => (
                                        <TableRow key={unit.id} className="hover:bg-zinc-50 transition-colors border-b border-zinc-100 last:border-0 text-xs md:text-sm">
                                            <TableCell className="font-bold text-black py-4">
                                                {unit.id}
                                            </TableCell>
                                            <TableCell className="font-mono font-medium text-zinc-600">
                                                {unit.petrolVolume > 0 ? `${unit.petrolVolume.toFixed(1)} L` : '—'}
                                            </TableCell>
                                            <TableCell className="font-mono font-medium text-zinc-600">
                                                {unit.dieselVolume > 0 ? `${unit.dieselVolume.toFixed(1)} L` : '—'}
                                            </TableCell>
                                            <TableCell className="text-right font-bold text-black">
                                                ${unit.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell className="text-center font-medium text-zinc-600">
                                                {unit.transactionCount}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge
                                                    className={unit.totalCost > (totalFuel / fleet.length * 1.5)
                                                        ? 'bg-yellow-400 text-black hover:bg-yellow-500 rounded-none border-0'
                                                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 rounded-none border-0'}
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
                </CardContent>
            </Card>
        </div>
    );
}
