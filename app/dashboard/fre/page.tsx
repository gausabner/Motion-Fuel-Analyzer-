import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { IndustrialKPI } from "@/components/dashboard/IndustrialKPI";
import { FocusedChart } from "@/components/dashboard/Charts";
import { FuelLogFilters } from "@/components/dashboard/FuelLogFilters";
import { TableCsvButton } from "@/components/reports/ReportExports";
import { txFilters, type TxFilterOpts } from "@/lib/analytics";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowUpFromLine, Coins, Container, Gauge } from "lucide-react";
import { format } from "date-fns";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = 'force-dynamic';

async function getFreData(filters: TxFilterOpts) {
    const { clause, params } = txFilters(filters);
    const base = `FROM FuelTransaction WHERE transType = 'FRE'${clause}`;

    const [totals, daily, byTank, recent] = await Promise.all([
        (prisma as any).$queryRawUnsafe(`
            SELECT SUM(transQty) as vol, SUM(transAmt) as amt, COUNT(*) as cnt,
                   COUNT(DISTINCT storeNo) as tanks
            ${base}
        `, ...params),
        (prisma as any).$queryRawUnsafe(`
            SELECT transDate as date, fuelType, SUM(transQty) as totalVolume, SUM(transAmt) as totalCost
            ${base}
            GROUP BY transDate, fuelType
            ORDER BY transDate ASC
        `, ...params),
        (prisma as any).$queryRawUnsafe(`
            SELECT storeNo, fuelType, SUM(transQty) as vol, SUM(transAmt) as amt, COUNT(*) as deliveries
            ${base}
            GROUP BY storeNo, fuelType
            ORDER BY vol DESC
        `, ...params),
        (prisma as any).$queryRawUnsafe(`
            SELECT transDate, transRefNo, storeNo, fuelType, transQty, transAmt
            ${base}
            ORDER BY transDate DESC
            LIMIT 50
        `, ...params),
    ]);

    const settings = await (prisma as any).systemSettings.findFirst({ where: { id: 'global' } });

    return {
        kpi: {
            volume: totals[0]?.vol || 0,
            cost: totals[0]?.amt || 0,
            count: Number(totals[0]?.cnt || 0),
            tanks: Number(totals[0]?.tanks || 0),
        },
        currencySymbol: settings?.currencySymbol || "N$",
        daily: daily.map((d: any) => ({
            date: d.date,
            fuelType: d.fuelType,
            totalVolume: d.totalVolume || 0,
            totalCost: d.totalCost || 0,
        })),
        byTank,
        recent,
    };
}

export default async function FREPage({
    searchParams
}: {
    searchParams: Promise<{ from?: string, to?: string, fuelType?: string, department?: string, division?: string, vehicleId?: string }>
}) {
    const sp = await searchParams;
    const filters: TxFilterOpts = {
        from: sp.from, to: sp.to, fuelType: sp.fuelType,
        department: sp.department, division: sp.division, vehicleId: sp.vehicleId,
    };
    const data = await getFreData(filters);
    const s = data.currencySymbol;
    const avgDelivery = data.kpi.count > 0 ? data.kpi.volume / data.kpi.count : 0;

    const costCentres = await (prisma as any).costCentre.findMany({
        select: { department: true, division: true },
        distinct: ['department', 'division'],
        orderBy: [{ department: 'asc' }, { division: 'asc' }],
    });

    // CSV mirrors the active filters, so the download matches the KPIs on screen.
    const exportParams = new URLSearchParams({ report: "fre" });
    if (sp.from) exportParams.set("from", sp.from);
    if (sp.to) exportParams.set("to", sp.to);
    if (sp.fuelType && sp.fuelType !== "all") exportParams.set("fuelType", sp.fuelType);
    if (sp.department) exportParams.set("department", sp.department);
    if (sp.division) exportParams.set("division", sp.division);
    if (sp.vehicleId) exportParams.set("vehicleId", sp.vehicleId);
    const exportUrl = `/api/reports/export?${exportParams.toString()}`;

    return (
        <div className="space-y-10">
            <PageHeader
                title={<>Fuel receipts <span className="text-muted-foreground">(FRE)</span></>}
                scope="Fuel delivered into storage tanks — stock replenishment, not fleet consumption."
            >
                <TableCsvButton filename="fre.csv" serverUrl={exportUrl} />
            </PageHeader>

            {/* Receipts have no vehicle/cost-centre attribution, so only fuel
                type + date range apply here. */}
            <FuelLogFilters costCentres={costCentres} hideVehicle hideCostCentres />

            <div className="grid gap-6 grid-cols-2 lg:grid-cols-4">
                <IndustrialKPI
                    label="Fuel Received"
                    value={`${data.kpi.volume.toLocaleString(undefined, { maximumFractionDigits: 0 })} L`}
                    icon={ArrowUpFromLine}
                    subValue="Total volume into tanks"
                    accent
                />
                <IndustrialKPI
                    label="Receipt Value"
                    value={`${s}${data.kpi.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                    icon={Coins}
                    subValue="Value of received stock"
                />
                <IndustrialKPI
                    label="Deliveries"
                    value={data.kpi.count.toLocaleString()}
                    icon={Container}
                    subValue={`Across ${data.kpi.tanks} tank(s)`}
                />
                <IndustrialKPI
                    label="Avg Delivery"
                    value={`${avgDelivery.toLocaleString(undefined, { maximumFractionDigits: 0 })} L`}
                    icon={Gauge}
                    subValue="Volume per delivery"
                />
            </div>

            <Card className="monumental-card">
                <CardHeader>
                    <CardTitle className="text-lg font-bold tracking-tight">Replenishment trend</CardTitle>
                    <CardDescription>Daily volume received into storage tanks.</CardDescription>
                </CardHeader>
                <CardContent>
                    {data.daily.length > 0 ? (
                        <FocusedChart data={data.daily} fuelType="Volume" currencySymbol={s} color="#64748B" />
                    ) : (
                        <EmptyState
                            icon={Container}
                            title="No deliveries in this range"
                            hint="Widen the date range or upload delivery records — FRE rows are detected automatically during ingestion."
                        />
                    )}
                </CardContent>
            </Card>

            <div className="grid lg:grid-cols-2 gap-6">
                <Card className="monumental-card">
                    <CardHeader>
                        <CardTitle className="text-sm font-bold uppercase tracking-wide">Receipts by Tank</CardTitle>
                        <CardDescription>Where deliveries landed.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-sm border border-border">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead className="font-bold uppercase tracking-wider text-[10px]">Tank</TableHead>
                                        <TableHead className="font-bold uppercase tracking-wider text-[10px]">Fuel</TableHead>
                                        <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">Deliveries</TableHead>
                                        <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">Volume (L)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.byTank.map((t: any, i: number) => (
                                        <TableRow key={i}>
                                            <TableCell className="font-mono text-xs font-bold">{t.storeNo}</TableCell>
                                            <TableCell className="text-xs">{t.fuelType}</TableCell>
                                            <TableCell className="text-xs text-right font-mono">{Number(t.deliveries)}</TableCell>
                                            <TableCell className="text-xs text-right font-mono font-bold">{(t.vol || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                                        </TableRow>
                                    ))}
                                    {data.byTank.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center py-4 text-xs text-muted-foreground">No deliveries in range.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                <Card className="monumental-card">
                    <CardHeader>
                        <CardTitle className="text-sm font-bold uppercase tracking-wide">Recent Deliveries</CardTitle>
                        <CardDescription>Latest 50 FRE transactions.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-sm border border-border max-h-[420px] overflow-y-auto">
                            <Table>
                                <TableHeader className="bg-muted/50 sticky top-0 z-10">
                                    <TableRow>
                                        <TableHead className="font-bold uppercase tracking-wider text-[10px]">Date</TableHead>
                                        <TableHead className="font-bold uppercase tracking-wider text-[10px]">Ref No</TableHead>
                                        <TableHead className="font-bold uppercase tracking-wider text-[10px]">Tank</TableHead>
                                        <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">Volume (L)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.recent.map((t: any, i: number) => (
                                        <TableRow key={i}>
                                            <TableCell className="text-xs font-medium">{format(new Date(t.transDate), 'dd MMM yyyy')}</TableCell>
                                            <TableCell className="text-xs font-mono">{t.transRefNo || '—'}</TableCell>
                                            <TableCell className="text-xs font-mono">{t.storeNo}</TableCell>
                                            <TableCell className="text-xs text-right font-mono font-bold">{(t.transQty || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                                        </TableRow>
                                    ))}
                                    {data.recent.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center py-4 text-xs text-muted-foreground">No deliveries in range.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
