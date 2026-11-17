import { NextResponse } from "next/server";
import { audit, describeChanges } from "@/lib/audit";
import { z } from "zod";
import { requireRole, requireSession } from "@/lib/auth";
import { getRuleSettings, saveRuleSettings, RULE_DEFAULTS } from "@/lib/rule-settings";
import { getFleetEfficiency } from "@/lib/fuel-insights";

const schema = z.object({
    repeatFillEnabled: z.boolean(),
    repeatFillMaxKm: z.coerce.number().finite().min(1).max(500),
    overCapacityEnabled: z.boolean(),
    overCapacityFactor: z.coerce.number().finite().min(1.05).max(10),
    overCapacityMinLitres: z.coerce.number().finite().min(0).max(1000),
    noDistanceEnabled: z.boolean(),
    odometerBackEnabled: z.boolean(),
    odometerMissingEnabled: z.boolean(),
    odometerMissingMinFills: z.coerce.number().int().min(1).max(100),
    classOutlierEnabled: z.boolean(),
    classOutlierMultiple: z.coerce.number().finite().min(1.1).max(10),
    odometerUnitsPerKm: z.coerce.number().refine(v => v === 1 || v === 10, "Odometer scale must be 1 or 10"),
    noVehicleEnabled: z.boolean().default(true),
});

const RULE_LABELS: Record<string, string> = {
    repeatFillEnabled: "Repeat fill", repeatFillMaxKm: "Repeat fill distance (km)",
    overCapacityEnabled: "Larger than ever", overCapacityFactor: "Larger-than-ever factor", overCapacityMinLitres: "Larger-than-ever minimum litres",
    noDistanceEnabled: "Fuel with no distance", odometerBackEnabled: "Odometer runs backwards",
    odometerMissingEnabled: "Odometer not captured", odometerMissingMinFills: "Odometer not captured, minimum fills",
    classOutlierEnabled: "Consumption outlier", classOutlierMultiple: "Consumption outlier multiple", odometerUnitsPerKm: "Odometer units per km", noVehicleEnabled: "No vehicle recorded",
};

/**
 * What each odometer reading would make of the fleet's own records: the median
 * litres per 100 km by fuel. A wrong choice shows at once as consumption no
 * vehicle could achieve, so the page puts the evidence beside the choice.
 */
async function odometerCheck(rules: Awaited<ReturnType<typeof getRuleSettings>>) {
    const out: Record<string, Record<string, number>> = {};
    for (const scale of [10, 1]) {
        const { medians } = await getFleetEfficiency(undefined, undefined, { ...rules, odometerUnitsPerKm: scale });
        out[String(scale)] = medians;
    }
    return out;
}

export async function GET() {
    const user = await requireSession();
    if (user instanceof NextResponse) return user;
    const rules = await getRuleSettings();
    const check = await odometerCheck(rules).catch(() => null);
    return NextResponse.json({ rules, defaults: RULE_DEFAULTS, odometerCheck: check });
}

export async function POST(req: Request) {
    const user = await requireRole();
    if (user instanceof NextResponse) return user;
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: "One of the values is outside its allowed range.", details: parsed.error.flatten() }, { status: 400 });
    }
    try {
        const before = await getRuleSettings();
        await saveRuleSettings(parsed.data, user.name || user.email || null);
        const changes = describeChanges(before as unknown as Record<string, unknown>, parsed.data as unknown as Record<string, unknown>, RULE_LABELS);
        if (changes.length) await audit(user, "Settings", `Exception rules changed. ${changes.join("; ")}`);
        return NextResponse.json({ rules: await getRuleSettings() });
    } catch {
        return NextResponse.json({ error: "The rules could not be saved." }, { status: 500 });
    }
}
