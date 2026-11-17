import { NextRequest, NextResponse } from "next/server";
import { getPeriodComparison, type CompareDimension } from "@/lib/analytics";
import { toLocalYmd } from "@/lib/date-format";

const DIMENSIONS: CompareDimension[] = ["total", "fuelType", "fleetUnit", "department", "division"];

const DIM_LABEL: Record<CompareDimension, string> = {
    total: "Fleet total",
    fuelType: "Fuel type",
    fleetUnit: "Fleet unit",
    department: "Department",
    division: "Division",
};

function csvEscape(v: unknown): string {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Stored dates are local-midnight instants — format in local time, not UTC.
const fmtDate = (d?: string) => (d ? toLocalYmd(d) : "—");

import { requireSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
    const _auth = await requireSession(); if (_auth instanceof NextResponse) return _auth;
    const sp = req.nextUrl.searchParams;
    const dimParam = (sp.get("dim") || "department") as CompareDimension;
    const dimension: CompareDimension = DIMENSIONS.includes(dimParam) ? dimParam : "department";

    const periodA = { from: sp.get("aFrom") || undefined, to: sp.get("aTo") || undefined };
    const periodB = { from: sp.get("bFrom") || undefined, to: sp.get("bTo") || undefined };
    const filters = {
        fuelType: sp.get("fuelType") || undefined,
        department: sp.get("department") || undefined,
        division: sp.get("division") || undefined,
        vehicleId: sp.get("vehicleId") || undefined,
    };

    const result = await getPeriodComparison(dimension, periodA, periodB, filters);

    if (sp.get("format") === "csv") {
        const aLabel = `${fmtDate(periodA.from)} to ${fmtDate(periodA.to)}`;
        const bLabel = `${fmtDate(periodB.from)} to ${fmtDate(periodB.to)}`;
        const headers = [
            DIM_LABEL[dimension],
            `Period A (${aLabel}) Volume (L)`,
            `Period A Cost`,
            `Period A Txns`,
            `Period B (${bLabel}) Volume (L)`,
            `Period B Cost`,
            `Period B Txns`,
            `Change (L)`,
            `Change (%)`,
        ];
        const body = result.rows.map(r => [
            r.key,
            r.aVolume.toFixed(2), r.aCost.toFixed(2), r.aTxns,
            r.bVolume.toFixed(2), r.bCost.toFixed(2), r.bTxns,
            r.deltaVolume.toFixed(2),
            r.deltaPct === null ? "n/a" : r.deltaPct.toFixed(1),
        ]);
        const t = result.totals;
        const totalRow = [
            "TOTAL",
            t.aVolume.toFixed(2), t.aCost.toFixed(2), t.aTxns,
            t.bVolume.toFixed(2), t.bCost.toFixed(2), t.bTxns,
            t.deltaVolume.toFixed(2),
            t.deltaPct === null ? "n/a" : t.deltaPct.toFixed(1),
        ];
        const csv = [headers, ...body, totalRow].map(row => row.map(csvEscape).join(",")).join("\n");
        return new NextResponse(csv, {
            headers: {
                "Content-Type": "text/csv;charset=utf-8",
                "Content-Disposition": `attachment; filename="period_comparison_${dimension}_${new Date().toISOString().split("T")[0]}.csv"`,
            },
        });
    }

    return NextResponse.json(result);
}
