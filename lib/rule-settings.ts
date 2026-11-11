import { prisma } from "@/lib/prisma";

/**
 * Thresholds for the exception rules. Defaults are the values the rules
 * shipped with; an administrator can change them in Settings → Exception rules.
 */
export type RuleSettings = {
    repeatFillEnabled: boolean;
    /** A second fill the same day counts as a repeat when fewer than this many km were driven. */
    repeatFillMaxKm: number;
    overCapacityEnabled: boolean;
    /** A fill is "larger than ever" when it exceeds the unit's previous largest by this factor… */
    overCapacityFactor: number;
    /** …and by at least this many litres. */
    overCapacityMinLitres: number;
    noDistanceEnabled: boolean;
    odometerBackEnabled: boolean;
    odometerMissingEnabled: boolean;
    odometerMissingMinFills: number;
    classOutlierEnabled: boolean;
    /** Consumption above this multiple of the fuel-type median is flagged. */
    classOutlierMultiple: number;
    /** Odometer units per kilometre: 10 when readings carry one implied decimal, 1 for whole km. */
    odometerUnitsPerKm: number;
};

export const RULE_DEFAULTS: RuleSettings = {
    repeatFillEnabled: true,
    repeatFillMaxKm: 15,
    overCapacityEnabled: true,
    overCapacityFactor: 1.5,
    overCapacityMinLitres: 20,
    noDistanceEnabled: true,
    odometerBackEnabled: true,
    odometerMissingEnabled: true,
    odometerMissingMinFills: 3,
    classOutlierEnabled: true,
    classOutlierMultiple: 2,
    odometerUnitsPerKm: 10,
};

export type RuleSettingsMeta = { updatedAt: string | null; updatedBy: string | null };

/** Current thresholds, falling back to the defaults when nothing has been saved (or the table is not migrated yet). */
export async function getRuleSettings(): Promise<RuleSettings & RuleSettingsMeta> {
    try {
        const row = await (prisma as any).exceptionRuleSettings.findUnique({ where: { id: "global" } });
        if (!row) return { ...RULE_DEFAULTS, updatedAt: null, updatedBy: null };
        const out = { ...RULE_DEFAULTS } as Record<string, unknown>;
        for (const k of Object.keys(RULE_DEFAULTS)) if (row[k] !== null && row[k] !== undefined) out[k] = row[k];
        return { ...(out as RuleSettings), updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null, updatedBy: row.updatedBy ?? null };
    } catch {
        return { ...RULE_DEFAULTS, updatedAt: null, updatedBy: null };
    }
}

export async function saveRuleSettings(next: RuleSettings, by: string | null): Promise<void> {
    await (prisma as any).exceptionRuleSettings.upsert({
        where: { id: "global" },
        update: { ...next, updatedBy: by },
        create: { id: "global", ...next, updatedBy: by },
    });
}
