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
import { Building2, Users, FileWarning, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";

export const dynamic = 'force-dynamic';

import { FuelLogFilters } from "@/components/dashboard/FuelLogFilters";
import { DepartmentCharts } from "@/components/dashboard/DepartmentCharts";
import { getDepartmentBreakdown } from "@/lib/analytics";
import { TablePagination } from "@/components/dashboard/TablePagination";
import { paginate } from "@/lib/pagination";
import { TableCsvButton } from "@/components/reports/ReportExports";
import { fmtMoney, fmtMoneyCompact, fmtLitres, fmtShare, DEFAULT_CURRENCY } from "@/lib/format";

// Default rows shown in the Departmental Breakdown table; overridable via ?pageSize
const DEFAULT_PAGE_SIZE = 20;

export default async function DepartmentsPage({
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
    const departments = await getDepartmentBreakdown(filters);

    const totalSpend = departments.reduce((sum, d) => sum + d.totalCost, 0);

    // What the removed "Cost allocation 100%" card claimed, measured instead of
    // asserted: litres whose vote number resolves to a registered cost centre.
    const [settings, coverage] = await Promise.all([
        (prisma as any).systemSettings.findFirst({ where: { id: "global" } }),
        (prisma as any).$queryRawUnsafe(`
            SELECT
                SUM(CASE WHEN c.voteNo IS NOT NULL THEN t.transQty ELSE 0 END) AS attributed,
                SUM(t.transQty) AS total,
                COUNT(DISTINCT CASE WHEN c.voteNo IS NULL THEN t.transVoteNo END) AS openCodes,
                SUM(CASE WHEN c.voteNo IS NULL THEN t.transQty ELSE 0 END) AS openLitres
            FROM FuelTransaction t
            LEFT JOIN CostCentre c ON t.transVoteNo = c.voteNo
            WHERE t.transType = 'FIS' AND t.transVoteNo != ''
        `) as Promise<{ attributed: number; total: number; openCodes: number; openLitres: number }[]>,
    ]);
    const cur = settings?.currencySymbol || DEFAULT_CURRENCY;
    const cov = coverage[0] ?? { attributed: 0, total: 0, openCodes: 0, openLitres: 0 };
    const openCodes = Number(cov.openCodes || 0);
    const attributedShare = fmtShare(Number(cov.attributed || 0), Number(cov.total || 0));

    // --- Pagination for the Departmental Breakdown table (the KPIs, charts and
    // each row's % of total all use the full filtered set; only the table rows
    // are windowed). ---
    const { page: currentPage, pageSize, start, end } = paginate(departments.length, params.page, params.pageSize, DEFAULT_PAGE_SIZE);
    const pageRows = departments.slice(start, end);

    // Build the CSV export URL from the active filters (never page/pageSize —
    // the export is the whole filtered set, not the current page).
    const exportParams = new URLSearchParams({ report: "departments" });
    if (params.vehicleId) exportParams.set("vehicleId", params.vehicleId);
    if (params.fuelType && params.fuelType !== "all") exportParams.set("fuelType", params.fuelType);
    if (params.department) exportParams.set("department", params.department);
    if (params.division) exportParams.set("division", params.division);
    if (params.from) exportParams.set("from", params.from);
    if (params.to) exportParams.set("to", params.to);
    const departmentsExportUrl = `/api/reports/export?${exportParams.toString()}`;

    // Fetch CostCentres for Filter
    const costCentres = await (prisma as any).costCentre.findMany({
        select: { department: true, division: true },
        distinct: ['department', 'division'],
        orderBy: [{ department: 'asc' }, { division: 'asc' }]
    });

    return (
        <div className="space-y-8">
            <PageHeader
                title="Cost centres"
                scope="Departmental fuel expenditure and allocation analysis · FIS transactions only"
            >
                <TableCsvButton filename="departmental_breakdown.csv" serverUrl={departmentsExportUrl} />
            </PageHeader>

            <FuelLogFilters costCentres={costCentres} />

            <div className="grid gap-4 md:grid-cols-3">
                <Card className="monumental-card">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-bold uppercase text-muted-foreground tracking-widest">Primary Depts</CardTitle>
                        <Building2 className="h-4 w-4 text-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl md:text-2xl xl:text-3xl font-extrabold text-foreground break-words">{departments.length} Units</div>
                        <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mt-1">Active cost centers recorded</p>
                    </CardContent>
                </Card>

                <Card className="monumental-card border-l-4 border-l-yellow-400">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-bold uppercase text-muted-foreground tracking-widest">Total Spend</CardTitle>
                        <Users className="h-4 w-4 text-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl md:text-2xl xl:text-3xl font-extrabold text-foreground break-words">{fmtMoneyCompact(totalSpend, cur)}</div>
                        <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mt-1">Aggregated period cost</p>
                    </CardContent>
                </Card>

                <Card className="monumental-card">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-bold uppercase text-muted-foreground tracking-widest">Attributed</CardTitle>
                        {openCodes > 0
                            ? <FileWarning className="h-4 w-4 text-amber-600" />
                            : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl md:text-2xl xl:text-3xl font-extrabold text-foreground">{attributedShare}</div>
                        {openCodes > 0 ? (
                            <Link
                                href="/dashboard/registry?tab=unassigned"
                                className="mt-1 inline-flex items-center gap-1 rounded-sm text-xs font-bold uppercase tracking-wider text-amber-700 underline underline-offset-2 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-amber-400 dark:hover:text-amber-300"
                            >
                                {openCodes} code{openCodes === 1 ? "" : "s"} · {fmtLitres(Number(cov.openLitres || 0))} unassigned
                            </Link>
                        ) : (
                            <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mt-1">Every vote resolves to a cost centre</p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Charts Section */}
            <section>
                <DepartmentCharts data={departments} />
            </section>

            <Card className="monumental-card bg-card p-0 overflow-hidden">
                <CardHeader className="p-4 border-b border-border">
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
                                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground font-medium">
                                            No departmental data found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    pageRows.map((dept) => (
                                        <TableRow key={dept.id} className="hover:bg-muted/40 transition-colors border-b border-border last:border-0">
                                            <TableCell className="font-bold text-foreground py-4">
                                                {dept.id}
                                            </TableCell>
                                            <TableCell className="font-bold text-foreground">
                                                {fmtMoney(dept.totalCost, { currency: cur })}
                                            </TableCell>
                                            <TableCell className="font-medium text-muted-foreground font-mono text-xs">
                                                {fmtLitres(dept.petrolVolume)}
                                            </TableCell>
                                            <TableCell className="font-medium text-muted-foreground font-mono text-xs">
                                                {fmtLitres(dept.dieselVolume)}
                                            </TableCell>
                                            <TableCell className="text-right font-bold text-foreground">
                                                {fmtShare(dept.totalCost, totalSpend)}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    {departments.length > 0 && (
                        <div className="border-t border-border bg-card px-2">
                            <TablePagination
                                totalItems={departments.length}
                                itemsPerPage={pageSize}
                                currentPage={currentPage}
                                showPageSize
                                unitLabel="cost centres"
                            />
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
