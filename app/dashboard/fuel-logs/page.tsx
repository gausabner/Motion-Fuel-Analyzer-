import { scopeRange } from "@/lib/periods";
import { fmtMoney } from "@/lib/format";
import { Plate } from "@/components/fuel/VehiclePanel";
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
                scope={[scopeRange(params.from, params.to), `${total.toLocaleString("en-GB")} rows`, "Every row as uploaded"]}
            />

            <FuelLogFilters costCentres={costCentres} />

            <Card className="monumental-card">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full caption-bottom text-sm">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Sequence</TableHead>
                                    <TableHead>Tank</TableHead>
                                    <TableHead>Pump</TableHead>
                                    <TableHead>Fuel</TableHead>
                                    <TableHead>Unit</TableHead>
                                    <TableHead>Vote code</TableHead>
                                    <TableHead className="text-right">Litres</TableHead>
                                    <TableHead className="text-right">Cost</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {transactions.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="text-center py-12 text-muted-foreground font-medium">
                                            No rows match these filters. Clear a filter, or upload a report.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    transactions.map((tx: any) => (
                                        <TableRow key={tx.id}>
                                            <TableCell className="mono whitespace-nowrap">
                                                {format(new Date(tx.transDate), 'dd MMM yyyy')}
                                            </TableCell>
                                            <TableCell className="mono text-muted-foreground">{tx.issueTime || '—'}</TableCell>
                                            <TableCell className="mono">{tx.storeNo}</TableCell>
                                            <TableCell className="mono">{tx.pumpNo || '—'}</TableCell>
                                            <TableCell>
                                                {tx.fuelType === "Unknown" ? <span className="text-muted-foreground">Not recorded</span> : tx.fuelType}
                                            </TableCell>
                                            <TableCell>{tx.vehicleId ? <Plate unit={tx.vehicleId} /> : <span className="text-muted-foreground">—</span>}</TableCell>
                                            <TableCell className="mono text-muted-foreground">{tx.transVoteNo || '—'}</TableCell>
                                            <TableCell className="mono text-right">
                                                {tx.transQty.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell className="mono text-right">
                                                {fmtMoney(tx.transAmt ?? 0, { currency: currencySymbol })}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </table>
                    </div>
                </CardContent>
                <div className="mt-2">
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
