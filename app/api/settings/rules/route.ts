import { NextResponse } from "next/server";
import { audit, describeChanges } from "@/lib/audit";
import { z } from "zod";
import { requireRole, requireSession } from "@/lib/auth";
import { getRuleSettings, saveRuleSettings, RULE_DEFAULTS } from "@/lib/rule-settings";

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
});

const RULE_LABELS: Record<string, string> = {
    repeatFillEnabled: "Repeat fill", repeatFillMaxKm: "Repeat fill distance (km)",
    overCapacityEnabled: "Larger than ever", overCapacityFactor: "Larger-than-ever factor", overCapacityMinLitres: "Larger-than-ever minimum litres",
    noDistanceEnabled: "Fuel with no distance", odometerBackEnabled: "Odometer runs backwards",
    odometerMissingEnabled: "Odometer not captured", odometerMissingMinFills: "Odometer not captured, minimum fills",
    classOutlierEnabled: "Consumption outlier", classOutlierMultiple: "Consumption outlier multiple", odometerUnitsPerKm: "Odometer units per km",
};

export async function GET() {
    const user = await requireSession();
    if (user instanceof NextResponse) return user;
    return NextResponse.json({ rules: await getRuleSettings(), defaults: RULE_DEFAULTS });
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
