"use client";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

export function TopFleetTable({ data }: { data: any[] }) {
    return (
        <div className="rounded-sm border border-border bg-card">
            <Table>
                <TableHeader className="bg-muted/50 sticky top-0 z-10">
                    <TableRow>
                        <TableHead className="font-bold uppercase tracking-wider text-[10px]">Rank</TableHead>
                        <TableHead className="font-bold uppercase tracking-wider text-[10px]">Fleet Unit</TableHead>
                        <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">Total Volume (L)</TableHead>
                        <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">Total Cost</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((row, idx) => (
                        <TableRow key={row.vehicleId}>
                            <TableCell className="font-bold text-xs text-muted-foreground">#{idx + 1}</TableCell>
                            <TableCell className="font-bold text-sm">{row.vehicleId}</TableCell>
                            <TableCell className="text-sm text-right font-mono font-bold text-primary">{row.volume.toFixed(2)}</TableCell>
                            <TableCell className="text-sm text-right font-mono">{row.cost.toFixed(2)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
