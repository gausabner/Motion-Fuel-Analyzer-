import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const vehicleId = searchParams.get("vehicleId");
    const fuelType = searchParams.get("fuelType");
    const department = searchParams.get("department");
    const division = searchParams.get("division");

    const where: any = {};
    if (vehicleId) where.vehicleId = { contains: vehicleId };
    if (fuelType && fuelType !== 'all') where.fuelType = fuelType;

    if (department || division) {
        const ccWhere: any = {};
        if (department) ccWhere.department = { contains: department };
        if (division) ccWhere.division = { contains: division };
        
        const ccs = await prisma.costCentre.findMany({ 
            where: ccWhere, 
            select: { voteNo: true } 
        });
        const validVoteNos = ccs.map(c => c.voteNo);
        where.transVoteNo = { in: validVoteNos };
    }

    const transactions = await prisma.fuelTransaction.findMany({
        where,
        orderBy: { transDate: 'desc' },
    });

    // Generate CSV
    const headers = ["Date", "Tank", "Fuel Type", "Type", "Vehicle", "Department", "Quantity", "Amount"];
    const rows = transactions.map(tx => [
        new Date(tx.transDate).toLocaleDateString(),
        tx.storeNo,
        tx.fuelType,
        tx.transType,
        tx.vehicleId || "N/A",
        tx.transVoteNo || "N/A",
        tx.transQty.toFixed(2),
        tx.transAmt?.toFixed(2) || "0.00"
    ]);

    const csvContent = [
        headers.join(","),
        ...rows.map(row => row.join(","))
    ].join("\n");

    return new NextResponse(csvContent, {
        headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": 'attachment; filename="fuel_report.csv"',
        },
    });
}
