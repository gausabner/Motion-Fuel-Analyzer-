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

export function FISTable({ data }: { data: any[] }) {
    return (
        <div className="rounded-sm border border-border">
            <Table>
                <TableHeader className="bg-muted/50 sticky top-0 z-10">
                    <TableRow>
                        <TableHead className="font-bold uppercase tracking-wider text-[10px]">Date</TableHead>
                        <TableHead className="font-bold uppercase tracking-wider text-[10px]">Vote No</TableHead>
                        <TableHead className="font-bold uppercase tracking-wider text-[10px]">Vehicle</TableHead>
                        <TableHead className="font-bold uppercase tracking-wider text-[10px]">Tank</TableHead>
                        <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">Volume (L)</TableHead>
                        <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">Cost</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((tx) => (
                        <TableRow key={tx.id}>
                            <TableCell className="font-medium text-xs">
                                {format(new Date(tx.transDate), 'dd MMM yyyy')}
                            </TableCell>
                            <TableCell className="text-xs">{tx.transVoteNo || '—'}</TableCell>
                            <TableCell className="font-bold text-xs">{tx.vehicleId}</TableCell>
                            <TableCell className="text-xs">{tx.storeNo}</TableCell>
                            <TableCell className="text-xs text-right font-mono">{tx.transQty.toFixed(2)}</TableCell>
                            <TableCell className="text-xs text-right font-mono">{tx.transAmt?.toFixed(2)}</TableCell>
                        </TableRow>
                    ))}
                    {data.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={6} className="text-center py-4 text-xs text-muted-foreground">
                                No FIS transactions found.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
