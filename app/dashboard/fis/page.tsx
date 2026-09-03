import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { IndustrialKPI } from "@/components/dashboard/IndustrialKPI";
import { DashboardCharts } from "@/components/dashboard/Charts";
import { FuelLogFilters } from "@/components/dashboard/FuelLogFilters";
import { TableCsvButton } from "@/components/reports/ReportExports";
import { txFilters, type TxFilterOpts } from "@/lib/analytics";
import { Flame, Truck, Coins, ArrowDownToLine } from "lucide-react";
import { getVehicleAttribution } from "@/lib/vehicle-attribution";
import { UnitAttributionCard } from "@/components/dashboard/UnitAttributionCard";
import { getSessionUser, isAdmin } from "@/lib/auth";


export const dynamic = 'force-dynamic';

async function getFisData(filters: TxFilterOpts) {
    const { clause, params } = txFilters(filters);
    const base = `FROM FuelTransaction WHERE transType = 'FIS'${clause}`;

    const [totals, daily, topFleet, topVotes] = await Promise.all([
        (prisma as any).$queryRawUnsafe(`
            SELECT SUM(transQty) as vol, SUM(transAmt) as amt, COUNT(*) as cnt,
                   COUNT(DISTINCT vehicleId) as vehicles
            ${base}
        `, ...params),
        (prisma as any).$queryRawUnsafe(`
            SELECT transDate as date, fuelType, SUM(transQty) as totalVolume, SUM(transAmt) as totalCost
            ${base}
            GROUP BY transDate, fuelType
            ORDER BY transDate ASC
        `, ...params),
        (prisma as any).$queryRawUnsafe(`
            SELECT vehicleId as name, SUM(transQty) as value
            ${base}
            GROUP BY vehicleId
            ORDER BY value DESC
            LIMIT 10
        `, ...params),
        (prisma as any).$queryRawUnsafe(`
            SELECT transVoteNo as name,
                   SUM(CASE WHEN fuelType LIKE '%Petrol%' THEN transQty ELSE 0 END) as petrol,
                   SUM(CASE WHEN fuelType LIKE '%Diesel%' THEN transQty ELSE 0 END) as diesel,
                   SUM(transQty) as value
            ${base} AND transVoteNo IS NOT NULL AND transVoteNo != ''
            GROUP BY transVoteNo
            ORDER BY value DESC
            LIMIT 10
        `, ...params),
    ]);

    const settings = await (prisma as any).systemSettings.findFirst({ where: { id: 'global' } });

    return {
        kpi: {
            volume: totals[0]?.vol || 0,
            cost: totals[0]?.amt || 0,
            count: Number(totals[0]?.cnt || 0),
            vehicles: Number(totals[0]?.vehicles || 0),
        },
        currencySymbol: settings?.currencySymbol || "N$",
        daily: daily.map((d: any) => ({
            date: d.date,
            fuelType: d.fuelType,
            totalVolume: d.totalVolume || 0,
            totalCost: d.totalCost || 0,
        })),
        topFleet: topFleet.map((f: any) => ({ name: f.name || 'Unknown', value: f.value || 0 })),
        topVotes: topVotes.map((v: any) => ({
            name: v.name || 'Unassigned',
            value: v.value || 0,
            petrol: v.petrol || 0,
            diesel: v.diesel || 0,
        })),
    };
}

export default async function FISPage({
    searchParams
}: {
    searchParams: Promise<{ from?: string, to?: string, fuelType?: string, department?: string, division?: string, vehicleId?: string }>
}) {
    const sp = await searchParams;
    const filters: TxFilterOpts = {
        from: sp.from, to: sp.to, fuelType: sp.fuelType,
        department: sp.department, division: sp.division, vehicleId: sp.vehicleId,
    };
    const data = await getFisData(filters);
    // Attribution only matters when the view is scoped to a unit.
    const [attribution, sessionUser] = await Promise.all([
        getVehicleAttribution(sp.vehicleId || "", filters),
        getSessionUser(),
    ]);
    const s = data.currencySymbol;

    const costCentres = await (prisma as any).costCentre.findMany({
        select: { department: true, division: true },
        distinct: ['department', 'division'],
        orderBy: [{ department: 'asc' }, { division: 'asc' }],
    });

    // CSV mirrors the active filters, so the download matches the KPIs on screen.
    const exportParams = new URLSearchParams({ report: "fis" });
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
                title={<>Fuel issues <span className="text-primary">(FIS)</span></>}
                scope="Fuel extracted from tanks and issued to fleet vehicles — this is true consumption."
            >
                <TableCsvButton filename="fis.csv" serverUrl={exportUrl} />
            </PageHeader>

            <FuelLogFilters costCentres={costCentres} />

            <UnitAttributionCard
                attribution={attribution}
                canAssign={isAdmin(sessionUser?.role)}
                exportUrl={`/api/reports/export?report=vehicle-attribution&vehicleId=${encodeURIComponent(sp.vehicleId || "")}`}
            />

            <div className="grid gap-6 grid-cols-2 lg:grid-cols-4">
                <IndustrialKPI
                    label="Fuel Issued"
                    value={`${data.kpi.volume.toLocaleString(undefined, { maximumFractionDigits: 0 })} L`}
                    icon={ArrowDownToLine}
                    subValue="Total volume issued to fleet"
                    accent
                />
                <IndustrialKPI
                    label="Issue Cost"
                    value={`${s}${data.kpi.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                    icon={Coins}
                    subValue="Value of issued fuel"
                />
                <IndustrialKPI
                    label="Issue Transactions"
                    value={data.kpi.count.toLocaleString()}
                    icon={Flame}
                    subValue="FIS records in range"
                />
                <IndustrialKPI
                    label="Vehicles Fuelled"
                    value={data.kpi.vehicles.toLocaleString()}
                    icon={Truck}
                    subValue="Distinct fleet units"
                />
            </div>

            <DashboardCharts
                dailyData={data.daily}
                topFleet={data.topFleet}
                topVotes={data.topVotes}
            />
        </div>
    );
}
