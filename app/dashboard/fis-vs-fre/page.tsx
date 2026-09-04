import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { FuelLogFilters } from "@/components/dashboard/FuelLogFilters";
import { IndustrialKPI } from "@/components/dashboard/IndustrialKPI";
import { FlowChart } from "@/components/dashboard/FlowChart";
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
        getReplenishmentForecast(),
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
        <div className="space-y-6">
            <PageHeader
                title="FIS vs FRE"
                scope="Fuel issued to the fleet against fuel received into storage · issues and deliveries are separate flows and are never summed"
            />

            <FuelLogFilters costCentres={costCentres} hideVehicle hideCostCentres />

            <div className="grid gap-6 grid-cols-2 lg:grid-cols-4">
                <IndustrialKPI
                    label="Issued (FIS)"
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

            <div className="grid gap-6 grid-cols-2 lg:grid-cols-4">
                <IndustrialKPI
                    label="Fuel spend"
                    value={money(cost.receivedCost)}
                    subValue="Cost of fuel received"
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
                <div className="rounded-md border border-amber-500/50 bg-amber-50/60 dark:bg-amber-950/20 p-4 -mt-2">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                        <div className="text-sm">
                            <p className="font-bold text-foreground">The period average hides a reversal</p>
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
                <p className="text-xs text-muted-foreground -mt-2">
                    {cost.outstandingOrders} order{cost.outstandingOrders === 1 ? "" : "s"} raised with nothing received
                    against {cost.outstandingOrders === 1 ? "it" : "them"} yet
                    ({Math.round(cost.outstandingLitres).toLocaleString()} L ordered) — excluded from received totals.
                </p>
            )}

            <FlowChart data={series} granularity={granularity} />

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
