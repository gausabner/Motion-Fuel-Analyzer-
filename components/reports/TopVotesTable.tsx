"use client";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

export function TopVotesTable({ data }: { data: any[] }) {
    return (
        <div className="bg-card">
            <Table>
                <TableHeader className="sticky top-0 z-10">
                    <TableRow>
                        <TableHead>Rank</TableHead>
                        <TableHead>Issue Vote</TableHead>
                        <TableHead>Division</TableHead>
                        <TableHead className="text-right">Volume (L)</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((row, idx) => (
                        <TableRow key={row.voteNo}>
                            <TableCell className="font-semibold text-xs text-muted-foreground">#{idx + 1}</TableCell>
                            <TableCell className="font-mono text-xs font-semibold">{row.voteNo}</TableCell>
                            <TableCell className="text-xs">
                                <span className="font-semibold text-foreground/80">{row.division}</span>
                                <span className="block text-xs text-muted-foreground ">{row.department}</span>
                            </TableCell>
                            <TableCell className="text-sm text-right font-mono font-semibold text-brand">{row.volume.toFixed(2)}</TableCell>
                            <TableCell className="text-sm text-right font-mono">{row.cost.toFixed(2)}</TableCell>
                        </TableRow>
                    ))}
                    {data.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={5} className="text-center py-4 text-xs text-muted-foreground">
                                No vote consumption found for this range.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
