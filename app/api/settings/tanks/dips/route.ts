import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getDips, getTankLevels, getUnregisteredStores } from "@/lib/tanks";

const schema = z.object({
    tankNo: z.string().trim().min(1).max(20),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    litres: z.coerce.number().finite().min(0).max(10_000_000),
});

async function payload() {
    const [levels, dips, unregistered] = await Promise.all([getTankLevels(), getDips(), getUnregisteredStores()]);
    return { asOfDay: levels.asOfDay, tanks: levels.tanks, dips, unregistered };
}

/** Record a dip reading, or correct the one already recorded for that tank and day. */
export async function POST(req: Request) {
    const user = await requireRole();
    if (user instanceof NextResponse) return user;
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Enter a date and the litres read from the tank." }, { status: 400 });
    const { tankNo, day, litres } = parsed.data;

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (day > today) return NextResponse.json({ error: "A dip reading cannot be dated in the future." }, { status: 400 });

    const tank = await (prisma as any).tankDefinition.findUnique({ where: { tankNo } });
    if (!tank) return NextResponse.json({ error: "That tank is not in the register." }, { status: 404 });
    if (tank.capacityLitres && litres > tank.capacityLitres) {
        return NextResponse.json({ error: `That is more than the tank holds (${Math.round(tank.capacityLitres).toLocaleString("en-GB")} L). Check the reading or the capacity.` }, { status: 400 });
    }
    try {
        const by = user.name || user.email || null;
        await (prisma as any).tankDip.upsert({ where: { tankNo_day: { tankNo, day } }, update: { litres, createdBy: by }, create: { tankNo, day, litres, createdBy: by } });
        return NextResponse.json(await payload());
    } catch {
        return NextResponse.json({ error: "The dip reading could not be saved." }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    const user = await requireRole();
    if (user instanceof NextResponse) return user;
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "No reading was named." }, { status: 400 });
    try {
        await (prisma as any).tankDip.delete({ where: { id } });
        return NextResponse.json(await payload());
    } catch {
        return NextResponse.json({ error: "That reading could not be removed." }, { status: 500 });
    }
}
