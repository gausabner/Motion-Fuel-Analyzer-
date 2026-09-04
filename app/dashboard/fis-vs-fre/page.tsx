import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { FuelLogFilters } from "@/components/dashboard/FuelLogFilters";
import { IndustrialKPI } from "@/components/dashboard/IndustrialKPI";
import { FlowChart } from "@/components/dashboard/FlowChart";
import { ReplenishmentForecast } from "@/components/dashboard/ReplenishmentForecast";
import { getFlowSeries, getReplenishmentForecast, type Granularity } from "@/lib/fuel-flow";
import { ArrowDownToLine, ArrowUpFromLine, Repeat, Scale } from "lucide-react";

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

    const [series, forecast, costCentres] = await Promise.all([
        getFlowSeries(granularity, filters),
        getReplenishmentForecast(),
        (prisma as any).costCentre.findMany({
            select: { department: true, division: true },
            distinct: ["department", "division"],
            orderBy: [{ department: "asc" }, { division: "asc" }],
        }),
    ]);

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

            <FlowChart data={series} granularity={granularity} />

            <ReplenishmentForecast
                forecasts={forecast.forecasts}
                leadTimeDays={forecast.leadTimeDays}
                latestIssueDate={forecast.latestIssueDate}
                latestDeliveryDate={forecast.latestDeliveryDate}
            />
        </div>
    );
}
