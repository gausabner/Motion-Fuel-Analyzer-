import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FISTable } from "@/components/reports/FISTable";
import { FRETable } from "@/components/reports/FRETable";
import { DailyConsumptionTable } from "@/components/reports/DailyConsumptionTable";
import { TopFleetTable } from "@/components/reports/TopFleetTable";
import { CostCentreTable } from "@/components/reports/CostCentreTable";
import { TopVotesTable } from "@/components/reports/TopVotesTable";
import { ConsumptionSummary } from "@/components/reports/ConsumptionSummary";
import { TableCsvButton, FullReportPdfButton, type ReportSection } from "@/components/reports/ReportExports";
import {
    getFISData,
    getFREData,
    getDailyConsumption,
    getTopFleet,
    getCostCentreAnalysis,
    getTopVotes,
    getConsumptionSummary,
} from "@/lib/analytics";
import { prisma } from "@/lib/prisma";
import { FuelLogFilters } from "@/components/dashboard/FuelLogFilters";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { toLocalYmd } from "@/lib/date-format";
import { getVehicleAttribution } from "@/lib/vehicle-attribution";
import { UnitAttributionCard } from "@/components/dashboard/UnitAttributionCard";
import { getSessionUser, isAdmin } from "@/lib/auth";


export const dynamic = 'force-dynamic';

// Stored dates are local-midnight instants — format in local time, not UTC.
const fmtDate = (d: any) => toLocalYmd(d);

export default async function ReportsPage({
    searchParams
}: {
    searchParams: Promise<{ from?: string, to?: string, fuelType?: string, department?: string, division?: string, vehicleId?: string }>
}) {
    const params = await searchParams;
    const { from, to } = params;

    // Whole-report filter set. Every FIS-derived table, the PDF and all CSV
    // links below are scoped by this.
    const filters = {
        from, to,
        fuelType: params.fuelType,
        department: params.department,
        division: params.division,
        vehicleId: params.vehicleId,
    };
    // Receipts carry no cost-centre and no real vehicle (all FRE rows are vote-less
    // with vehicleId "UNKNOWN"), so department/division/vehicle would zero the FRE
    // section out. It deliberately honours date + fuel type only.
    const freFilters = { from, to, fuelType: params.fuelType };

    const [
        fisData, freData, dailyData,
        fleetPetrol, fleetDiesel,
        costCentreData, topVotesPetrol, topVotesDiesel,
        summary, settings, costCentres
    ] = await Promise.all([
        getFISData(100, filters),
        getFREData(100, freFilters),
        getDailyConsumption(filters),
        getTopFleet('Petrol', filters),
        getTopFleet('Diesel', filters),
        getCostCentreAnalysis(filters),
        getTopVotes('Petrol', filters),
        getTopVotes('Diesel', filters),
        getConsumptionSummary(filters),
        (prisma as any).systemSettings.findFirst({ where: { id: 'global' } }),
        (prisma as any).costCentre.findMany({
            select: { department: true, division: true },
            distinct: ['department', 'division'],
            orderBy: [{ department: 'asc' }, { division: 'asc' }],
        }),
    ]);

    // Attribution only matters when the report is scoped to a unit.
    const [attribution, sessionUser] = await Promise.all([
        getVehicleAttribution(params.vehicleId || "", filters),
        getSessionUser(),
    ]);

    const currencySymbol = settings?.currencySymbol || "N$";

    const isPetrol = (t: any) => String(t).toLowerCase().includes('petrol');
    const isDiesel = (t: any) => String(t).toLowerCase().includes('diesel');
    const fisPetrol = fisData.filter((t: any) => isPetrol(t.fuelType));
    const fisDiesel = fisData.filter((t: any) => isDiesel(t.fuelType));
    const frePetrol = freData.filter((t: any) => isPetrol(t.fuelType));
    const freDiesel = freData.filter((t: any) => isDiesel(t.fuelType));
    const dailyPetrol = dailyData.filter((d: any) => isPetrol(d.fuelType));
    const dailyDiesel = dailyData.filter((d: any) => isDiesel(d.fuelType));

    // Query string appended to server CSV export links so they honour every active
    // filter, not just the range — keeping each download identical to its table.
    const qs = (extra: Record<string, string | undefined>) =>
        Object.entries(extra)
            .filter(([, v]) => v)
            .map(([k, v]) => `&${k}=${encodeURIComponent(v as string)}`)
            .join('');
    const filterQS = qs({
        from, to,
        fuelType: params.fuelType && params.fuelType !== 'all' ? params.fuelType : undefined,
        department: params.department,
        division: params.division,
        vehicleId: params.vehicleId,
    });
    // FRE mirrors its date+fuel-only carve-out above.
    const freQS = qs({ from, to, fuelType: params.fuelType && params.fuelType !== 'all' ? params.fuelType : undefined });

    const rangeLabel = from && to
        ? `${fmtDate(from)} → ${fmtDate(to)}`
        : "All recorded data";
    // Human-readable summary of the non-date filters, for the header and the PDF.
    const activeFilters = [
        params.department ? `Dept: ${params.department}` : null,
        params.division ? `Division: ${params.division}` : null,
        params.vehicleId ? `Unit: ${params.vehicleId}` : null,
        params.fuelType && params.fuelType !== 'all' ? `Fuel: ${params.fuelType}` : null,
    ].filter(Boolean) as string[];
    const scopeLabel = [rangeLabel, ...activeFilters].join(' · ');

    // ---- Sections for the full PDF report ----
    const pdfSections: ReportSection[] = [
        {
            title: "Consumption Summary",
            headers: ["Fuel Type", "Volume (L)", `Cost (${currencySymbol})`, "Transactions"],
            rows: [
                ["Petrol", summary.petrolVolume.toFixed(2), summary.petrolCost.toFixed(2), summary.petrolCount],
                ["Diesel", summary.dieselVolume.toFixed(2), summary.dieselCost.toFixed(2), summary.dieselCount],
                ["Total", (summary.petrolVolume + summary.dieselVolume).toFixed(2), (summary.petrolCost + summary.dieselCost).toFixed(2), summary.petrolCount + summary.dieselCount],
            ],
        },
        {
            title: "Daily Petrol Consumption",
            headers: ["Date", "Volume (L)", `Cost (${currencySymbol})`],
            rows: dailyPetrol.map((d: any) => [fmtDate(d.date), d.volume.toFixed(2), d.cost.toFixed(2)]),
        },
        {
            title: "Daily Diesel Consumption",
            headers: ["Date", "Volume (L)", `Cost (${currencySymbol})`],
            rows: dailyDiesel.map((d: any) => [fmtDate(d.date), d.volume.toFixed(2), d.cost.toFixed(2)]),
        },
        {
            title: "Top 10 Petrol Fleet Units",
            headers: ["Rank", "Fleet Unit", "Volume (L)", `Cost (${currencySymbol})`],
            rows: fleetPetrol.map((d: any, i: number) => [i + 1, d.vehicleId || '', d.volume.toFixed(2), d.cost.toFixed(2)]),
        },
        {
            title: "Top 10 Diesel Fleet Units",
            headers: ["Rank", "Fleet Unit", "Volume (L)", `Cost (${currencySymbol})`],
            rows: fleetDiesel.map((d: any, i: number) => [i + 1, d.vehicleId || '', d.volume.toFixed(2), d.cost.toFixed(2)]),
        },
        {
            title: "Issue Vote Consumption (Petrol & Diesel)",
            headers: ["Vote No", "Division", "Department", "Petrol (L)", "Diesel (L)", "Total (L)"],
            rows: costCentreData.map((d: any) => [d.cc.voteNo, d.cc.division, d.cc.department, d.petrol.toFixed(2), d.diesel.toFixed(2), (d.petrol + d.diesel).toFixed(2)]),
        },
        {
            title: "Top 10 Petrol Issue Votes",
            headers: ["Rank", "Vote No", "Division", "Volume (L)", `Cost (${currencySymbol})`],
            rows: topVotesPetrol.map((d: any, i: number) => [i + 1, d.voteNo, d.division, d.volume.toFixed(2), d.cost.toFixed(2)]),
        },
        {
            title: "Top 10 Diesel Issue Votes",
            headers: ["Rank", "Vote No", "Division", "Volume (L)", `Cost (${currencySymbol})`],
            rows: topVotesDiesel.map((d: any, i: number) => [i + 1, d.voteNo, d.division, d.volume.toFixed(2), d.cost.toFixed(2)]),
        },
        {
            title: "Fuel Issues (FIS)",
            note: "Most recent 100 transactions shown — download the FIS CSV for the complete list.",
            headers: ["Date", "Issue Vote", "Fleet Unit", "Tank", "Fuel", "Volume (L)", `Cost (${currencySymbol})`],
            rows: fisData.map((t: any) => [fmtDate(t.transDate), t.transVoteNo || '', t.vehicleId || '', t.storeNo, t.fuelType, t.transQty?.toFixed(2), t.transAmt?.toFixed(2) ?? '0.00']),
        },
        {
            title: "Fuel Receipts (FRE)",
            note: "Most recent 100 transactions shown — download the FRE CSV for the complete list."
                + ((params.department || params.division || params.vehicleId)
                    ? " Receipts are not attributed to cost centres, so department, division and unit filters do not apply to this section."
                    : ""),
            headers: ["Date", "Ref No", "Tank", "Fuel", "Volume (L)", `Cost (${currencySymbol})`],
            rows: freData.map((t: any) => [fmtDate(t.transDate), t.transRefNo || '', t.storeNo, t.fuelType, t.transQty?.toFixed(2), t.transAmt?.toFixed(2) ?? '0.00']),
        },
    ];

    const csvUrl = (report: string) => `/api/reports/export?report=${report}${filterQS}`;

    // When the report is scoped to a single unit, lead the PDF with who it belongs to.
    if (attribution?.unit) {
        const u = attribution.unit;
        pdfSections.unshift({
            title: `Unit Attribution — ${u.unitNo}`,
            note: u.primary
                ? `Cost centre: ${u.primary.department} / ${u.primary.division}`
                    + (u.departments.length > 1 ? ` (highest-volume of ${u.departments.length} departments)` : "")
                    + (u.unresolved.length ? ` · ${u.unresolved.length} vote(s) not registered to a cost centre.` : "")
                : `This unit has no registered cost centre — ${u.unresolved.length} vote(s) are unregistered.`,
            headers: ["Issue Vote", "Department", "Division", "Litres", "Txns", "Status"],
            rows: u.votes.map(v => [
                v.voteNo,
                v.department ?? (v.suggestedDepartment ? `UNREGISTERED (suggested: ${v.suggestedDepartment})` : "UNREGISTERED"),
                v.division ?? "",
                v.litres.toFixed(2),
                v.txns,
                v.department ? "Assigned" : "Unregistered",
            ]),
        });
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Fuel report"
                scope={`${scopeLabel} · every table exports to CSV, the full report to PDF`}
            >
                <FullReportPdfButton
                    title="MOTION FUEL ANALYZER — FUEL REPORT"
                    subtitle={`Reporting period: ${rangeLabel}${activeFilters.length ? ` · ${activeFilters.join(' · ')}` : ''}`}
                    sections={pdfSections}
                />
            </PageHeader>

            <FuelLogFilters costCentres={costCentres} hideFuelType />

            <UnitAttributionCard
                attribution={attribution}
                canAssign={isAdmin(sessionUser?.role)}
                exportUrl={`/api/reports/export?report=vehicle-attribution&vehicleId=${encodeURIComponent(params.vehicleId || "")}`}
            />

            <Tabs defaultValue="summary" className="space-y-4">
                <TabsList className="bg-muted p-1 flex-wrap h-auto">
                    <TabsTrigger value="summary" className="data-[state=active]:bg-card shadow-none">Summary</TabsTrigger>
                    <TabsTrigger value="consumption" className="data-[state=active]:bg-card shadow-none">Daily Consumption</TabsTrigger>
                    <TabsTrigger value="fleet" className="data-[state=active]:bg-card shadow-none">Fleet Analysis</TabsTrigger>
                    <TabsTrigger value="votes" className="data-[state=active]:bg-card shadow-none">Issue Votes</TabsTrigger>
                    <TabsTrigger value="transactions" className="data-[state=active]:bg-card shadow-none">Transactions (FIS/FRE)</TabsTrigger>
                </TabsList>

                {/* ============ SUMMARY ============ */}
                <TabsContent value="summary" className="space-y-4">
                    <Card className="monumental-card">
                        <CardHeader className="flex flex-row items-start justify-between gap-4">
                            <div>
                                <CardTitle>Total Consumption Summary</CardTitle>
                                <CardDescription>Total petrol and diesel consumption for {rangeLabel.toLowerCase()}.</CardDescription>
                            </div>
                            <TableCsvButton filename="summary.csv" serverUrl={csvUrl("summary")} />
                        </CardHeader>
                        <CardContent>
                            <ConsumptionSummary data={summary} currencySymbol={currencySymbol} />
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ============ DAILY CONSUMPTION ============ */}
                <TabsContent value="consumption" className="space-y-4">
                    <div className="grid lg:grid-cols-2 gap-4">
                        <Card className="monumental-card">
                            <CardHeader className="flex flex-row items-start justify-between gap-4">
                                <div>
                                    <CardTitle>Daily Petrol Consumption</CardTitle>
                                    <CardDescription>Volume and cost per day.</CardDescription>
                                </div>
                                <TableCsvButton filename="daily_petrol.csv" serverUrl={csvUrl("daily-petrol")} />
                            </CardHeader>
                            <CardContent>
                                <DailyConsumptionTable data={dailyPetrol} />
                            </CardContent>
                        </Card>
                        <Card className="monumental-card">
                            <CardHeader className="flex flex-row items-start justify-between gap-4">
                                <div>
                                    <CardTitle>Daily Diesel Consumption</CardTitle>
                                    <CardDescription>Volume and cost per day.</CardDescription>
                                </div>
                                <TableCsvButton filename="daily_diesel.csv" serverUrl={csvUrl("daily-diesel")} />
                            </CardHeader>
                            <CardContent>
                                <DailyConsumptionTable data={dailyDiesel} />
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* ============ FLEET ============ */}
                <TabsContent value="fleet" className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                        <Card className="monumental-card">
                            <CardHeader className="flex flex-row items-start justify-between gap-4">
                                <div>
                                    <CardTitle>Top 10 Petrol Fleet</CardTitle>
                                    <CardDescription>Highest consuming petrol vehicles.</CardDescription>
                                </div>
                                <TableCsvButton filename="top_fleet_petrol.csv" serverUrl={csvUrl("top-fleet-petrol")} />
                            </CardHeader>
                            <CardContent>
                                <TopFleetTable data={fleetPetrol} />
                            </CardContent>
                        </Card>
                        <Card className="monumental-card">
                            <CardHeader className="flex flex-row items-start justify-between gap-4">
                                <div>
                                    <CardTitle>Top 10 Diesel Fleet</CardTitle>
                                    <CardDescription>Highest consuming diesel vehicles.</CardDescription>
                                </div>
                                <TableCsvButton filename="top_fleet_diesel.csv" serverUrl={csvUrl("top-fleet-diesel")} />
                            </CardHeader>
                            <CardContent>
                                <TopFleetTable data={fleetDiesel} />
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* ============ ISSUE VOTES ============ */}
                <TabsContent value="votes" className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                        <Card className="monumental-card">
                            <CardHeader className="flex flex-row items-start justify-between gap-4">
                                <div>
                                    <CardTitle>Top 10 Petrol Issue Votes</CardTitle>
                                    <CardDescription>Highest petrol-consuming divisions.</CardDescription>
                                </div>
                                <TableCsvButton filename="top_votes_petrol.csv" serverUrl={csvUrl("top-votes-petrol")} />
                            </CardHeader>
                            <CardContent>
                                <TopVotesTable data={topVotesPetrol} />
                            </CardContent>
                        </Card>
                        <Card className="monumental-card">
                            <CardHeader className="flex flex-row items-start justify-between gap-4">
                                <div>
                                    <CardTitle>Top 10 Diesel Issue Votes</CardTitle>
                                    <CardDescription>Highest diesel-consuming divisions.</CardDescription>
                                </div>
                                <TableCsvButton filename="top_votes_diesel.csv" serverUrl={csvUrl("top-votes-diesel")} />
                            </CardHeader>
                            <CardContent>
                                <TopVotesTable data={topVotesDiesel} />
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="monumental-card">
                        <CardHeader className="flex flex-row items-start justify-between gap-4">
                            <div>
                                <CardTitle>Issue Vote Consumption</CardTitle>
                                <CardDescription>Petrol and diesel consumption per individual Issue Vote, with division and department.</CardDescription>
                            </div>
                            <TableCsvButton filename="vote_consumption.csv" serverUrl={csvUrl("votes")} />
                        </CardHeader>
                        <CardContent>
                            <CostCentreTable data={costCentreData} />
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ============ TRANSACTIONS ============ */}
                <TabsContent value="transactions" className="space-y-4">
                    <Card className="monumental-card">
                        <CardHeader className="flex flex-row items-start justify-between gap-4">
                            <div>
                                <CardTitle>Fuel Issues (FIS)</CardTitle>
                                <CardDescription>Fuel issued to vehicles (removed from tank). Showing latest 100 — CSV includes all.</CardDescription>
                            </div>
                            <div className="flex gap-2">
                                <TableCsvButton filename="fis.csv" serverUrl={csvUrl("fis")} />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Tabs defaultValue="all">
                                <TabsList className="bg-muted p-1 mb-3">
                                    <TabsTrigger value="all" className="data-[state=active]:bg-card shadow-none text-xs">All ({fisData.length})</TabsTrigger>
                                    <TabsTrigger value="petrol" className="data-[state=active]:bg-card shadow-none text-xs">Petrol ({fisPetrol.length})</TabsTrigger>
                                    <TabsTrigger value="diesel" className="data-[state=active]:bg-card shadow-none text-xs">Diesel ({fisDiesel.length})</TabsTrigger>
                                </TabsList>
                                <TabsContent value="all"><FISTable data={fisData} /></TabsContent>
                                <TabsContent value="petrol"><FISTable data={fisPetrol} /></TabsContent>
                                <TabsContent value="diesel"><FISTable data={fisDiesel} /></TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>

                    <Card className="monumental-card">
                        <CardHeader className="flex flex-row items-start justify-between gap-4">
                            <div>
                                <CardTitle>Fuel Receipts (FRE)</CardTitle>
                                <CardDescription>
                                    Fuel received into tanks (stock replenishment). Showing latest 100 — CSV includes all.
                                    {(params.department || params.division || params.vehicleId) && (
                                        <span className="block mt-1 text-amber-600 font-medium">
                                            Receipts aren&apos;t attributed to cost centres — department, division and unit filters don&apos;t apply here.
                                        </span>
                                    )}
                                </CardDescription>
                            </div>
                            <TableCsvButton filename="fre.csv" serverUrl={`/api/reports/export?report=fre${freQS}`} />
                        </CardHeader>
                        <CardContent>
                            <Tabs defaultValue="all">
                                <TabsList className="bg-muted p-1 mb-3">
                                    <TabsTrigger value="all" className="data-[state=active]:bg-card shadow-none text-xs">All ({freData.length})</TabsTrigger>
                                    <TabsTrigger value="petrol" className="data-[state=active]:bg-card shadow-none text-xs">Petrol ({frePetrol.length})</TabsTrigger>
                                    <TabsTrigger value="diesel" className="data-[state=active]:bg-card shadow-none text-xs">Diesel ({freDiesel.length})</TabsTrigger>
                                </TabsList>
                                <TabsContent value="all"><FRETable data={freData} /></TabsContent>
                                <TabsContent value="petrol"><FRETable data={frePetrol} /></TabsContent>
                                <TabsContent value="diesel"><FRETable data={freDiesel} /></TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
