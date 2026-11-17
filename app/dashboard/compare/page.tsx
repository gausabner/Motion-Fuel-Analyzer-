import { prisma } from "@/lib/prisma";
import { getPeriodComparison, type CompareDimension } from "@/lib/analytics";
import { getOrganisation } from "@/lib/organisation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ComparisonControls } from "@/components/reports/ComparisonControls";
import { ChartCard, PairedBars } from "@/components/fuel/charts";
import { fmtDept, fmtLitres } from "@/lib/format";
import { FuelSplitComparison, type FuelStat } from "@/components/reports/FuelSplitComparison";
import { ComparePdfButton } from "@/components/reports/ComparePdfButton";
import { TableCsvButton } from "@/components/reports/ReportExports";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plate } from "@/components/fuel/VehiclePanel";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

export const dynamic = "force-dynamic";

const DIM_LABEL: Record<CompareDimension, string> = {
    total: "Fleet total",
    fuelType: "Fuel type",
    fleetUnit: "Fleet unit",
    department: "Department",
    division: "Division",
};
const DIMENSIONS: CompareDimension[] = ["total", "fuelType", "fleetUnit", "department", "division"];

const fmtDate = (d?: string) =>
    d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

function DeltaCell({ deltaVolume, deltaPct }: { deltaVolume: number; deltaPct: number | null }) {
    const up = deltaVolume > 0.5;
    const down = deltaVolume < -0.5;
    // For consumption, down is favourable (green), up is unfavourable (red).
    const cls = down ? "text-ok" : up ? "text-crit" : "text-muted-foreground";
    const Icon = down ? ArrowDownRight : up ? ArrowUpRight : Minus;
    return (
        <span className={`inline-flex items-center gap-1 justify-end mono ${cls}`}>
            <Icon className="h-3.5 w-3.5" />
            {deltaVolume >= 0 ? "+" : ""}{deltaVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })} L
            {deltaPct !== null && <span className="text-xs opacity-80">({deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(1)}%)</span>}
        </span>
    );
}

export default async function ComparePage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | undefined>>;
}) {
    const sp = await searchParams;

    const dimParam = (sp.dim || "department") as CompareDimension;
    const dimension: CompareDimension = DIMENSIONS.includes(dimParam) ? dimParam : "department";

    // Default: last full calendar year (A) vs current calendar year (B).
    const now = new Date();
    const thisYear = now.getFullYear();
    const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString();
    const aFrom = sp.aFrom || iso(thisYear - 1, 0, 1);
    const aTo = sp.aTo || iso(thisYear - 1, 11, 31);
    const bFrom = sp.bFrom || iso(thisYear, 0, 1);
    const bTo = sp.bTo || iso(thisYear, 11, 31);

    const filters = {
        fuelType: sp.fuelType,
        department: sp.department,
        division: sp.division,
        vehicleId: sp.vehicleId,
    };

    const [result, fuelResult, costCentres, settings] = await Promise.all([
        getPeriodComparison(dimension, { from: aFrom, to: aTo }, { from: bFrom, to: bTo }, filters),
        // Always compute the petrol/diesel split (respecting filters) for the fuel panel.
        getPeriodComparison("fuelType", { from: aFrom, to: aTo }, { from: bFrom, to: bTo }, filters),
        (prisma as any).costCentre.findMany({
            select: { department: true, division: true },
            distinct: ["department", "division"],
            orderBy: [{ department: "asc" }, { division: "asc" }],
        }),
        (prisma as any).systemSettings.findFirst({ where: { id: "global" } }),
    ]);

    const fuelStat = (name: string): FuelStat => {
        const r = fuelResult.rows.find((x) => x.key.toLowerCase() === name);
        return {
            aVolume: r?.aVolume ?? 0, aCost: r?.aCost ?? 0,
            bVolume: r?.bVolume ?? 0, bCost: r?.bCost ?? 0,
        };
    };
    const petrolStat = fuelStat("petrol");
    const dieselStat = fuelStat("diesel");

    // Issues with no fuel type recorded sit in neither panel; name the remainder so the split still adds up.
    const splitTotals = fuelResult.totals;
    const otherA = splitTotals.aVolume - petrolStat.aVolume - dieselStat.aVolume;
    const otherB = splitTotals.bVolume - petrolStat.bVolume - dieselStat.bVolume;

    const currency = settings?.currencySymbol || "N$";
    const organisation = await getOrganisation();
    const aLabel = `${fmtDate(aFrom)} – ${fmtDate(aTo)}`;
    const bLabel = `${fmtDate(bFrom)} – ${fmtDate(bTo)}`;
    const t = result.totals;
    const litres = (v: number) => fmtLitres(v);
    // The row that moved most in absolute litres, for the sentence under the headline.
    const mover = dimension === "total" ? null : [...result.rows].sort((x, y) => Math.abs(y.deltaVolume) - Math.abs(x.deltaVolume))[0] ?? null;

    const rangeQs = `&aFrom=${encodeURIComponent(aFrom)}&aTo=${encodeURIComponent(aTo)}` +
        `&bFrom=${encodeURIComponent(bFrom)}&bTo=${encodeURIComponent(bTo)}` +
        (filters.fuelType ? `&fuelType=${encodeURIComponent(filters.fuelType)}` : "") +
        (filters.department ? `&department=${encodeURIComponent(filters.department)}` : "") +
        (filters.division ? `&division=${encodeURIComponent(filters.division)}` : "") +
        (filters.vehicleId ? `&vehicleId=${encodeURIComponent(filters.vehicleId)}` : "");
    const csvUrl = `/api/reports/compare?format=csv&dim=${dimension}${rangeQs}`;
    const fuelCsvUrl = `/api/reports/compare?format=csv&dim=fuelType${rangeQs}`;

    const activeFilters = [
        filters.fuelType && filters.fuelType !== "all" ? `Fuel: ${filters.fuelType}` : null,
        filters.department ? `Dept: ${filters.department}` : null,
        filters.division ? `Division: ${filters.division}` : null,
        filters.vehicleId ? `Unit: ${filters.vehicleId}` : null,
    ].filter(Boolean).join(" · ");

    return (
        <div className="flex flex-col gap-3.5">
            <PageHeader
                title="Compare periods"
                scope={[`By ${DIM_LABEL[dimension].toLowerCase()}`, `${aLabel} against ${bLabel}`, ...(activeFilters ? [activeFilters] : [])]}
            >
                <TableCsvButton filename="period_comparison.csv" serverUrl={csvUrl} />
                <ComparePdfButton
                    dimensionLabel={DIM_LABEL[dimension]}
                    aLabel={aLabel}
                    bLabel={bLabel}
                    activeFilters={activeFilters}
                    currency={currency}
                    rows={result.rows}
                    totals={result.totals}
                    petrol={petrolStat}
                    diesel={dieselStat}
                    organisation={organisation}
                />
            </PageHeader>

            <ComparisonControls costCentres={costCentres} />

            {/* Words before charts: the answer, then the evidence. */}
            <section className="monumental-card" aria-label="Summary">
                <p className="bigline">
                    {t.aVolume === 0 && t.bVolume === 0
                        ? "No fuel was issued in either period for these filters."
                        : t.deltaPct === null
                            ? `${litres(t.bVolume)} issued in period B; period A has nothing to compare it with.`
                            : Math.abs(t.deltaPct) < 0.5
                                ? `Consumption is level between the two periods at about ${litres(t.bVolume)}.`
                                : `Consumption ${t.deltaVolume > 0 ? "rose" : "fell"} ${Math.abs(t.deltaPct).toFixed(1)}% between the two periods, ${t.deltaVolume > 0 ? "up" : "down"} ${litres(Math.abs(t.deltaVolume))}.`}
                    <small>
                        {mover
                            ? `The largest movement is ${fmtDept(mover.key)}, ${mover.deltaVolume > 0 ? "up" : "down"} ${litres(Math.abs(mover.deltaVolume))}${mover.deltaPct !== null ? ` (${mover.deltaPct >= 0 ? "+" : "−"}${Math.abs(mover.deltaPct).toFixed(1)}%)` : ""}. `
                            : ""}
                        Period A is {aLabel}; period B is {bLabel}.
                    </small>
                </p>
            </section>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3 stagger-tiles">
                <div className="kpi">
                    <div className="kpi-h">Period A</div>
                    <div className="kpi-v num">{litres(t.aVolume)}</div>
                    <div className="kpi-f"><span className="ctx">{currency}{t.aCost.toLocaleString("en-GB", { maximumFractionDigits: 0 })} · {t.aTxns.toLocaleString("en-GB")} issues</span></div>
                </div>
                <div className="kpi">
                    <div className="kpi-h">Period B</div>
                    <div className="kpi-v num">{litres(t.bVolume)}</div>
                    <div className="kpi-f"><span className="ctx">{currency}{t.bCost.toLocaleString("en-GB", { maximumFractionDigits: 0 })} · {t.bTxns.toLocaleString("en-GB")} issues</span></div>
                </div>
                <div className="kpi">
                    <div className="kpi-h">Change</div>
                    <div className="kpi-v num">{t.deltaVolume >= 0 ? "+" : "−"}{litres(Math.abs(t.deltaVolume))}</div>
                    <div className="kpi-f">
                        {t.deltaPct === null
                            ? <span className="ctx">No baseline in period A</span>
                            : <><span className={`delta ${t.deltaPct > 0.5 ? "bad" : t.deltaPct < -0.5 ? "good" : "flat"}`}>{t.deltaPct >= 0 ? "+" : "−"}{Math.abs(t.deltaPct).toFixed(1)}%</span><span className="ctx">against period A</span></>}
                    </div>
                </div>
            </div>

            {/* Petrol vs diesel — volume & cost */}
            <FuelSplitComparison
                petrol={petrolStat}
                diesel={dieselStat}
                aLabel={`A · ${aLabel}`}
                bLabel={`B · ${bLabel}`}
                currency={currency}
                csvUrl={fuelCsvUrl}
            />
            {(otherA > 0.5 || otherB > 0.5) && (
                <p className="text-xs text-muted-foreground">
                    Petrol and diesel do not add up to the period totals above because some issues carry no fuel type:
                    {" "}{fmtLitres(otherA)} in period A and {fmtLitres(otherB)} in period B.
                </p>
            )}

            {result.rows.length > 0 && (
                <ChartCard
                    title={`Volume by ${DIM_LABEL[dimension].toLowerCase()}`}
                    sub={`Largest ${Math.min(result.rows.length, 8)} by volume · litres`}
                    legend={
                        <>
                            <span><i className="sw" style={{ background: "var(--bar)" }} />Period A</span>
                            <span><i className="sw" style={{ background: "var(--primary)" }} />Period B</span>
                            <span><i className="sw dia" />Up more than 5%</span>
                        </>
                    }
                    table={{
                        head: [DIM_LABEL[dimension], "Period A (L)", "Period B (L)", "Change"],
                        rows: result.rows.slice(0, 8).map(r => [
                            fmtDept(r.key), Math.round(r.aVolume).toLocaleString("en-GB"), Math.round(r.bVolume).toLocaleString("en-GB"),
                            r.deltaPct === null ? "new" : `${r.deltaPct >= 0 ? "+" : "−"}${Math.abs(r.deltaPct).toFixed(1)}%`,
                        ]),
                    }}
                >
                    <PairedBars
                        data={result.rows.slice(0, 8).map(r => ({ label: fmtDept(r.key), a: r.aVolume, b: r.bVolume }))}
                        ariaLabel={`Fuel issued in period A and period B for the largest ${DIM_LABEL[dimension].toLowerCase()} groups`}
                    />
                </ChartCard>
            )}

            {/* Table */}
            <Card className="monumental-card">
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                        <CardTitle className="text-base font-semibold">Every row</CardTitle>
                        <CardDescription>{result.rows.length} {DIM_LABEL[dimension].toLowerCase()}{result.rows.length === 1 ? "" : "s"}. Arrows show direction; a fall in consumption is marked as favourable.</CardDescription>
                    </div>
                    <TableCsvButton filename="period_comparison.csv" serverUrl={csvUrl} />
                </CardHeader>
                <CardContent>
                    <div className="max-h-[560px] overflow-y-auto">
                        <Table>
                            <TableHeader className="sticky top-0 z-10">
                                <TableRow>
                                    <TableHead >{DIM_LABEL[dimension]}</TableHead>
                                    <TableHead className="text-right">A · Volume (L)</TableHead>
                                    <TableHead className="text-right">B · Volume (L)</TableHead>
                                    <TableHead className="text-right">Change</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {result.rows.map((r) => (
                                    <TableRow key={r.key}>
                                        <TableCell>{dimension === "fleetUnit" ? <Plate unit={r.key} /> : fmtDept(r.key)}</TableCell>
                                        <TableCell className="mono text-right">{r.aVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                                        <TableCell className="mono text-right">{r.bVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                                        <TableCell className="text-right"><DeltaCell deltaVolume={r.deltaVolume} deltaPct={r.deltaPct} /></TableCell>
                                    </TableRow>
                                ))}
                                {result.rows.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center py-6 text-xs text-muted-foreground">
                                            No consumption in either period for the current filters.
                                        </TableCell>
                                    </TableRow>
                                )}
                                {result.rows.length > 1 && (
                                    <TableRow className="bg-muted/40">
                                        <TableCell className="font-semibold">Total</TableCell>
                                        <TableCell className="mono text-right font-semibold">{t.aVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                                        <TableCell className="mono text-right font-semibold">{t.bVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                                        <TableCell className="text-right"><DeltaCell deltaVolume={t.deltaVolume} deltaPct={t.deltaPct} /></TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
