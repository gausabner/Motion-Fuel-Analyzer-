import { prisma } from "@/lib/prisma";
import { scopeRange } from "@/lib/periods";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { FuelLogFilters } from "@/components/dashboard/FuelLogFilters";
import { IndustrialKPI } from "@/components/dashboard/IndustrialKPI";
import { FlowMirror } from "@/components/fuel/FlowMirror";
import { fmtLitres } from "@/lib/format";
import { ReplenishmentForecast } from "@/components/dashboard/ReplenishmentForecast";
import { FuelPriceChart } from "@/components/dashboard/FuelPriceChart";
import { getFlowSeries, getReplenishmentForecast, getCostSummary, type Granularity } from "@/lib/fuel-flow";
import { ArrowDownToLine, ArrowUpFromLine, Repeat, Scale, Wallet, Tag, TrendingUp, Scissors, TrendingDown, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

const GRANULARITIES: Granularity[] = ["daily", "monthly", "yearly"];

export default async function FisVsFrePage({
    searchParams,
}: {
    searchParams: Promise<{
        from?: string; to?: string; fuelType?: string;
        department?: string; division?: string; vehicleId?: string;
        granularity?: string;
    }>;
}) {
    const sp = await searchParams;
    const granularity: Granularity =
        GRANULARITIES.includes(sp.granularity as Granularity) ? sp.granularity as Granularity : "monthly";

    // Deliveries carry no vehicle or cost centre, so only date and fuel type can
    // scope both sides of the comparison. Applying the others would filter the
    // issued side alone and quietly break the comparison.
    const filters = { from: sp.from, to: sp.to, fuelType: sp.fuelType };

    const [series, forecast, costCentres, settings] = await Promise.all([
        getFlowSeries(granularity, filters),
        getReplenishmentForecast(filters),
        (prisma as any).costCentre.findMany({
            select: { department: true, division: true },
            distinct: ["department", "division"],
            orderBy: [{ department: "asc" }, { division: "asc" }],
        }),
        (prisma as any).systemSettings.findFirst({ where: { id: "global" } }),
    ]);
    const cost = await getCostSummary(series, filters);
    const cur = settings?.currencySymbol || "N$";
    const money = (n: number) => `${cur}${Math.round(n).toLocaleString()}`;
    const perL = (n: number | null) =>
        n === null ? "—" : `${n < 0 ? "−" : ""}${cur}${Math.abs(n).toFixed(2)}`;

    const issued = series.reduce((s, b) => s + b.issuedLitres, 0);
    const received = series.reduce((s, b) => s + b.receivedLitres, 0);
    const deliveries = series.reduce((s, b) => s + b.deliveryCount, 0);
    const net = received - issued;

    // Frequency across the covered span, not the filtered window, so a short
    // date range cannot make deliveries look artificially rare.
    const withDeliveries = series.filter(b => b.deliveryCount > 0);
    const spanDays = withDeliveries.length > 1
        ? (new Date(withDeliveries[withDeliveries.length - 1].key).getTime()
            - new Date(withDeliveries[0].key).getTime()) / 86_400_000
        : 0;
    const frequencyDays = deliveries > 1 && spanDays > 0 ? spanDays / (deliveries - 1) : null;

    return (
        <div className="flex flex-col gap-3.5">
            <PageHeader
                title="Issues vs receipts"
                scope={[scopeRange(sp.from, sp.to), `${fmtLitres(received)} received`, `${fmtLitres(issued)} issued`, `${deliveries} deliver${deliveries === 1 ? "y" : "ies"}`]}
            />

            <FuelLogFilters costCentres={costCentres} hideVehicle hideCostCentres />

            <section className="monumental-card" aria-label="Summary">
                <p className="bigline">
                    {received === 0 && issued === 0
                        ? "No fuel was received or issued in this selection."
                        : received === 0
                            ? `${fmtLitres(issued)} was issued with no receipt on record for the same dates.`
                            : Math.abs(net) / Math.max(received, 1) < 0.02
                                ? `Receipts and issues agree to within 2%: ${fmtLitres(received)} in, ${fmtLitres(issued)} out.`
                                : net > 0
                                    ? `${fmtLitres(net)} more was received than issued, ${(net / received * 100).toFixed(1)}% of what came in.`
                                    : `${fmtLitres(Math.abs(net))} more was issued than received, ${(Math.abs(net) / received * 100).toFixed(1)}% over what came in.`}
                    <small>
                        Receipts and issues are separate flows and are never added together. A difference is a book figure, not a measured loss:
                        the reports carry no opening stock or dip readings, so fuel already in the tanks at the start of the period is not counted.
                    </small>
                </p>
            </section>

            <div className="grid gap-3.5 grid-cols-2 lg:grid-cols-4 stagger-tiles">
                <IndustrialKPI
                    label="Issued"
                    value={`${Math.round(issued).toLocaleString()} L`}
                    subValue="Out to vehicles"
                    icon={ArrowUpFromLine}
                />
                <IndustrialKPI
                    label="Received"
                    value={`${Math.round(received).toLocaleString()} L`}
                    subValue={`${deliveries} deliver${deliveries === 1 ? "y" : "ies"}`}
                    icon={ArrowDownToLine}
                />
                <IndustrialKPI
                    label="Delivery frequency"
                    value={frequencyDays ? `${frequencyDays.toFixed(1)} d` : "—"}
                    subValue="Average gap between deliveries"
                    icon={Repeat}
                />
                <IndustrialKPI
                    label="Net movement"
                    value={`${net >= 0 ? "+" : ""}${Math.round(net).toLocaleString()} L`}
                    subValue={net >= 0 ? "Received exceeds issued" : "Issued exceeds received"}
                    icon={Scale}
                />
            </div>

            <div className="grid gap-3.5 grid-cols-2 lg:grid-cols-4 stagger-tiles">
                <IndustrialKPI
                    label="Cost of fuel received"
                    value={money(cost.receivedCost)}
                    subValue="What the deliveries cost to buy"
                    icon={Wallet}
                />
                <IndustrialKPI
                    label="Purchase price"
                    value={`${perL(cost.purchasePerLitre)}/L`}
                    subValue={
                        cost.priceChangePct !== null
                            ? `${cost.priceChangePct >= 0 ? "+" : ""}${cost.priceChangePct.toFixed(1)}% over the period`
                            : "Weighted average paid"
                    }
                    icon={Tag}
                />
                <IndustrialKPI
                    label="Charged out"
                    value={`${perL(cost.issuePerLitre)}/L`}
                    subValue="Average issue value"
                    icon={TrendingUp}
                />
                <IndustrialKPI
                    label="Cost recovery"
                    value={`${cost.recoveryPerLitre !== null && cost.recoveryPerLitre > 0 ? "+" : ""}${perL(cost.recoveryPerLitre)}/L`}
                    subValue={
                        cost.recoveryTotal === null ? "No overlap to compare"
                            : cost.recoveryTotal >= 0
                                ? `${money(cost.recoveryTotal)} recovered`
                                : `${money(Math.abs(cost.recoveryTotal))} not recovered`
                    }
                    icon={cost.recoveryTrend?.direction === "worsening" ? TrendingDown : Scissors}
                    accent={
                        (cost.recoveryPerLitre !== null && cost.recoveryPerLitre < 0)
                        || Boolean(cost.recoveryTrend?.reversal)
                    }
                />
            </div>

            {cost.recoveryTrend?.reversal && (
                <div className="rounded-tile bg-warn-soft p-4">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="h-4 w-4 text-warn mt-0.5 shrink-0" />
                        <div className="text-sm">
                            <p className="font-semibold text-foreground">The period average hides a reversal</p>
                            <p className="text-muted-foreground mt-1">
                                Cost recovery averages{" "}
                                <span className="font-semibold text-foreground">
                                    {cost.recoveryPerLitre! > 0 ? "+" : ""}{perL(cost.recoveryPerLitre)}/L
                                </span>{" "}
                                across this period, but it has been{" "}
                                {cost.recoveryTrend.recentPerLitre < 0 ? "negative" : "positive"} for the last{" "}
                                <span className="font-semibold text-foreground">
                                    {cost.recoveryTrend.periods} {granularity === "daily" ? "days" : granularity === "monthly" ? "months" : "years"}
                                </span>{" "}
                                — since {cost.recoveryTrend.since} — averaging{" "}
                                <span className="font-semibold text-foreground">
                                    {cost.recoveryTrend.recentPerLitre > 0 ? "+" : ""}{perL(cost.recoveryTrend.recentPerLitre)}/L
                                </span>
                                {cost.recoveryTrend.recentTotal < 0
                                    ? <> ({money(Math.abs(cost.recoveryTrend.recentTotal))} not recovered).</>
                                    : <> ({money(cost.recoveryTrend.recentTotal)} recovered).</>}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {cost.outstandingOrders > 0 && (
                <p className="text-xs text-muted-foreground">
                    {cost.outstandingOrders} order{cost.outstandingOrders === 1 ? "" : "s"} raised with nothing received
                    against {cost.outstandingOrders === 1 ? "it" : "them"} yet
                    ({Math.round(cost.outstandingLitres).toLocaleString()} L ordered) — excluded from received totals.
                </p>
            )}

            <FlowMirror data={series} granularity={granularity} />

            <FuelPriceChart data={series} currency={cur} />

            <ReplenishmentForecast
                forecasts={forecast.forecasts}
                leadTimeDays={forecast.leadTimeDays}
                latestIssueDate={forecast.latestIssueDate}
                latestDeliveryDate={forecast.latestDeliveryDate}
            />
        </div>
    );
}
