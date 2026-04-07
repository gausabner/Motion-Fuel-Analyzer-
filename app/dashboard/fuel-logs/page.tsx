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
    const departments = await (prisma as any).costCentre.findMany({
        select: { department: true },
        distinct: ['department'],
        orderBy: { department: 'asc' }
    });
    const departmentList = departments.map((d: any) => d.department).filter(Boolean);

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-black tracking-tight text-black uppercase">Fuel Transaction Logs</h2>
                <p className="text-zinc-500 font-medium">Detailed view of all fuel transactions</p>
            </div>

            <FuelLogFilters departments={departmentList} />

            <Card className="monumental-card shadow-none border-zinc-200 p-0">
                <CardHeader className="border-b border-zinc-100 bg-white px-6 py-4">
                    <CardTitle className="text-sm font-bold uppercase tracking-wide">Recent Transactions</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div>
                        <table className="w-full caption-bottom text-sm">
                            <TableHeader className="sticky top-0 z-10 bg-zinc-50 shadow-sm">
                                <TableRow className="hover:bg-transparent border-zinc-100">
                                    <TableHead className="font-bold text-black uppercase text-xs tracking-wider h-10 bg-zinc-50">Date</TableHead>
                                    <TableHead className="font-bold text-black uppercase text-xs tracking-wider h-10 bg-zinc-50">Time</TableHead>
                                    <TableHead className="font-bold text-black uppercase text-xs tracking-wider h-10 bg-zinc-50">Tank</TableHead>
                                    <TableHead className="font-bold text-black uppercase text-xs tracking-wider h-10 bg-zinc-50">Pump</TableHead>
                                    <TableHead className="font-bold text-black uppercase text-xs tracking-wider h-10 bg-zinc-50">Fuel Type</TableHead>
                                    <TableHead className="font-bold text-black uppercase text-xs tracking-wider h-10 bg-zinc-50">Fleet Unit</TableHead>
                                    <TableHead className="font-bold text-black uppercase text-xs tracking-wider h-10 bg-zinc-50">Issue Vote</TableHead>
                                    <TableHead className="font-bold text-black uppercase text-xs tracking-wider h-10 text-right bg-zinc-50">Quantity (L)</TableHead>
                                    <TableHead className="font-bold text-black uppercase text-xs tracking-wider h-10 text-right bg-zinc-50">Cost</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {transactions.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="text-center py-12 text-zinc-500 font-medium">
                                            No transactions found. Upload an Excel file to import data.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    transactions.map((tx: any) => (
                                        <TableRow key={tx.id} className="hover:bg-yellow-50/50 border-zinc-50 transition-colors">
                                            <TableCell className="font-bold text-zinc-700 text-xs">
                                                {format(new Date(tx.transDate), 'dd MMM yyyy')}
                                            </TableCell>
                                            <TableCell className="text-zinc-500 text-xs font-mono">{tx.issueTime || '—'}</TableCell>
                                            <TableCell className="text-xs">{tx.storeNo}</TableCell>
                                            <TableCell className="text-xs">{tx.pumpNo || '—'}</TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="outline"
                                                    className={tx.fuelType?.toLowerCase().includes('petrol')
                                                        ? 'border-black text-black font-bold bg-white text-[10px] uppercase rounded-sm'
                                                        : 'border-yellow-400 text-black font-bold bg-yellow-400 text-[10px] uppercase rounded-sm'}
                                                >
                                                    {tx.fuelType}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="font-black text-black text-xs">{tx.vehicleId || 'N/A'}</TableCell>
                                            <TableCell className="text-zinc-500 text-[10px] font-mono">{tx.transVoteNo || '—'}</TableCell>
                                            <TableCell className="text-right font-mono font-bold text-xs">
                                                {tx.transQty.toFixed(2)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono font-bold text-xs">
                                                {currencySymbol}{tx.transAmt?.toFixed(2) || '0.00'}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </table>
                    </div>
                </CardContent>
                <div className="border-t border-zinc-100 bg-white">
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
