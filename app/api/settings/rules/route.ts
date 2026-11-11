import { NextResponse } from "next/server";
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
        await saveRuleSettings(parsed.data, user.name || user.email || null);
        return NextResponse.json({ rules: await getRuleSettings() });
    } catch {
        return NextResponse.json({ error: "The rules could not be saved." }, { status: 500 });
    }
}
