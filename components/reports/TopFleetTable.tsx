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
        <div className="bg-card">
            <Table>
                <TableHeader className="sticky top-0 z-10">
                    <TableRow>
                        <TableHead>Rank</TableHead>
                        <TableHead>Fleet Unit</TableHead>
                        <TableHead className="text-right">Total Volume (L)</TableHead>
                        <TableHead className="text-right">Total Cost</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((row, idx) => (
                        <TableRow key={row.vehicleId}>
                            <TableCell className="font-semibold text-xs text-muted-foreground">#{idx + 1}</TableCell>
                            <TableCell className="font-semibold text-sm">{row.vehicleId}</TableCell>
                            <TableCell className="text-sm text-right font-mono font-semibold text-brand">{row.volume.toFixed(2)}</TableCell>
                            <TableCell className="text-sm text-right font-mono">{row.cost.toFixed(2)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
