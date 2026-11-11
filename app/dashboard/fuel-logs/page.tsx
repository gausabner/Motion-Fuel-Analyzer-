import { PageHeader } from "@/components/dashboard/PageHeader";
import { prisma } from "@/lib/prisma";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { FuelLogFilters } from "@/components/dashboard/FuelLogFilters";
import { format } from "date-fns";

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

async function getRecentTransactions(filters: { vehicleId?: string, fuelType?: string, department?: string, from?: string, to?: string, page?: number }) {
    const page = filters.page || 1;
    const offset = (page - 1) * PAGE_SIZE;

    let whereClause = `WHERE 1=1`;
    const params: any[] = [];

    if (filters.vehicleId) {
        whereClause += ` AND vehicleId LIKE ?`;
        params.push(`%${filters.vehicleId}%`);
    }
    if (filters.fuelType && filters.fuelType !== 'all') {
        whereClause += ` AND fuelType = ?`;
        params.push(filters.fuelType);
    }
    if (filters.department) {
        whereClause += ` AND transVoteNo LIKE ?`;
        params.push(`%${filters.department}%`);
    }
    if (filters.from) {
        whereClause += ` AND transDate >= ?`;
        params.push(filters.from);
    }
    if (filters.to) {
        whereClause += ` AND transDate <= ?`;
        const toDate = new Date(filters.to);
        toDate.setHours(23, 59, 59, 999);
        params.push(toDate.toISOString());
    }

    const countQuery = `SELECT COUNT(*) as total FROM FuelTransaction ${whereClause}`;
    const dataQuery = `SELECT * FROM FuelTransaction ${whereClause} ORDER BY transDate DESC LIMIT ? OFFSET ?`;

    const totalResult = await prisma.$queryRawUnsafe(countQuery, ...params) as any[];
    const total = Number(totalResult[0]?.total || 0);

    const data = await prisma.$queryRawUnsafe(dataQuery, ...params, PAGE_SIZE, offset) as any[];

    return { data, total };
}

import { TablePagination } from "@/components/dashboard/TablePagination";

export default async function FuelLogsPage({
    searchParams
}: {
    searchParams: Promise<{ vehicleId?: string, fuelType?: string, department?: string, from?: string, to?: string, page?: string }>
}) {
    const params = await searchParams;
    const currentPage = Number(params.page) || 1;

    // Pass page to query
    const { data: transactions, total } = await getRecentTransactions({ ...params, page: currentPage });

    // 5. System Settings for Currency with safety fallback
    let settings = null;
    try {
        settings = await (prisma as any).systemSettings.findFirst({ where: { id: 'global' } });
    } catch (e) {
        console.error('[Dashboard] Failed to fetch settings:', e);
    }
    const currencySymbol = settings?.currencySymbol || "N$";

    // Fetch Departments for Filter
    const costCentres = await (prisma as any).costCentre.findMany({
        select: { department: true, division: true },
        distinct: ['department', 'division'],
        orderBy: [{ department: 'asc' }, { division: 'asc' }]
    });

    return (
        <div className="flex flex-col gap-3.5">
            <PageHeader
                title="Fuel logs"
                scope="Every row as it was uploaded, all transaction types."
            />

            <FuelLogFilters costCentres={costCentres} />

            <Card className="monumental-card shadow-none border-border p-0">
                <CardHeader className="border-b border-border bg-card px-6 py-4">
                    <CardTitle className="text-sm font-semibold ">Recent Transactions</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div>
                        <table className="w-full caption-bottom text-sm">
                            <TableHeader className="sticky top-0 z-10 bg-muted/40 ">
                                <TableRow className="hover:bg-transparent border-border">
                                    <TableHead className="text-foreground">Date</TableHead>
                                    <TableHead className="text-foreground">Time</TableHead>
                                    <TableHead className="text-foreground">Tank</TableHead>
                                    <TableHead className="text-foreground">Pump</TableHead>
                                    <TableHead className="text-foreground">Fuel Type</TableHead>
                                    <TableHead className="text-foreground">Fleet Unit</TableHead>
                                    <TableHead className="text-foreground">Issue Vote</TableHead>
                                    <TableHead className="text-foreground text-right">Quantity (L)</TableHead>
                                    <TableHead className="text-foreground text-right">Cost</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {transactions.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="text-center py-12 text-muted-foreground font-medium">
                                            No transactions found. Upload an Excel file to import data.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    transactions.map((tx: any) => (
                                        <TableRow key={tx.id} className="hover:bg-warn-soft border-border transition-colors">
                                            <TableCell className="font-semibold text-foreground/80 text-xs">
                                                {format(new Date(tx.transDate), 'dd MMM yyyy')}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-xs font-mono">{tx.issueTime || '—'}</TableCell>
                                            <TableCell className="text-xs">{tx.storeNo}</TableCell>
                                            <TableCell className="text-xs">{tx.pumpNo || '—'}</TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="outline"
                                                    className={tx.fuelType?.toLowerCase().includes('petrol')
                                                        ? 'border-black text-foreground font-semibold bg-card text-xs  rounded-[10px]'
                                                        : 'border-warn/30 text-foreground font-semibold bg-warn-soft text-xs  rounded-[10px]'}
                                                >
                                                    {tx.fuelType}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="font-semibold text-foreground text-xs">{tx.vehicleId || 'N/A'}</TableCell>
                                            <TableCell className="text-muted-foreground text-xs font-mono">{tx.transVoteNo || '—'}</TableCell>
                                            <TableCell className="text-right font-mono font-semibold text-xs">
                                                {tx.transQty.toFixed(2)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono font-semibold text-xs">
                                                {currencySymbol}{tx.transAmt?.toFixed(2) || '0.00'}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </table>
                    </div>
                </CardContent>
                <div className="border-t border-border bg-card">
                    <TablePagination
                        totalItems={total}
                        itemsPerPage={PAGE_SIZE}
                        currentPage={currentPage}
                    />
                </div>
            </Card>
        </div>
    );
}
