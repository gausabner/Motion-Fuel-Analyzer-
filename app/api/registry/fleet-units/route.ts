import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { requireSession, requireRole } from "@/lib/auth";

export async function GET() {
    const _auth = await requireSession(); if (_auth instanceof NextResponse) return _auth;
    const fleetUnits = await prisma.fleetUnit.findMany({ orderBy: { unitNo: 'asc' } });
    return NextResponse.json({ fleetUnits });
}

export async function POST(req: NextRequest) {
    const _auth = await requireRole(); if (_auth instanceof NextResponse) return _auth;
    const body = await req.json();

    // Bulk action: register every distinct vehicle already present in transactions
    if (body.action === 'sync') {
        const vehicles = await prisma.$queryRawUnsafe(
            `SELECT DISTINCT vehicleId FROM FuelTransaction WHERE vehicleId IS NOT NULL AND vehicleId != '' AND vehicleId != 'UNKNOWN'`
        ) as { vehicleId: string }[];
        let added = 0;
        for (const v of vehicles) {
            const unitNo = v.vehicleId.trim();
            if (!unitNo) continue;
            const existing = await prisma.fleetUnit.findUnique({ where: { unitNo } });
            if (!existing) {
                await prisma.fleetUnit.create({ data: { unitNo, description: "Synced from transactions" } });
                added++;
            }
        }
        return NextResponse.json({ success: true, added, total: await prisma.fleetUnit.count() });
    }

    const unitNo = String(body.unitNo || "").trim().toUpperCase();
    const description = body.description ? String(body.description).trim() : null;
    if (!unitNo) {
        return NextResponse.json({ error: "Fleet unit number is required" }, { status: 400 });
    }
    const existing = await prisma.fleetUnit.findUnique({ where: { unitNo } });
    if (existing) {
        return NextResponse.json({ error: "Fleet unit already registered" }, { status: 409 });
    }
    const fleetUnit = await prisma.fleetUnit.create({ data: { unitNo, description } });
    return NextResponse.json({ success: true, fleetUnit });
}

export async function DELETE(req: NextRequest) {
    const _auth = await requireRole(); if (_auth instanceof NextResponse) return _auth;
    const unitNo = req.nextUrl.searchParams.get("unitNo");
    if (!unitNo) {
        return NextResponse.json({ error: "unitNo query parameter is required" }, { status: 400 });
    }
    await prisma.fleetUnit.delete({ where: { unitNo } }).catch(() => null);
    return NextResponse.json({ success: true });
}
