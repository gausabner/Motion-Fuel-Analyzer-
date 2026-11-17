import { NextResponse } from "next/server";
import { audit, describeChanges } from "@/lib/audit";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/auth";
import { classifyUnknownFuel, getDips, getTankLevels, getTanks, getUnregisteredStores } from "@/lib/tanks";
import { invalidateFillCache } from "@/lib/fuel-insights";
import { OIL, moveStoreFromOil, moveStoreToOil } from "@/lib/oil";

const optionalLitres = z.union([z.null(), z.coerce.number().finite().positive().max(10_000_000)]);

const schema = z.object({
    tankNo: z.string().trim().min(1).max(20),
    fuelType: z.enum(["Petrol", "Diesel", "Oil"]),
    name: z.string().trim().max(60).nullable(),
    capacityLitres: optionalLitres,
    reorderLitres: z.union([z.null(), z.coerce.number().finite().min(0).max(10_000_000)]),
}).refine(d => d.reorderLitres == null || d.capacityLitres == null || d.reorderLitres < d.capacityLitres, "The reorder level must be below the capacity.");

async function payload() {
    const [levels, dips, unregistered, all] = await Promise.all([getTankLevels(), getDips(), getUnregisteredStores(), getTanks()]);
    return { asOfDay: levels.asOfDay, tanks: levels.tanks, oilStores: all.filter(t => t.fuelType === OIL), dips, unregistered };
}

export async function GET() {
    const user = await requireSession();
    if (user instanceof NextResponse) return user;
    return NextResponse.json(await payload());
}

/**
 * Add a tank or change its details. Issues from the tank with no fuel type
 * recorded take the tank's fuel type. Registering a store as an oil store
 * moves its rows out of fuel (lib/oil.ts); changing it back moves them back.
 */
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
        const before = await (prisma as any).tankDefinition.findUnique({ where: { tankNo } });
        await (prisma as any).tankDefinition.upsert({ where: { tankNo }, update: data, create: { tankNo, ...data } });
        let reclassified = 0, toOil = { rows: 0, litres: 0 }, fromOil = { rows: 0, litres: 0 };
        if (fuelType === OIL) toOil = await moveStoreToOil(tankNo);
        else {
            if (before?.fuelType === OIL) fromOil = await moveStoreFromOil(tankNo, fuelType);
            reclassified = await classifyUnknownFuel(tankNo, fuelType);
        }
        if (reclassified > 0 || toOil.rows > 0 || fromOil.rows > 0) invalidateFillCache();
        const L = (n: number) => `${Math.round(n).toLocaleString("en-GB")} L`;
        const moved = [
            toOil.rows > 0 ? `${toOil.rows} records (${L(toOil.litres)}) moved out of fuel totals as oil` : "",
            fromOil.rows > 0 ? `${fromOil.rows} records (${L(fromOil.litres)}) brought back into fuel totals as ${fuelType}` : "",
            reclassified > 0 ? `${reclassified} records with no fuel type now counted as ${fuelType}` : "",
        ].filter(Boolean);
        const changes = before
            ? describeChanges(before, data, { fuelType: "Fuel", name: "Name", capacityLitres: "Capacity (L)", reorderLitres: "Reorder level (L)" })
            : [`${fuelType}${capacityLitres ? `, holds ${capacityLitres} L` : ""}`];
        if (!before || changes.length || moved.length) {
            await audit(user, "Settings", `Tank ${tankNo} ${before ? "changed" : "added"}. ${[...changes, ...moved].join("; ")}`.trim());
        }
        return NextResponse.json({ ...(await payload()), reclassified, toOil, fromOil });
    } catch {
        return NextResponse.json({ error: "The tank could not be saved." }, { status: 500 });
    }
}
