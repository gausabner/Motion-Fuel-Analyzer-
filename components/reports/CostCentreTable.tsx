"use client";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

export function CostCentreTable({ data }: { data: any[] }) {
    return (
        <div className="rounded-sm border border-border bg-white">
            <Table>
                <TableHeader className="bg-muted/50 sticky top-0 z-10">
                    <TableRow>
                        <TableHead className="font-bold uppercase tracking-wider text-[10px]">Vote No</TableHead>
                        <TableHead className="font-bold uppercase tracking-wider text-[10px]">Division</TableHead>
                        <TableHead className="font-bold uppercase tracking-wider text-[10px]">Department</TableHead>
                        <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">Petrol (L)</TableHead>
                        <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">Diesel (L)</TableHead>
                        <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">Total (L)</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((row) => (
                        <TableRow key={row.cc.voteNo}>
                            <TableCell className="font-mono text-xs">{row.cc.voteNo}</TableCell>
                            <TableCell className="text-xs font-bold text-slate-700">{row.cc.division}</TableCell>
                            <TableCell className="text-[10px] text-muted-foreground uppercase">{row.cc.department}</TableCell>
                            <TableCell className="text-xs text-right font-mono text-blue-600 font-medium">{row.petrol.toFixed(2)}</TableCell>
                            <TableCell className="text-xs text-right font-mono text-amber-600 font-medium">{row.diesel.toFixed(2)}</TableCell>
                            <TableCell className="text-xs text-right font-mono font-bold">{(row.petrol + row.diesel).toFixed(2)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
