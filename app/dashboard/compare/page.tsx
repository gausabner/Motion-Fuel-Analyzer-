import { prisma } from "@/lib/prisma";
import { getPeriodComparison, type CompareDimension } from "@/lib/analytics";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ComparisonControls } from "@/components/reports/ComparisonControls";
import { ComparisonChart } from "@/components/reports/ComparisonChart";
import { FuelSplitComparison, type FuelStat } from "@/components/reports/FuelSplitComparison";
import { ComparePdfButton } from "@/components/reports/ComparePdfButton";
import { TableCsvButton } from "@/components/reports/ReportExports";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
    const cls = down ? "text-emerald-600" : up ? "text-red-600" : "text-muted-foreground";
    const Icon = down ? ArrowDownRight : up ? ArrowUpRight : Minus;
    return (
        <span className={`inline-flex items-center gap-1 justify-end font-semibold tabular-nums ${cls}`}>
            <Icon className="h-3.5 w-3.5" />
            {deltaVolume >= 0 ? "+" : ""}{deltaVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })} L
            {deltaPct !== null && <span className="text-[10px] opacity-80">({deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(1)}%)</span>}
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

    const currency = settings?.currencySymbol || "N$";
    const aLabel = `${fmtDate(aFrom)} – ${fmtDate(aTo)}`;
    const bLabel = `${fmtDate(bFrom)} – ${fmtDate(bTo)}`;
    const t = result.totals;

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
        <div className="space-y-6">
            <PageHeader
                title="Period comparison"
                scope={`${DIM_LABEL[dimension]} · ${aLabel}  vs  ${bLabel}${activeFilters ? " · " + activeFilters : ""}`}
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
                />
            </PageHeader>

            <ComparisonControls costCentres={costCentres} />

            {/* Summary cards */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
                <Card className="monumental-card">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Period A · {aLabel}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-extrabold tabular-nums">{t.aVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })} L</p>
                        <p className="text-xs text-muted-foreground mt-1">{currency}{t.aCost.toLocaleString(undefined, { maximumFractionDigits: 0 })} · {t.aTxns.toLocaleString()} issues</p>
                    </CardContent>
                </Card>
                <Card className="monumental-card">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Period B · {bLabel}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-extrabold tabular-nums">{t.bVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })} L</p>
                        <p className="text-xs text-muted-foreground mt-1">{currency}{t.bCost.toLocaleString(undefined, { maximumFractionDigits: 0 })} · {t.bTxns.toLocaleString()} issues</p>
                    </CardContent>
                </Card>
                <Card className="monumental-card">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Change</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className={`text-2xl font-extrabold tabular-nums ${t.deltaVolume < 0 ? "text-emerald-600" : t.deltaVolume > 0 ? "text-red-600" : ""}`}>
                            {t.deltaVolume >= 0 ? "+" : ""}{t.deltaVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })} L
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            {t.deltaPct === null ? "no baseline" : `${t.deltaPct >= 0 ? "+" : ""}${t.deltaPct.toFixed(1)}% vs Period A`}
                        </p>
                    </CardContent>
                </Card>
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

            {/* Chart */}
            {result.rows.length > 0 && (
                <Card className="monumental-card">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold tracking-tight">Volume by {DIM_LABEL[dimension].toLowerCase()}</CardTitle>
                        <CardDescription>Period A vs Period B — top {Math.min(result.rows.length, 12)} by volume.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ComparisonChart
                            data={result.rows.slice(0, 12).map(r => ({ name: r.key, a: r.aVolume, b: r.bVolume }))}
                            aLabel="Period A"
                            bLabel="Period B"
                        />
                    </CardContent>
                </Card>
            )}

            {/* Table */}
            <Card className="monumental-card">
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                        <CardTitle className="text-lg font-bold tracking-tight">Comparison detail</CardTitle>
                        <CardDescription>{result.rows.length} {DIM_LABEL[dimension].toLowerCase()}{result.rows.length === 1 ? "" : "s"}. Consumption down is shown green, up red.</CardDescription>
                    </div>
                    <TableCsvButton filename="period_comparison.csv" serverUrl={csvUrl} />
                </CardHeader>
                <CardContent>
                    <div className="rounded-sm border border-border max-h-[560px] overflow-y-auto">
                        <Table>
                            <TableHeader className="bg-muted/50 sticky top-0 z-10">
                                <TableRow>
                                    <TableHead className="font-bold uppercase tracking-wider text-[10px]">{DIM_LABEL[dimension]}</TableHead>
                                    <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">A · Volume (L)</TableHead>
                                    <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">B · Volume (L)</TableHead>
                                    <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">Change</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {result.rows.map((r) => (
                                    <TableRow key={r.key}>
                                        <TableCell className="text-xs font-semibold">{r.key}</TableCell>
                                        <TableCell className="text-xs text-right font-mono">{r.aVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                                        <TableCell className="text-xs text-right font-mono">{r.bVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                                        <TableCell className="text-xs text-right"><DeltaCell deltaVolume={r.deltaVolume} deltaPct={r.deltaPct} /></TableCell>
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
                                        <TableCell className="text-xs font-extrabold">TOTAL</TableCell>
                                        <TableCell className="text-xs text-right font-mono font-extrabold">{t.aVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                                        <TableCell className="text-xs text-right font-mono font-extrabold">{t.bVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                                        <TableCell className="text-xs text-right"><DeltaCell deltaVolume={t.deltaVolume} deltaPct={t.deltaPct} /></TableCell>
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
