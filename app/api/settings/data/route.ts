import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getDataCoverage } from "@/lib/data-coverage";

export async function GET() {
    const user = await requireSession();
    if (user instanceof NextResponse) return user;
    return NextResponse.json(await getDataCoverage());
}
