import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { requireSession, requireRole } from "@/lib/auth";

export async function GET() {
    const _auth = await requireSession(); if (_auth instanceof NextResponse) return _auth;
    const costCentres = await prisma.costCentre.findMany({
        orderBy: [{ department: 'asc' }, { division: 'asc' }, { voteNo: 'asc' }]
    });
    return NextResponse.json({ costCentres });
}

export async function POST(req: NextRequest) {
    const _auth = await requireRole(); if (_auth instanceof NextResponse) return _auth;
    const { voteNo, division, department } = await req.json();
    const vote = String(voteNo || "").trim();
    const div = String(division || "").trim().toUpperCase();
    const dept = String(department || "").trim().toUpperCase();

    if (!vote || !div || !dept) {
        return NextResponse.json({ error: "voteNo, division and department are all required" }, { status: 400 });
    }
    if (!/^\d{6,16}$/.test(vote)) {
        return NextResponse.json({ error: "Vote number must be 6-16 digits" }, { status: 400 });
    }

    const existing = await prisma.costCentre.findUnique({ where: { voteNo: vote } });
    if (existing) {
        return NextResponse.json({
            error: `Vote ${vote} already registered under ${existing.department} / ${existing.division}`
        }, { status: 409 });
    }

    // Register the department implicitly so both entry paths stay consistent
    await prisma.department.upsert({ where: { name: dept }, update: {}, create: { name: dept } });

    const costCentre = await prisma.costCentre.create({
        data: { voteNo: vote, division: div, department: dept }
    });
    return NextResponse.json({ success: true, costCentre });
}

export async function PUT(req: NextRequest) {
    const _auth = await requireRole(); if (_auth instanceof NextResponse) return _auth;
    const { voteNo, division, department } = await req.json();
    const vote = String(voteNo || "").trim();
    if (!vote) {
        return NextResponse.json({ error: "voteNo is required" }, { status: 400 });
    }
    const data: any = {};
    if (division) data.division = String(division).trim().toUpperCase();
    if (department) {
        data.department = String(department).trim().toUpperCase();
        await prisma.department.upsert({ where: { name: data.department }, update: {}, create: { name: data.department } });
    }
    const costCentre = await prisma.costCentre.update({ where: { voteNo: vote }, data }).catch(() => null);
    if (!costCentre) {
        return NextResponse.json({ error: "Vote number not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, costCentre });
}

export async function DELETE(req: NextRequest) {
    const _auth = await requireRole(); if (_auth instanceof NextResponse) return _auth;
    const voteNo = req.nextUrl.searchParams.get("voteNo");
    if (!voteNo) {
        return NextResponse.json({ error: "voteNo query parameter is required" }, { status: 400 });
    }
    await prisma.costCentre.delete({ where: { voteNo } }).catch(() => null);
    return NextResponse.json({ success: true });
}
