import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { FuelLogFilters } from "@/components/dashboard/FuelLogFilters";
import { IndustrialKPI } from "@/components/dashboard/IndustrialKPI";
import { FlowChart } from "@/components/dashboard/FlowChart";
import { ReplenishmentForecast } from "@/components/dashboard/ReplenishmentForecast";
import { FuelPriceChart } from "@/components/dashboard/FuelPriceChart";
import { getFlowSeries, getReplenishmentForecast, getCostSummary, type Granularity } from "@/lib/fuel-flow";
import { ArrowDownToLine, ArrowUpFromLine, Repeat, Scale, Wallet, Tag, TrendingUp, Scissors } from "lucide-react";

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
    const perL = (n: number | null) => (n === null ? "—" : `${cur}${n.toFixed(2)}`);

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
                    value={`${cost.recoveryPerLitre !== null && cost.recoveryPerLitre >= 0 ? "+" : ""}${perL(cost.recoveryPerLitre)}/L`}
                    subValue={
                        cost.recoveryTotal === null ? "No overlap to compare"
                            : cost.recoveryTotal >= 0
                                ? `${money(cost.recoveryTotal)} recovered`
                                : `${money(Math.abs(cost.recoveryTotal))} not recovered`
                    }
                    icon={Scissors}
                    accent={cost.recoveryPerLitre !== null && cost.recoveryPerLitre < 0}
                />
            </div>

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
