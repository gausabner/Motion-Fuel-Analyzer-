"use client";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Fuel, Droplets } from "lucide-react";
import { fmtMoney, fmtLitres, fmtPercent, fmtCount } from "@/lib/format";

type Summary = {
    petrolVolume: number;
    dieselVolume: number;
    petrolCost: number;
    dieselCost: number;
    petrolCount: number;
    dieselCount: number;
    otherVolume?: number;
    otherCost?: number;
    otherCount?: number;
};

export function ConsumptionSummary({ data, currencySymbol = "N$" }: { data: Summary; currencySymbol?: string }) {
    const other = { volume: data.otherVolume ?? 0, cost: data.otherCost ?? 0, count: data.otherCount ?? 0 };
    const total = data.petrolVolume + data.dieselVolume + other.volume;
    return (
        <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-tile bg-surface-2 p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-2">
                        <Fuel className="h-4 w-4" /> Petrol issued
                    </div>
                    <p className="text-2xl font-semibold tracking-[-0.025em] tabular-nums">{fmtLitres(data.petrolVolume)}</p>
                    <p className="text-xs text-muted-foreground mt-1 font-medium">
                        {fmtMoney(data.petrolCost, { currency: currencySymbol })} · {fmtCount(data.petrolCount)} transactions
                    </p>
                </div>
                <div className="rounded-tile bg-surface-2 p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-2">
                        <Droplets className="h-4 w-4" /> Diesel issued
                    </div>
                    <p className="text-2xl font-semibold tracking-[-0.025em] tabular-nums">{fmtLitres(data.dieselVolume)}</p>
                    <p className="text-xs text-muted-foreground mt-1 font-medium">
                        {fmtMoney(data.dieselCost, { currency: currencySymbol })} · {fmtCount(data.dieselCount)} transactions
                    </p>
                </div>
            </div>

            <div className="bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Fuel type</TableHead>
                            <TableHead className="text-right">Volume (L)</TableHead>
                            <TableHead className="text-right">Cost</TableHead>
                            <TableHead className="text-right">Transactions</TableHead>
                            <TableHead className="text-right">Share</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow>
                            <TableCell >Petrol</TableCell>
                            <TableCell className="mono text-right">{fmtLitres(data.petrolVolume)}</TableCell>
                            <TableCell className="mono text-right">{fmtMoney(data.petrolCost, { currency: currencySymbol })}</TableCell>
                            <TableCell className="mono text-right">{fmtCount(data.petrolCount)}</TableCell>
                            <TableCell className="mono text-right">{total > 0 ? fmtPercent((data.petrolVolume / total) * 100) : fmtPercent(0)}</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell >Diesel</TableCell>
                            <TableCell className="mono text-right">{fmtLitres(data.dieselVolume)}</TableCell>
                            <TableCell className="mono text-right">{fmtMoney(data.dieselCost, { currency: currencySymbol })}</TableCell>
                            <TableCell className="mono text-right">{fmtCount(data.dieselCount)}</TableCell>
                            <TableCell className="mono text-right">{total > 0 ? fmtPercent((data.dieselVolume / total) * 100) : fmtPercent(0)}</TableCell>
                        </TableRow>
                        {other.count > 0 && (
                            <TableRow>
                                <TableCell title="The report did not say which fuel these issues were">Fuel type not recorded</TableCell>
                                <TableCell className="mono text-right">{fmtLitres(other.volume)}</TableCell>
                                <TableCell className="mono text-right">{fmtMoney(other.cost, { currency: currencySymbol })}</TableCell>
                                <TableCell className="mono text-right">{fmtCount(other.count)}</TableCell>
                                <TableCell className="mono text-right">{total > 0 ? fmtPercent((other.volume / total) * 100) : fmtPercent(0)}</TableCell>
                            </TableRow>
                        )}
                        <TableRow className="bg-surface-2">
                            <TableCell >Total</TableCell>
                            <TableCell className="mono text-right font-semibold">{fmtLitres(total)}</TableCell>
                            <TableCell className="mono text-right font-semibold">{fmtMoney(data.petrolCost + data.dieselCost + other.cost, { currency: currencySymbol })}</TableCell>
                            <TableCell className="mono text-right font-semibold">{fmtCount(data.petrolCount + data.dieselCount + other.count)}</TableCell>
                            <TableCell className="mono text-right font-semibold">100%</TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
