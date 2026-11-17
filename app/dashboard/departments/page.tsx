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
import { IndustrialKPI } from "@/components/dashboard/IndustrialKPI";
import { scopeRange } from "@/lib/periods";
import { PageHeader } from "@/components/dashboard/PageHeader";

export const dynamic = 'force-dynamic';

import { FuelLogFilters } from "@/components/dashboard/FuelLogFilters";
import { ChartCard, RankedBars } from "@/components/fuel/charts";
import { fmtDept } from "@/lib/format";
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
    const vol = (d: { petrolVolume: number; dieselVolume: number }) => d.petrolVolume + d.dieselVolume;
    const totalLitres = departments.reduce((sum, d) => sum + vol(d), 0);
    const byVolume = [...departments].sort((a, b) => vol(b) - vol(a));
    // A row keyed by a bare vote code has no cost centre behind it yet.
    const isCode = (id: string) => /^\d+$/.test(id) || id === "Unassigned";
    const name = (id: string) => (isCode(id) ? `Unassigned · ${id}` : fmtDept(id));
    const unnamedCount = departments.filter(d => isCode(d.id)).length;
    const namedCount = departments.length - unnamedCount;
    const top = byVolume.slice(0, 8);
    const topCost = departments.slice(0, 8);

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
        <div className="flex flex-col gap-3.5">
            <PageHeader
                title="Cost centres"
                scope={[scopeRange(params.from, params.to), fmtLitres(totalLitres), "Fuel issues only"]}
            >
                <TableCsvButton filename="departmental_breakdown.csv" serverUrl={departmentsExportUrl} />
            </PageHeader>

            <FuelLogFilters costCentres={costCentres} />

            <div className="grid gap-3.5 md:grid-cols-3 stagger-tiles">
                <IndustrialKPI label="Departments" icon={Building2} value={`${namedCount}`} subValue={unnamedCount > 0 ? `Plus ${unnamedCount} vote code${unnamedCount === 1 ? "" : "s"} with no department yet` : "With fuel issued in this selection"} />

                <IndustrialKPI label="Total spend" icon={Users} value={fmtMoneyCompact(totalSpend, cur)} subValue="Value of fuel issued in this selection" />

                <div className="kpi">
                    <div className="kpi-h">Charged to a cost centre</div>
                    <div className="kpi-v num">{attributedShare}</div>
                    <div className="kpi-f">
                        {openCodes > 0 ? (
                            <Link href="/dashboard/registry?tab=unassigned" className="lnk text-xs">
                                {openCodes} code{openCodes === 1 ? "" : "s"} · {fmtLitres(Number(cov.openLitres || 0))} still unassigned
                            </Link>
                        ) : <span className="ctx">Every vote code is mapped</span>}
                    </div>
                </div>
            </div>

            <section className="monumental-card" aria-label="Summary">
                <p className="bigline">
                    {departments.length === 0
                        ? "No fuel was issued to a cost centre in this selection."
                        : `${name(byVolume[0].id)} took the most fuel: ${fmtLitres(vol(byVolume[0]))}, ${fmtShare(vol(byVolume[0]), totalLitres)} of everything issued.`}
                    {departments.length > 3 && (
                        <small>The three largest cost centres account for {fmtShare(byVolume.slice(0, 3).reduce((x, d) => x + vol(d), 0), totalLitres)} of the litres issued.</small>
                    )}
                </p>
            </section>

            {departments.length > 0 && (
                <div className="grid gap-3.5 lg:grid-cols-2">
                    <ChartCard
                        title="Litres issued" sub={`Largest ${top.length} cost centres`}
                        table={{ head: ["Cost centre", "Litres"], rows: top.map(d => [fmtDept(d.id), Math.round(vol(d)).toLocaleString("en-GB")]) }}
                    >
                        <RankedBars wide ariaLabel="Litres issued by cost centre" rows={top.map(d => ({ label: name(d.id), value: vol(d), display: fmtLitres(vol(d)), unassigned: isCode(d.id) }))} />
                    </ChartCard>
                    <ChartCard
                        title="Cost" sub={`Largest ${topCost.length} cost centres`}
                        table={{ head: ["Cost centre", "Cost"], rows: topCost.map(d => [fmtDept(d.id), fmtMoney(d.totalCost, { currency: cur })]) }}
                    >
                        <RankedBars wide ariaLabel="Fuel cost by cost centre" rows={topCost.map(d => ({ label: name(d.id), value: d.totalCost, display: fmtMoneyCompact(d.totalCost, cur), unassigned: isCode(d.id) }))} />
                    </ChartCard>
                </div>
            )}

            <Card className="monumental-card bg-card p-0 overflow-hidden">
                <CardHeader className="p-4 border-b border-border">
                    <CardTitle className="text-base font-semibold">Every department</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead>Vote No / Department</TableHead>
                                    <TableHead>Total Cost</TableHead>
                                    <TableHead>Petrol (L)</TableHead>
                                    <TableHead>Diesel (L)</TableHead>
                                    <TableHead className="text-right">% of Total</TableHead>
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
                                        <TableRow key={dept.id}>
                                            <TableCell>
                                                {fmtDept(dept.id)}
                                            </TableCell>
                                            <TableCell className="mono">
                                                {fmtMoney(dept.totalCost, { currency: cur })}
                                            </TableCell>
                                            <TableCell className="mono text-muted-foreground">
                                                {fmtLitres(dept.petrolVolume)}
                                            </TableCell>
                                            <TableCell className="mono text-muted-foreground">
                                                {fmtLitres(dept.dieselVolume)}
                                            </TableCell>
                                            <TableCell className="mono text-right">
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
