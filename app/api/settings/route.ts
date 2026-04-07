import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
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
    try {
        const body = await req.json();
        const settings = await prisma.systemSettings.upsert({
            where: { id: 'global' },
            update: {
                currencyCode: body.currencyCode,
                currencySymbol: body.currencySymbol,
                petrolPrice: parseFloat(body.petrolPrice),
                dieselPrice: parseFloat(body.dieselPrice)
            },
            create: {
                id: 'global',
                currencyCode: body.currencyCode,
                currencySymbol: body.currencySymbol,
                petrolPrice: parseFloat(body.petrolPrice),
                dieselPrice: parseFloat(body.dieselPrice)
            }
        });
        return NextResponse.json({ settings });
    } catch (error) {
        return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
    }
}
