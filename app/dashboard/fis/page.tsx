import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { scopeRange } from "@/lib/periods";
import { getReferenceComparison } from "@/lib/reference-prices";
import { fmtLitres, fmtMoney } from "@/lib/format";
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
    // What the same litres would have cost at the reference price in force on each day.
    const ref = await getReferenceComparison(filters);
    const refDelta = ref.actualCost - ref.referenceCost;
    const refPct = ref.referenceCost > 0 ? (refDelta / ref.referenceCost) * 100 : 0;

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
        <div className="flex flex-col gap-3.5">
            <PageHeader
                title="Fuel issues"
                scope={[scopeRange(sp.from, sp.to), "Fuel issued to vehicles and plant", `${data.kpi.count.toLocaleString("en-GB")} issues`]}
            >
                <TableCsvButton filename="fis.csv" serverUrl={exportUrl} />
            </PageHeader>

            <FuelLogFilters costCentres={costCentres} />

            <UnitAttributionCard
                attribution={attribution}
                canAssign={isAdmin(sessionUser?.role)}
                exportUrl={`/api/reports/export?report=vehicle-attribution&vehicleId=${encodeURIComponent(sp.vehicleId || "")}`}
            />

            <section className="monumental-card" aria-label="Summary">
                <p className="bigline">
                    {data.kpi.count === 0
                        ? "No fuel was issued in this selection."
                        : `${fmtLitres(data.kpi.volume)} was issued to ${data.kpi.vehicles.toLocaleString("en-GB")} units, costing ${fmtMoney(data.kpi.cost, { currency: s, decimals: 0 })}.`}
                    {data.kpi.count > 0 && (
                        <small>
                            That is {fmtLitres(data.kpi.volume / data.kpi.count)} per issue on average, at {s}{(data.kpi.cost / Math.max(1, data.kpi.volume)).toFixed(2)} a litre.
                            Issues are consumption; receipts into the tanks are kept on their own page and never added to these figures.
                            {ref.coveredLitres > 0 && (
                                <>
                                    {" "}At the <Link href="/dashboard/settings#reference-prices" className="lnk">reference prices</Link> in force on each day,
                                    {" "}{fmtLitres(ref.coveredLitres)} would have cost {fmtMoney(ref.referenceCost, { currency: s, decimals: 0 })};
                                    {" "}it cost {fmtMoney(Math.abs(refDelta), { currency: s, decimals: 0 })} {refDelta >= 0 ? "more" : "less"}
                                    {" "}({refDelta >= 0 ? "+" : "−"}{Math.abs(refPct).toFixed(1)}%).
                                    {ref.uncoveredLitres > 0.5 && ` ${fmtLitres(ref.uncoveredLitres)} had no reference price to compare with.`}
                                </>
                            )}
                        </small>
                    )}
                </p>
            </section>

            <div className="grid gap-3.5 grid-cols-2 lg:grid-cols-4 stagger-tiles">
                <IndustrialKPI label="Fuel issued" value={fmtLitres(data.kpi.volume)} icon={ArrowDownToLine} subValue={`${fmtLitres(data.kpi.volume / Math.max(1, data.kpi.vehicles))} per unit`} />
                <IndustrialKPI label="Cost of issues" value={fmtMoney(data.kpi.cost, { currency: s, decimals: 0 })} icon={Coins}
                    subValue={ref.coveredLitres > 0 ? `${refDelta >= 0 ? "+" : "−"}${Math.abs(refPct).toFixed(1)}% against reference prices` : `${s}${(data.kpi.cost / Math.max(1, data.kpi.volume)).toFixed(2)} per litre`} />
                <IndustrialKPI label="Issues" value={data.kpi.count.toLocaleString("en-GB")} icon={Flame} subValue={`${fmtLitres(data.kpi.volume / Math.max(1, data.kpi.count))} per issue`} />
                <IndustrialKPI label="Units fuelled" value={data.kpi.vehicles.toLocaleString("en-GB")} icon={Truck} subValue={`${(data.kpi.count / Math.max(1, data.kpi.vehicles)).toFixed(1)} issues per unit`} />
            </div>

            <DashboardCharts
                dailyData={data.daily}
                topFleet={data.topFleet}
                topVotes={data.topVotes}
                currencySymbol={data.currencySymbol}
            />
        </div>
    );
}
