import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { requireSession, requireRole } from "@/lib/auth";

export async function GET() {
    const _auth = await requireSession(); if (_auth instanceof NextResponse) return _auth;
    const departments = await prisma.department.findMany({ orderBy: { name: 'asc' } });
    // Include how many cost centres reference each department
    const ccCounts = await prisma.costCentre.groupBy({ by: ['department'], _count: { voteNo: true } });
    const countMap = new Map(ccCounts.map(c => [c.department, c._count.voteNo]));
    return NextResponse.json({
        departments: departments.map(d => ({ ...d, voteCount: countMap.get(d.name) || 0 }))
    });
}

export async function POST(req: NextRequest) {
    const _auth = await requireRole(); if (_auth instanceof NextResponse) return _auth;
    const { name } = await req.json();
    const trimmed = String(name || "").trim().toUpperCase();
    if (!trimmed) {
        return NextResponse.json({ error: "Department name is required" }, { status: 400 });
    }
    const existing = await prisma.department.findUnique({ where: { name: trimmed } });
    if (existing) {
        return NextResponse.json({ error: "Department already exists" }, { status: 409 });
    }
    const department = await prisma.department.create({ data: { name: trimmed } });
    return NextResponse.json({ success: true, department });
}

export async function DELETE(req: NextRequest) {
    const _auth = await requireRole(); if (_auth instanceof NextResponse) return _auth;
    const name = req.nextUrl.searchParams.get("name");
    if (!name) {
        return NextResponse.json({ error: "name query parameter is required" }, { status: 400 });
    }
    const inUse = await prisma.costCentre.count({ where: { department: name } });
    if (inUse > 0) {
        return NextResponse.json({ error: `Department has ${inUse} cost centre(s). Remove or reassign them first.` }, { status: 409 });
    }
    await prisma.department.delete({ where: { name } }).catch(() => null);
    return NextResponse.json({ success: true });
}
