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
        <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="p-6 bg-muted/40 border border-border rounded-md">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                        <Fuel className="h-4 w-4" /> Total Petrol Consumption
                    </div>
                    <p className="text-3xl font-extrabold tabular-nums">{data.petrolVolume.toLocaleString(undefined, { maximumFractionDigits: 2 })} L</p>
                    <p className="text-xs text-muted-foreground mt-1 font-medium">
                        {currencySymbol}{data.petrolCost.toLocaleString(undefined, { maximumFractionDigits: 2 })} · {data.petrolCount.toLocaleString()} transactions
                    </p>
                </div>
                <div className="p-6 bg-muted/40 border border-border rounded-md">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                        <Droplets className="h-4 w-4" /> Total Diesel Consumption
                    </div>
                    <p className="text-3xl font-extrabold tabular-nums">{data.dieselVolume.toLocaleString(undefined, { maximumFractionDigits: 2 })} L</p>
                    <p className="text-xs text-muted-foreground mt-1 font-medium">
                        {currencySymbol}{data.dieselCost.toLocaleString(undefined, { maximumFractionDigits: 2 })} · {data.dieselCount.toLocaleString()} transactions
                    </p>
                </div>
            </div>

            <div className="rounded-sm border border-border bg-card">
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead className="font-bold uppercase tracking-wider text-[10px]">Fuel Type</TableHead>
                            <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">Volume (L)</TableHead>
                            <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">Cost</TableHead>
                            <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">Transactions</TableHead>
                            <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">Share</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow>
                            <TableCell className="text-xs font-bold">PETROL</TableCell>
                            <TableCell className="text-xs text-right font-mono">{data.petrolVolume.toFixed(2)}</TableCell>
                            <TableCell className="text-xs text-right font-mono">{data.petrolCost.toFixed(2)}</TableCell>
                            <TableCell className="text-xs text-right font-mono">{data.petrolCount}</TableCell>
                            <TableCell className="text-xs text-right font-mono">{total > 0 ? ((data.petrolVolume / total) * 100).toFixed(1) : '0.0'}%</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell className="text-xs font-bold">DIESEL</TableCell>
                            <TableCell className="text-xs text-right font-mono">{data.dieselVolume.toFixed(2)}</TableCell>
                            <TableCell className="text-xs text-right font-mono">{data.dieselCost.toFixed(2)}</TableCell>
                            <TableCell className="text-xs text-right font-mono">{data.dieselCount}</TableCell>
                            <TableCell className="text-xs text-right font-mono">{total > 0 ? ((data.dieselVolume / total) * 100).toFixed(1) : '0.0'}%</TableCell>
                        </TableRow>
                        <TableRow className="bg-muted/30">
                            <TableCell className="text-xs font-extrabold">TOTAL</TableCell>
                            <TableCell className="text-xs text-right font-mono font-extrabold">{total.toFixed(2)}</TableCell>
                            <TableCell className="text-xs text-right font-mono font-extrabold">{(data.petrolCost + data.dieselCost).toFixed(2)}</TableCell>
                            <TableCell className="text-xs text-right font-mono font-extrabold">{data.petrolCount + data.dieselCount}</TableCell>
                            <TableCell className="text-xs text-right font-mono font-extrabold">100%</TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
