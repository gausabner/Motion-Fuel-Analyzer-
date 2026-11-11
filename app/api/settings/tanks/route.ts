import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/auth";
import { classifyUnknownFuel, getDips, getTankLevels, getUnregisteredStores } from "@/lib/tanks";
import { invalidateFillCache } from "@/lib/fuel-insights";

const optionalLitres = z.union([z.null(), z.coerce.number().finite().positive().max(10_000_000)]);

const schema = z.object({
    tankNo: z.string().trim().min(1).max(20),
    fuelType: z.enum(["Petrol", "Diesel"]),
    name: z.string().trim().max(60).nullable(),
    capacityLitres: optionalLitres,
    reorderLitres: z.union([z.null(), z.coerce.number().finite().min(0).max(10_000_000)]),
}).refine(d => d.reorderLitres == null || d.capacityLitres == null || d.reorderLitres < d.capacityLitres, "The reorder level must be below the capacity.");

async function payload() {
    const [levels, dips, unregistered] = await Promise.all([getTankLevels(), getDips(), getUnregisteredStores()]);
    return { asOfDay: levels.asOfDay, tanks: levels.tanks, dips, unregistered };
}

export async function GET() {
    const user = await requireSession();
    if (user instanceof NextResponse) return user;
    return NextResponse.json(await payload());
}

/** Add a tank or change its details. Issues from the tank with no fuel type recorded take the tank's fuel type. */
export async function POST(req: Request) {
    const user = await requireRole();
    if (user instanceof NextResponse) return user;
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message;
        return NextResponse.json({ error: msg === "The reorder level must be below the capacity." ? msg : "Check the tank number, fuel, capacity and reorder level." }, { status: 400 });
    }
    const { tankNo, fuelType, name, capacityLitres, reorderLitres } = parsed.data;
    try {
        const data = { fuelType, name: name || null, capacityLitres, reorderLitres };
        await (prisma as any).tankDefinition.upsert({ where: { tankNo }, update: data, create: { tankNo, ...data } });
        const reclassified = await classifyUnknownFuel(tankNo, fuelType);
        if (reclassified > 0) invalidateFillCache();
        return NextResponse.json({ ...(await payload()), reclassified });
    } catch {
        return NextResponse.json({ error: "The tank could not be saved." }, { status: 500 });
    }
}
