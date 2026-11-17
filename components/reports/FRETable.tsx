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

export function FRETable({ data }: { data: any[] }) {
    return (
        <div className="">
            <Table>
                <TableHeader className="sticky top-0 z-10">
                    <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Ref No</TableHead>
                        <TableHead>Tank</TableHead>
                        <TableHead className="text-right">Volume (L)</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((tx) => (
                        <TableRow key={tx.id}>
                            <TableCell className="font-medium text-xs">
                                {format(new Date(tx.transDate), 'dd MMM yyyy')}
                            </TableCell>
                            <TableCell className="font-semibold text-xs">{tx.transRefNo || '—'}</TableCell>
                            <TableCell className="text-xs">{tx.storeNo}</TableCell>
                            <TableCell className="text-xs text-right font-mono">{tx.transQty.toFixed(2)}</TableCell>
                            <TableCell className="text-xs text-right font-mono">{tx.transAmt?.toFixed(2)}</TableCell>
                        </TableRow>
                    ))}
                    {data.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={5} className="text-center py-4 text-xs text-muted-foreground">
                                No FRE transactions found.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
