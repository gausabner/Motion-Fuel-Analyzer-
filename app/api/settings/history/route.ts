import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getAuditEvents } from "@/lib/audit";

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

/** The change history. Administrators only: it names who did what. `?format=csv` downloads it. */
export async function GET(req: Request) {
    const user = await requireRole();
    if (user instanceof NextResponse) return user;
    const sp = new URL(req.url).searchParams;
    const area = sp.get("area") ?? undefined;

    if (sp.get("format") === "csv") {
        const events = await getAuditEvents({ area, limit: 5000 });
        const body = ["When,Who,Area,What", ...events.map(e => [e.at, e.actor, e.area, e.summary].map(csvCell).join(","))].join("\r\n");
        return new NextResponse(body, {
            headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="change_history_${new Date().toISOString().slice(0, 10)}.csv"` },
        });
    }

    const limit = 40;
    const events = await getAuditEvents({ area, limit: limit + 1, before: sp.get("before") ?? undefined });
    return NextResponse.json({ events: events.slice(0, limit), more: events.length > limit });
}
