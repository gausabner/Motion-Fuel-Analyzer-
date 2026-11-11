import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getExceptions, getLatestMonth, getUnassigned, summariseExceptions } from "@/lib/fuel-insights";

/** Counts shown beside menu items: open exceptions this period, vote codes still to file. */
export async function GET() {
    const user = await requireSession();
    if (user instanceof NextResponse) return user;
    const month = await getLatestMonth();
    const [exceptions, unassigned] = await Promise.all([
        month ? getExceptions(month.fromDay, month.toDay) : Promise.resolve([]),
        getUnassigned(),
    ]);
    return NextResponse.json({ exceptions: summariseExceptions(exceptions).open, registry: unassigned.codes });
}
