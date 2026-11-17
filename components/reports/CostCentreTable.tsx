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
        <div className="bg-card">
            <Table>
                <TableHeader className="sticky top-0 z-10">
                    <TableRow>
                        <TableHead>Vote No</TableHead>
                        <TableHead>Division</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead className="text-right">Petrol (L)</TableHead>
                        <TableHead className="text-right">Diesel (L)</TableHead>
                        <TableHead className="text-right">Total (L)</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((row) => (
                        <TableRow key={row.cc.voteNo}>
                            <TableCell className="font-mono text-xs">{row.cc.voteNo}</TableCell>
                            <TableCell className="text-xs font-semibold text-foreground/80">{row.cc.division}</TableCell>
                            <TableCell className="text-xs text-muted-foreground ">{row.cc.department}</TableCell>
                            <TableCell className="text-xs text-right font-mono text-[#60A5FA] font-medium">{row.petrol.toFixed(2)}</TableCell>
                            <TableCell className="text-xs text-right font-mono text-[#1D4ED8] font-medium">{row.diesel.toFixed(2)}</TableCell>
                            <TableCell className="text-xs text-right font-mono font-semibold">{(row.petrol + row.diesel).toFixed(2)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
