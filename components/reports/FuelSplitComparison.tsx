import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableCsvButton } from "@/components/reports/ReportExports";
import { Fuel, Droplets, ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

export type FuelStat = { aVolume: number; aCost: number; bVolume: number; bCost: number };

function Delta({ a, b, unit, currency }: { a: number; b: number; unit?: string; currency?: string }) {
    const d = b - a;
    const pct = a > 0 ? (d / a) * 100 : null;
    const up = d > 0.5, down = d < -0.5;
    const cls = down ? "text-emerald-600" : up ? "text-red-600" : "text-muted-foreground";
    const Icon = down ? ArrowDownRight : up ? ArrowUpRight : Minus;
    const val = currency
        ? `${currency}${Math.abs(d).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
        : `${Math.abs(d).toLocaleString(undefined, { maximumFractionDigits: 0 })}${unit || ""}`;
    return (
        <span className={`inline-flex items-center gap-1 justify-end font-semibold tabular-nums ${cls}`}>
            <Icon className="h-3.5 w-3.5" />
            {d >= 0 ? "+" : "−"}{val}
            {pct !== null && <span className="text-[10px] opacity-80">({pct >= 0 ? "+" : ""}{pct.toFixed(1)}%)</span>}
        </span>
    );
}

function FuelPanel({ label, icon: Icon, stat, aLabel, bLabel, currency }: {
    label: string; icon: any; stat: FuelStat; aLabel: string; bLabel: string; currency: string;
}) {
    return (
        <div className="p-5 bg-muted/40 border border-border rounded-lg">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
                <Icon className="h-4 w-4 text-primary" /> {label}
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{aLabel}</p>
                    <p className="text-xl font-extrabold tabular-nums mt-1">{stat.aVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })} L</p>
                    <p className="text-xs text-muted-foreground">{currency}{stat.aCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                </div>
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{bLabel}</p>
                    <p className="text-xl font-extrabold tabular-nums mt-1">{stat.bVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })} L</p>
                    <p className="text-xs text-muted-foreground">{currency}{stat.bCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                </div>
            </div>
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border text-xs">
                <span className="text-muted-foreground font-medium">Volume</span>
                <Delta a={stat.aVolume} b={stat.bVolume} unit=" L" />
            </div>
            <div className="flex items-center justify-between mt-1.5 text-xs">
                <span className="text-muted-foreground font-medium">Cost</span>
                <Delta a={stat.aCost} b={stat.bCost} currency={currency} />
            </div>
        </div>
    );
}

export function FuelSplitComparison({
    petrol, diesel, aLabel, bLabel, currency, csvUrl,
}: {
    petrol: FuelStat; diesel: FuelStat; aLabel: string; bLabel: string; currency: string; csvUrl: string;
}) {
    const totA = { vol: petrol.aVolume + diesel.aVolume, cost: petrol.aCost + diesel.aCost };
    const totB = { vol: petrol.bVolume + diesel.bVolume, cost: petrol.bCost + diesel.bCost };

    return (
        <Card className="monumental-card">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                    <CardTitle className="text-lg font-bold tracking-tight">Petrol vs diesel — consumption &amp; cost</CardTitle>
                    <CardDescription>Split by fuel type for both periods{csvUrl.includes("fuelType") ? "" : ""}. Reflects the active filters.</CardDescription>
                </div>
                <TableCsvButton filename="petrol_vs_diesel.csv" serverUrl={csvUrl} />
            </CardHeader>
            <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                    <FuelPanel label="Petrol" icon={Fuel} stat={petrol} aLabel={aLabel} bLabel={bLabel} currency={currency} />
                    <FuelPanel label="Diesel" icon={Droplets} stat={diesel} aLabel={aLabel} bLabel={bLabel} currency={currency} />
                </div>

                <div className="rounded-sm border border-border">
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow>
                                <TableHead className="font-bold uppercase tracking-wider text-[10px]">Fuel</TableHead>
                                <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">A · Volume (L)</TableHead>
                                <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">A · Cost</TableHead>
                                <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">B · Volume (L)</TableHead>
                                <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">B · Cost</TableHead>
                                <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">Δ Volume</TableHead>
                                <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">Δ Cost</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {([["Petrol", petrol], ["Diesel", diesel]] as [string, FuelStat][]).map(([name, s]) => (
                                <TableRow key={name}>
                                    <TableCell className="text-xs font-bold">{name}</TableCell>
                                    <TableCell className="text-xs text-right font-mono">{s.aVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                                    <TableCell className="text-xs text-right font-mono">{currency}{s.aCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                                    <TableCell className="text-xs text-right font-mono">{s.bVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                                    <TableCell className="text-xs text-right font-mono">{currency}{s.bCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                                    <TableCell className="text-xs text-right"><Delta a={s.aVolume} b={s.bVolume} unit=" L" /></TableCell>
                                    <TableCell className="text-xs text-right"><Delta a={s.aCost} b={s.bCost} currency={currency} /></TableCell>
                                </TableRow>
                            ))}
                            <TableRow className="bg-muted/40">
                                <TableCell className="text-xs font-extrabold">TOTAL</TableCell>
                                <TableCell className="text-xs text-right font-mono font-extrabold">{totA.vol.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                                <TableCell className="text-xs text-right font-mono font-extrabold">{currency}{totA.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                                <TableCell className="text-xs text-right font-mono font-extrabold">{totB.vol.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                                <TableCell className="text-xs text-right font-mono font-extrabold">{currency}{totB.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                                <TableCell className="text-xs text-right"><Delta a={totA.vol} b={totB.vol} unit=" L" /></TableCell>
                                <TableCell className="text-xs text-right"><Delta a={totA.cost} b={totB.cost} currency={currency} /></TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
