import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireRole } from "@/lib/auth";

const settingsSchema = z.object({
    currencyCode: z.string().trim().min(1).max(8),
    currencySymbol: z.string().trim().min(1).max(8),
    // Reference prices now have a dated history (/api/settings/prices); the flat
    // fields are still accepted so older callers keep working.
    petrolPrice: z.coerce.number().finite().min(0).max(100000).optional(),
    dieselPrice: z.coerce.number().finite().min(0).max(100000).optional(),
});

export async function GET() {
    const _auth = await requireSession(); if (_auth instanceof NextResponse) return _auth;
    try {
        const settings = await prisma.systemSettings.findFirst({
            where: { id: 'global' }
        });
        return NextResponse.json({ settings });
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const _auth = await requireRole(); if (_auth instanceof NextResponse) return _auth;
    try {
        const parsed = settingsSchema.safeParse(await req.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid settings", details: parsed.error.flatten() }, { status: 400 });
        }
        const { currencyCode, currencySymbol, petrolPrice, dieselPrice } = parsed.data;
        const settings = await prisma.systemSettings.upsert({
            where: { id: 'global' },
            update: { currencyCode, currencySymbol, ...(petrolPrice !== undefined ? { petrolPrice } : {}), ...(dieselPrice !== undefined ? { dieselPrice } : {}) },
            create: { id: 'global', currencyCode, currencySymbol, petrolPrice: petrolPrice ?? 0, dieselPrice: dieselPrice ?? 0 },
        });
        return NextResponse.json({ settings });
    } catch (error) {
        return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
    }
}
