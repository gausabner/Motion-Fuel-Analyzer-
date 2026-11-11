import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getVehicleDetail } from "@/lib/fuel-insights";

/** Everything the vehicle panel shows for one unit number. */
export async function GET(_req: Request, { params }: { params: Promise<{ unit: string }> }) {
    const user = await requireSession();
    if (user instanceof NextResponse) return user;

    const { unit } = await params;
    const detail = await getVehicleDetail(decodeURIComponent(unit));
    if (!detail) return NextResponse.json({ error: "No fills recorded for this unit" }, { status: 404 });
    return NextResponse.json(detail);
}
