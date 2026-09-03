import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { toLocalYmd } from "@/lib/date-format";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { UnassignedVotesBadge } from "@/components/dashboard/UnassignedVotesBadge";
import { FuelLogFilters } from "@/components/dashboard/FuelLogFilters";
import { DashboardCharts } from "@/components/dashboard/Charts";
import { FileUpload } from "@/components/dashboard/FileUpload";
import { DashboardInteractivity } from "@/components/dashboard/DashboardInteractivity";

export const dynamic = 'force-dynamic';

async function getDashboardData(filters: { vehicleId?: string, fuelType?: string, department?: string, division?: string, from?: string, to?: string }) {
    // Consumption = FIS only (fuel issued to vehicles). FRE/GRN/etc. are stock
    // movements into tanks and must never count as fleet consumption.
    let queryCondition = "t.transType = 'FIS'";
    const params: any[] = [];

    if (filters.vehicleId) {
        queryCondition += ` AND t.vehicleId LIKE ?`;
        params.push(`%${filters.vehicleId}%`);
    }

    if (filters.fuelType && filters.fuelType !== 'all') {
        const typePattern = filters.fuelType === 'Petrol' ? '%Petrol%' : (filters.fuelType === 'Diesel' ? '%Diesel%' : filters.fuelType);
        queryCondition += ` AND t.fuelType LIKE ?`;
        params.push(`%${typePattern}%`);
    }

    if (filters.department) {
        queryCondition += ` AND c.department LIKE ?`;
        params.push(`%${filters.department}%`);
    }

    if (filters.division) {
        queryCondition += ` AND c.division LIKE ?`;
        params.push(`%${filters.division}%`);
    }

    if (filters.from) {
        queryCondition += ` AND t.transDate >= ?`;
        params.push(filters.from); // ISO String or Date string
    }
    if (filters.to) {
        queryCondition += ` AND t.transDate <= ?`;
        const toDate = new Date(filters.to);
        toDate.setHours(23, 59, 59, 999);
        params.push(toDate.toISOString());
    }

    // 1. KPI Cards
    const totalStats = await (prisma as any).$queryRawUnsafe(`
        SELECT t.fuelType, SUM(t.transQty) as totalQty, SUM(t.transAmt) as totalAmt
        FROM FuelTransaction t
        LEFT JOIN CostCentre c ON t.transVoteNo = c.voteNo
        WHERE ${queryCondition}
        GROUP BY t.fuelType
    `, ...params) as any[];

    const petrol = totalStats.filter((s: any) => s.fuelType.toLowerCase().includes('petrol')).reduce((acc: number, curr: any) => acc + (curr.totalQty || 0), 0);
    const diesel = totalStats.filter((s: any) => s.fuelType.toLowerCase().includes('diesel')).reduce((acc: number, curr: any) => acc + (curr.totalQty || 0), 0);
    const totalCost = totalStats.reduce((acc: number, curr: any) => acc + (curr.totalAmt || 0), 0);

    // 2. Trend Line Chart
    const rawDaily = await (prisma as any).$queryRawUnsafe(`
        SELECT t.transDate, t.fuelType, SUM(t.transQty) as totalQty, SUM(t.transAmt) as totalAmt
        FROM FuelTransaction t
        LEFT JOIN CostCentre c ON t.transVoteNo = c.voteNo
        WHERE ${queryCondition}
        GROUP BY t.transDate, t.fuelType
        ORDER BY t.transDate ASC
    `, ...params) as any[];

    const dailyData = rawDaily.map((d: any) => ({
        date: d.transDate,
        fuelType: d.fuelType,
        totalVolume: d.totalQty || 0,
        totalCost: d.totalAmt || 0
    }));

    // 3. Top Fleet Units
    const topFleet = await (prisma as any).$queryRawUnsafe(`
        SELECT t.vehicleId, SUM(t.transQty) as totalQty
        FROM FuelTransaction t
        LEFT JOIN CostCentre c ON t.transVoteNo = c.voteNo
        WHERE ${queryCondition}
        GROUP BY t.vehicleId
        ORDER BY totalQty DESC
        LIMIT 10
    `, ...params) as any[];

    // 4. Top divisions by consumption — resolved votes roll up under their
    // division; every unresolved vote collapses into one "Unassigned" row.
    const topVotes = await (prisma as any).$queryRawUnsafe(`
        SELECT
            COALESCE(c.division, 'Unassigned') as label,
            SUM(CASE WHEN t.fuelType LIKE '%Petrol%' THEN t.transQty ELSE 0 END) as petrolQty,
            SUM(CASE WHEN t.fuelType LIKE '%Diesel%' THEN t.transQty ELSE 0 END) as dieselQty,
            SUM(t.transQty) as totalQty
        FROM FuelTransaction t
        LEFT JOIN CostCentre c ON t.transVoteNo = c.voteNo
        WHERE ${queryCondition}
        GROUP BY COALESCE(c.division, 'Unassigned')
        ORDER BY totalQty DESC
        LIMIT 10
    `, ...params) as any[];

    // 5. System Settings
    let settings = null;
    try {
        settings = await (prisma as any).systemSettings.findFirst({ where: { id: 'global' } });
    } catch (e: any) {
        console.error('[Dashboard] Failed to fetch settings:', e.message);
    }

    // 6. Departments & Divisions (Cost Centres)
    const costCentres = await (prisma as any).costCentre.findMany({
        select: { department: true, division: true },
        distinct: ['department', 'division'],
        orderBy: [{ department: 'asc' }, { division: 'asc' }]
    });

    const activeUnitsList = await (prisma as any).$queryRawUnsafe(`
        SELECT 
            t.vehicleId,
            SUM(CASE WHEN t.fuelType LIKE '%Petrol%' THEN t.transQty ELSE 0.0 END) as petrolQty,
            SUM(CASE WHEN t.fuelType LIKE '%Diesel%' THEN t.transQty ELSE 0.0 END) as dieselQty,
            SUM(t.transQty) as totalQty
        FROM FuelTransaction t
        LEFT JOIN CostCentre c ON t.transVoteNo = c.voteNo
        WHERE ${queryCondition}
        GROUP BY t.vehicleId
        ORDER BY totalQty DESC
    `, ...params) as any[];

    const activeUnitsCount = activeUnitsList.length;

    const top20Scatter = activeUnitsList.slice(0, 20).map((unit, index) => ({
        id: unit.vehicleId || 'Unknown',
        x: index + 1,
        y: Number(unit.totalQty || 0),
        petrol: Number(unit.petrolQty || 0),
        diesel: Number(unit.dieselQty || 0)
    }));

    // 8. Avg Price Analysis
    const totalVol = petrol + diesel;
    const actualAvgPrice = totalVol > 0 ? totalCost / totalVol : 0;

    // Calculate Weighted Set Price
    const setPetrolPrice = settings?.petrolPrice || 0;
    const setDieselPrice = settings?.dieselPrice || 0;

    let weightedSetPrice = 0;
    if (totalVol > 0) {
        weightedSetPrice = ((petrol * setPetrolPrice) + (diesel * setDieselPrice)) / totalVol;
    }

    const priceDeviation = weightedSetPrice > 0
        ? ((actualAvgPrice - weightedSetPrice) / weightedSetPrice) * 100
        : 0;


    const dailyAggregatedData = dailyData.reduce((acc: any[], day: any) => {
        // Group by LOCAL calendar day so chart labels match the picked range.
        const dateKey = toLocalYmd(day.date);
        const existing = acc.find(d => d.date === dateKey);
        if (existing) {
            existing.totalVolume += day.totalVolume;
            existing.totalCost += day.totalCost;
        } else {
            acc.push({
                date: dateKey,
                totalVolume: day.totalVolume,
                totalCost: day.totalCost
            });
        }
        return acc;
    }, []);

    const dailyAvgPriceList = dailyAggregatedData.map(day => ({
        date: day.date,
        value: day.totalVolume > 0 ? day.totalCost / day.totalVolume : 0
    }));

    const dailySpendData = dailyAggregatedData.map(day => ({
        date: day.date,
        value: day.totalCost
    }));

    return {
        kpi: {
            petrol,
            diesel,
            totalCost,
            activeUnitsCount,
            priceDeviation: Math.round(priceDeviation), // Integer percentage
            actualAvgPrice
        },
        currencySymbol: settings?.currencySymbol || "N$",
        daily: dailyData,
        dailyAvgPriceData: dailyAvgPriceList, // For Scatter Modal
        dailySpendData, // For Total Spend Modal
        dailyVolumeData: dailyAggregatedData.map(d => ({
            date: d.date,
            totalVol: d.totalVolume
        })),
        costCentres: costCentres,
        activeUnitsList: activeUnitsList.map((u: any) => ({
            vehicleId: u.vehicleId || 'Unknown',
            petrol: Number(u.petrolQty || 0),
            diesel: Number(u.dieselQty || 0),
            total: Number(u.totalQty || 0)
        })),
        top20Scatter: top20Scatter,
        topFleet: topFleet.map((f: any) => ({
            name: f.vehicleId || 'Unknown',
            value: f.totalQty || 0
        })),
        topVotes: topVotes.map((v: any, i: number) => ({
            // Renderer expects a "#rank Name" label; keep that contract.
            name: `#${i + 1} ${v.label || 'Unassigned'}`,
            value: v.totalQty || 0,
            petrol: v.petrolQty || 0,
            diesel: v.dieselQty || 0
        }))
    };
}

export default async function DashboardPage({
    searchParams
}: {
    searchParams: Promise<{ vehicleId?: string, fuelType?: string, department?: string, division?: string, from?: string, to?: string }>
}) {
    const params = await searchParams;

    // No explicit date range: default to the latest month that has data,
    // via redirect so the URL (and the date picker) reflect the applied range.
    if (!params.from && !params.to) {
        const latest = await (prisma as any).$queryRawUnsafe(
            `SELECT MAX(transDate) as maxDate FROM FuelTransaction WHERE transType = 'FIS' AND transDate <= ?`,
            new Date().toISOString()
        ) as any[];
        const maxDate = latest?.[0]?.maxDate ? new Date(latest[0].maxDate) : null;

        if (maxDate && !isNaN(maxDate.getTime())) {
            // Mirror the DateRangePicker's serialization: local-midnight dates as ISO strings
            const from = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
            const to = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0);
            redirect(`/dashboard?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`);
        }
    }

    const data = await getDashboardData(params);

    const scopeRange = params.from && params.to
        ? `${new Date(params.from).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} – ${new Date(params.to).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
        : "all recorded data";

    return (
        <div className="space-y-10">
            <PageHeader
                title="Fuel intelligence"
                scope={`Fleet consumption for ${scopeRange} · FIS transactions only`}
            >
                <UnassignedVotesBadge />
                <FileUpload />
            </PageHeader>

            <FuelLogFilters costCentres={data.costCentres} />

            <DashboardInteractivity
                key={JSON.stringify(params)}
                data={data}
                currencySymbol={data.currencySymbol}
            />

            <DashboardCharts
                dailyData={data.daily}
                topFleet={data.topFleet}
                topVotes={data.topVotes}
            />
        </div>
    );
}
