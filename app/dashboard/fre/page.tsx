import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { scopeRange } from "@/lib/periods";
import { getFlowSeries } from "@/lib/fuel-flow";
import { fmtLitres, fmtMoney } from "@/lib/format";
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
    // The other receipt source, so the page can state both figures instead of leaving the reader to find the difference.
    const flow = await getFlowSeries("yearly", { from: sp.from, to: sp.to, fuelType: sp.fuelType });
    const register = { litres: flow.reduce((x, b) => x + b.receivedLitres, 0), deliveries: flow.reduce((x, b) => x + b.deliveryCount, 0) };
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
        <div className="flex flex-col gap-3.5">
            <PageHeader
                title="Fuel receipts"
                scope={[scopeRange(sp.from, sp.to), "Receipts booked into the storage tanks", `${data.kpi.count.toLocaleString("en-GB")} receipts`]}
            >
                <TableCsvButton filename="fre.csv" serverUrl={exportUrl} />
            </PageHeader>

            {/* Receipts have no vehicle/cost-centre attribution, so only fuel
                type + date range apply here. */}
            <FuelLogFilters costCentres={costCentres} hideVehicle hideCostCentres />

            <section className="monumental-card" aria-label="Summary">
                <p className="bigline">
                    {data.kpi.count === 0
                        ? "No tank receipts are on record for this selection."
                        : `${fmtLitres(data.kpi.volume)} was booked into ${data.kpi.tanks} ${data.kpi.tanks === 1 ? "tank" : "tanks"} across ${data.kpi.count} receipts.`}
                    <small>
                        These are the receipt lines on the tank report (HR580). The supplier delivery register (HR640) is a separate report
                        and shows {fmtLitres(register.litres)} across {register.deliveries} deliveries for the same filters; it is the figure used on{" "}
                        <Link href="/dashboard/fis-vs-fre" className="lnk">Issues vs receipts</Link>. The two do not match because they cover
                        different dates and are uploaded separately, so neither is added to the other.
                    </small>
                </p>
            </section>

            <div className="grid gap-3.5 grid-cols-2 lg:grid-cols-4 stagger-tiles">
                <IndustrialKPI label="Booked into tanks" value={fmtLitres(data.kpi.volume)} icon={ArrowUpFromLine} subValue={`${fmtLitres(register.litres)} on the delivery register`} />
                <IndustrialKPI label="Value of receipts" value={fmtMoney(data.kpi.cost, { currency: s, decimals: 0 })} icon={Coins} subValue={data.kpi.volume > 0 ? `${s}${(data.kpi.cost / data.kpi.volume).toFixed(2)} per litre` : "No receipts in range"} />
                <IndustrialKPI label="Receipts" value={data.kpi.count.toLocaleString("en-GB")} icon={Container} subValue={`Across ${data.kpi.tanks} ${data.kpi.tanks === 1 ? "tank" : "tanks"}`} />
                <IndustrialKPI label="Average receipt" value={fmtLitres(avgDelivery)} icon={Gauge} subValue="Litres per receipt" />
            </div>

            <Card className="monumental-card">
                <CardHeader>
                    <CardTitle className="text-base font-semibold">Receipts over time</CardTitle>
                    <CardDescription>Daily volume received into storage tanks.</CardDescription>
                </CardHeader>
                <CardContent>
                    {data.daily.length > 0 ? (
                        <FocusedChart data={data.daily} fuelType="Volume" currencySymbol={s} color="#64748B" />
                    ) : (
                        <EmptyState
                            icon={Container}
                            title="No receipts in this range"
                            hint="Widen the date range, or upload a tank report that includes receipt lines."
                        />
                    )}
                </CardContent>
            </Card>

            <div className="grid lg:grid-cols-2 gap-3.5">
                <Card className="monumental-card">
                    <CardHeader>
                        <CardTitle className="text-base font-semibold">Receipts by tank</CardTitle>
                        <CardDescription>Where deliveries landed.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Tank</TableHead>
                                        <TableHead>Fuel</TableHead>
                                        <TableHead className="text-right">Deliveries</TableHead>
                                        <TableHead className="text-right">Volume (L)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.byTank.map((t: any, i: number) => (
                                        <TableRow key={i}>
                                            <TableCell className="mono">{t.storeNo}</TableCell>
                                            <TableCell className="text-xs">{t.fuelType}</TableCell>
                                            <TableCell className="mono text-right">{Number(t.deliveries)}</TableCell>
                                            <TableCell className="mono text-right">{Math.round(t.vol || 0).toLocaleString("en-GB")}</TableCell>
                                        </TableRow>
                                    ))}
                                    {data.byTank.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center py-4 text-xs text-muted-foreground">No receipts in this range.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                <Card className="monumental-card">
                    <CardHeader>
                        <CardTitle className="text-base font-semibold">Latest receipts</CardTitle>
                        <CardDescription>The 50 most recent receipt lines.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="max-h-[420px] overflow-y-auto">
                            <Table>
                                <TableHeader className="sticky top-0 z-10">
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Reference</TableHead>
                                        <TableHead>Tank</TableHead>
                                        <TableHead className="text-right">Volume (L)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.recent.map((t: any, i: number) => (
                                        <TableRow key={i}>
                                            <TableCell className="mono">{format(new Date(t.transDate), 'dd MMM yyyy')}</TableCell>
                                            <TableCell className="mono">{t.transRefNo || '—'}</TableCell>
                                            <TableCell className="mono">{t.storeNo}</TableCell>
                                            <TableCell className="mono text-right">{(t.transQty || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                                        </TableRow>
                                    ))}
                                    {data.recent.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center py-4 text-xs text-muted-foreground">No receipts in this range.</TableCell>
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
