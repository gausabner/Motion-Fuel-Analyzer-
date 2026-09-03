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
        <div className="rounded-sm border border-border bg-card">
            <Table>
                <TableHeader className="bg-muted/50 sticky top-0 z-10">
                    <TableRow>
                        <TableHead className="font-bold uppercase tracking-wider text-[10px]">Rank</TableHead>
                        <TableHead className="font-bold uppercase tracking-wider text-[10px]">Issue Vote</TableHead>
                        <TableHead className="font-bold uppercase tracking-wider text-[10px]">Division</TableHead>
                        <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">Volume (L)</TableHead>
                        <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">Cost</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((row, idx) => (
                        <TableRow key={row.voteNo}>
                            <TableCell className="font-bold text-xs text-muted-foreground">#{idx + 1}</TableCell>
                            <TableCell className="font-mono text-xs font-bold">{row.voteNo}</TableCell>
                            <TableCell className="text-xs">
                                <span className="font-bold text-foreground/80">{row.division}</span>
                                <span className="block text-[10px] text-muted-foreground uppercase">{row.department}</span>
                            </TableCell>
                            <TableCell className="text-sm text-right font-mono font-bold text-primary">{row.volume.toFixed(2)}</TableCell>
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
