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
};

export function ConsumptionSummary({ data, currencySymbol = "N$" }: { data: Summary; currencySymbol?: string }) {
    const total = data.petrolVolume + data.dieselVolume;
    return (
        <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="p-4 bg-muted/40 border border-border rounded-md">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                        <Fuel className="h-4 w-4" /> Total Petrol Consumption
                    </div>
                    <p className="text-3xl font-extrabold tabular-nums">{fmtLitres(data.petrolVolume)}</p>
                    <p className="text-xs text-muted-foreground mt-1 font-medium">
                        {fmtMoney(data.petrolCost, { currency: currencySymbol })} · {fmtCount(data.petrolCount)} transactions
                    </p>
                </div>
                <div className="p-4 bg-muted/40 border border-border rounded-md">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                        <Droplets className="h-4 w-4" /> Total Diesel Consumption
                    </div>
                    <p className="text-3xl font-extrabold tabular-nums">{fmtLitres(data.dieselVolume)}</p>
                    <p className="text-xs text-muted-foreground mt-1 font-medium">
                        {fmtMoney(data.dieselCost, { currency: currencySymbol })} · {fmtCount(data.dieselCount)} transactions
                    </p>
                </div>
            </div>

            <div className="rounded-sm border border-border bg-card">
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead className="font-bold uppercase tracking-wider text-xs">Fuel Type</TableHead>
                            <TableHead className="font-bold uppercase tracking-wider text-xs text-right">Volume (L)</TableHead>
                            <TableHead className="font-bold uppercase tracking-wider text-xs text-right">Cost</TableHead>
                            <TableHead className="font-bold uppercase tracking-wider text-xs text-right">Transactions</TableHead>
                            <TableHead className="font-bold uppercase tracking-wider text-xs text-right">Share</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow>
                            <TableCell className="text-xs font-bold">PETROL</TableCell>
                            <TableCell className="text-xs text-right font-mono tabular-nums">{fmtLitres(data.petrolVolume)}</TableCell>
                            <TableCell className="text-xs text-right font-mono tabular-nums">{fmtMoney(data.petrolCost, { currency: currencySymbol })}</TableCell>
                            <TableCell className="text-xs text-right font-mono tabular-nums">{fmtCount(data.petrolCount)}</TableCell>
                            <TableCell className="text-xs text-right font-mono">{total > 0 ? fmtPercent((data.petrolVolume / total) * 100) : fmtPercent(0)}</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell className="text-xs font-bold">DIESEL</TableCell>
                            <TableCell className="text-xs text-right font-mono tabular-nums">{fmtLitres(data.dieselVolume)}</TableCell>
                            <TableCell className="text-xs text-right font-mono tabular-nums">{fmtMoney(data.dieselCost, { currency: currencySymbol })}</TableCell>
                            <TableCell className="text-xs text-right font-mono tabular-nums">{fmtCount(data.dieselCount)}</TableCell>
                            <TableCell className="text-xs text-right font-mono">{total > 0 ? fmtPercent((data.dieselVolume / total) * 100) : fmtPercent(0)}</TableCell>
                        </TableRow>
                        <TableRow className="bg-muted/30">
                            <TableCell className="text-xs font-extrabold">TOTAL</TableCell>
                            <TableCell className="text-xs text-right font-mono font-extrabold tabular-nums">{fmtLitres(total)}</TableCell>
                            <TableCell className="text-xs text-right font-mono font-extrabold tabular-nums">{fmtMoney(data.petrolCost + data.dieselCost, { currency: currencySymbol })}</TableCell>
                            <TableCell className="text-xs text-right font-mono font-extrabold tabular-nums">{fmtCount(data.petrolCount + data.dieselCount)}</TableCell>
                            <TableCell className="text-xs text-right font-mono font-extrabold">100%</TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
