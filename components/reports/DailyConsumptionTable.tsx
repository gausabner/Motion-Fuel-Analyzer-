"use client";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

export function DailyConsumptionTable({ data }: { data: any[] }) {
    return (
        <div className="rounded-sm border border-border bg-white">
            <Table>
                <TableHeader className="bg-muted/50 sticky top-0 z-10">
                    <TableRow>
                        <TableHead className="font-bold uppercase tracking-wider text-[10px]">Date</TableHead>
                        <TableHead className="font-bold uppercase tracking-wider text-[10px]">Fuel Type</TableHead>
                        <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">Total Volume</TableHead>
                        <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">Total Cost</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((row, idx) => (
                        <TableRow key={idx}>
                            <TableCell className="font-medium text-xs">
                                {format(new Date(row.date), 'dd MMM yyyy')}
                            </TableCell>
                            <TableCell>
                                <Badge variant="outline" className={row.fuelType.includes('Petrol') ? 'border-blue-500 text-blue-700' : 'border-amber-500 text-amber-700'}>
                                    {row.fuelType}
                                </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-right font-mono">{row.volume.toFixed(2)}</TableCell>
                            <TableCell className="text-xs text-right font-mono">{row.cost.toFixed(2)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
