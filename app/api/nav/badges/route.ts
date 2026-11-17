import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getOrganisation } from "@/lib/organisation";
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
    // `anchor` is the first day of the latest month with data: every period preset hangs off it,
    // so "the latest month" means the same month on every page.
    return NextResponse.json({ exceptions: summariseExceptions(exceptions).open, registry: unassigned.codes, anchor: month?.fromDay ?? null, fyStart: (await getOrganisation()).financialYearStartMonth });
}
