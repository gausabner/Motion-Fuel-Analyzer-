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
import { Building2, PieChart, Users } from "lucide-react";

export const dynamic = 'force-dynamic';

import { FuelLogFilters } from "@/components/dashboard/FuelLogFilters";
import { DepartmentCharts } from "@/components/dashboard/DepartmentCharts";

async function getDepartmentData(vehicleId?: string, fuelType?: string, department?: string, division?: string, from?: string, to?: string) {
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
            t.transVoteNo, 
            c.department,
            c.division,
            t.fuelType, 
            SUM(t.transQty) as totalQty, 
            SUM(t.transAmt) as totalCost, 
            COUNT(t.id) as transCount
        FROM FuelTransaction t
        LEFT JOIN CostCentre c ON t.transVoteNo = c.voteNo
        WHERE ${queryCondition}
        GROUP BY t.transVoteNo, c.department, c.division, t.fuelType
    `, ...params) as any[];

    const processedDepts = deptStats.reduce((acc: any[], curr) => {
        // Group by Department Name if available, otherwise VoteNo
        const deptId = curr.department || curr.transVoteNo || "Unassigned";

        let dept = acc.find(d => d.id === deptId);

        if (!dept) {
            dept = {
                id: deptId,
                voteNo: curr.transVoteNo,
                petrolVolume: 0,
                dieselVolume: 0,
                totalCost: 0,
                count: 0,
                division: curr.division || "Unassigned"
            };
            acc.push(dept);
        }

        if (curr.fuelType?.toLowerCase().includes('petrol')) {
            dept.petrolVolume += curr.totalQty || 0;
        } else {
            dept.dieselVolume += curr.totalQty || 0;
        }

        dept.totalCost += curr.totalCost || 0;
        dept.count += Number(curr.transCount);

        return acc;
    }, []);

    // Try to fill in missing divisions if needed, though we grouped by department name
    // For now we'll leave Division static or could join it in SQL if needed.
    // Let's assume grouping by department name is sufficient for the "ID"

    return processedDepts.sort((a, b) => b.totalCost - a.totalCost);
}



export default async function DepartmentsPage({
    searchParams
}: {
    searchParams: Promise<{ vehicleId?: string, fuelType?: string, department?: string, division?: string, from?: string, to?: string }>
}) {
    const params = await searchParams;
    const departments = await getDepartmentData(params.vehicleId, params.fuelType, params.department, params.division, params.from, params.to);

    const totalSpend = departments.reduce((sum, d) => sum + d.totalCost, 0);

    // Fetch CostCentres for Filter
    const costCentres = await (prisma as any).costCentre.findMany({
        select: { department: true, division: true },
        distinct: ['department', 'division'],
        orderBy: [{ department: 'asc' }, { division: 'asc' }]
    });

    return (
        <div className="space-y-10">
            <div className="flex flex-col gap-2">
                <h2 className="text-4xl font-extrabold tracking-tight text-black uppercase">Cost Centers</h2>
                <p className="text-zinc-500 font-medium">Departmental fuel expenditure and allocation analysis</p>
            </div>

            <FuelLogFilters costCentres={costCentres} />

            <div className="grid gap-6 md:grid-cols-3">
                <Card className="monumental-card">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-bold uppercase text-zinc-500 tracking-widest">Primary Depts</CardTitle>
                        <Building2 className="h-4 w-4 text-black" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl md:text-2xl lg:text-3xl font-extrabold text-black break-all">{departments.length} Units</div>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-1">Active cost centers recorded</p>
                    </CardContent>
                </Card>

                <Card className="monumental-card border-l-4 border-l-yellow-400">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-bold uppercase text-zinc-500 tracking-widest">Total Spend</CardTitle>
                        <Users className="h-4 w-4 text-black" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl md:text-2xl lg:text-3xl font-extrabold text-black break-all">${totalSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-1">Aggregated period cost</p>
                    </CardContent>
                </Card>

                <Card className="monumental-card">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-bold uppercase text-zinc-500 tracking-widest">Cost Allocation</CardTitle>
                        <PieChart className="h-4 w-4 text-black" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl md:text-2xl lg:text-3xl font-extrabold text-black">100%</div>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-1">Budget utilization tracked</p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Section */}
            <section>
                <DepartmentCharts data={departments} />
            </section>

            <Card className="monumental-card bg-white p-0 overflow-hidden">
                <CardHeader className="p-6 border-b border-zinc-200">
                    <CardTitle className="text-lg font-extrabold uppercase tracking-tight">Departmental Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-black hover:bg-black">
                                    <TableHead className="font-bold text-white uppercase tracking-wider text-xs h-12">Vote No / Department</TableHead>
                                    <TableHead className="font-bold text-white uppercase tracking-wider text-xs h-12">Total Cost</TableHead>
                                    <TableHead className="font-bold text-white uppercase tracking-wider text-xs h-12">Petrol (L)</TableHead>
                                    <TableHead className="font-bold text-white uppercase tracking-wider text-xs h-12">Diesel (L)</TableHead>
                                    <TableHead className="font-bold text-white uppercase tracking-wider text-xs h-12 text-right">% of Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {departments.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-zinc-500 font-medium">
                                            No departmental data found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    departments.map((dept, idx) => (
                                        <TableRow key={dept.id} className="hover:bg-zinc-50 transition-colors border-b border-zinc-100 last:border-0">
                                            <TableCell className="font-bold text-black py-4">
                                                {dept.id}
                                            </TableCell>
                                            <TableCell className="font-bold text-black">
                                                ${dept.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell className="font-medium text-zinc-600 font-mono text-xs">
                                                {dept.petrolVolume.toFixed(1)} L
                                            </TableCell>
                                            <TableCell className="font-medium text-zinc-600 font-mono text-xs">
                                                {dept.dieselVolume.toFixed(1)} L
                                            </TableCell>
                                            <TableCell className="text-right font-bold text-black">
                                                {((dept.totalCost / (totalSpend || 1)) * 100).toFixed(1)}%
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
