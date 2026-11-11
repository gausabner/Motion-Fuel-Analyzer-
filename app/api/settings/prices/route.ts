import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/auth";
import { getPriceHistory, syncCurrentPrices } from "@/lib/reference-prices";

const schema = z.object({
    fuel: z.enum(["Petrol", "Diesel"]),
    price: z.coerce.number().finite().positive().max(100000),
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in the form YYYY-MM-DD"),
});

export async function GET() {
    const user = await requireSession();
    if (user instanceof NextResponse) return user;
    return NextResponse.json({ prices: await getPriceHistory() });
}

/** Add a price, or replace the one already set for that fuel and date. */
export async function POST(req: Request) {
    const user = await requireRole();
    if (user instanceof NextResponse) return user;
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: "Enter a fuel, a price above zero and a valid date.", details: parsed.error.flatten() }, { status: 400 });
    }
    const { fuel, price, effectiveFrom } = parsed.data;
    try {
        await (prisma as any).referencePrice.upsert({
            where: { fuel_effectiveFrom: { fuel, effectiveFrom } },
            update: { price, createdBy: user.name || user.email || null },
            create: { fuel, price, effectiveFrom, createdBy: user.name || user.email || null },
        });
        await syncCurrentPrices();
        return NextResponse.json({ prices: await getPriceHistory() });
    } catch {
        return NextResponse.json({ error: "The price could not be saved." }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    const user = await requireRole();
    if (user instanceof NextResponse) return user;
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "No price was named." }, { status: 400 });
    try {
        await (prisma as any).referencePrice.delete({ where: { id } });
        await syncCurrentPrices();
        return NextResponse.json({ prices: await getPriceHistory() });
    } catch {
        return NextResponse.json({ error: "That price could not be removed." }, { status: 500 });
    }
}
