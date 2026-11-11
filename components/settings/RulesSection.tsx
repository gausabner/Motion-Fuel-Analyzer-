"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Seg } from "@/components/ui/Seg";
import { useNavBadges } from "@/components/dashboard/NavBadges";
import { Section, Switch } from "./parts";
import type { RuleSettings } from "@/lib/rule-settings";

type Loaded = RuleSettings & { updatedAt: string | null; updatedBy: string | null };
const KEYS: (keyof RuleSettings)[] = [
    "repeatFillEnabled", "repeatFillMaxKm", "overCapacityEnabled", "overCapacityFactor", "overCapacityMinLitres",
    "noDistanceEnabled", "odometerBackEnabled", "odometerMissingEnabled", "odometerMissingMinFills",
    "classOutlierEnabled", "classOutlierMultiple", "odometerUnitsPerKm",
];
const pick = (r: Loaded | RuleSettings): RuleSettings => Object.fromEntries(KEYS.map(k => [k, r[k]])) as RuleSettings;

/** A small number field with its unit written after it. */
function Num({ id, value, onChange, unit, min, max, step = 1, disabled, label }: {
    id: string; value: number; onChange: (v: number) => void; unit: string; min: number; max: number; step?: number; disabled?: boolean; label: string;
}) {
    const bad = !Number.isFinite(value) || value < min || value > max;
    return (
        <span className="inline-flex items-center gap-1.5">
            <Input id={id} type="number" inputMode="decimal" aria-label={label} aria-invalid={bad} disabled={disabled}
                className="mono h-9 w-[84px] text-right" min={min} max={max} step={step}
                value={Number.isFinite(value) ? value : ""} onChange={e => onChange(e.target.value === "" ? NaN : Number(e.target.value))} />
            <span className="text-[13px] text-muted-foreground">{unit}</span>
        </span>
    );
}

/** One rule: its name and meaning, its threshold, and its switch. */
function Rule({ id, name, hint, on, onToggle, children, severity }: {
    id: string; name: string; hint: string; on: boolean; onToggle: (v: boolean) => void; children?: ReactNode; severity: "hi" | "md" | "lo";
}) {
    return (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-grid py-4 last:border-0 last:pb-0">
            <div className="min-w-[240px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span id={id} className="text-sm font-medium">{name}</span>
                    <span className={`sev ${severity}`}>{severity === "hi" ? "High" : severity === "md" ? "Medium" : "Low"}</span>
                </div>
                <p className="mt-0.5 max-w-[56ch] text-[13px] leading-normal text-muted-foreground">{hint}</p>
            </div>
            <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 transition-opacity duration-200 ${on ? "" : "opacity-45"}`}>{children}</div>
            <Switch checked={on} onChange={onToggle} labelledBy={id} />
        </div>
    );
}

export function RulesSection() {
    const router = useRouter();
    const { refresh } = useNavBadges();
    const [saved, setSaved] = useState<Loaded | null>(null);
    const [defaults, setDefaults] = useState<RuleSettings | null>(null);
    const [draft, setDraft] = useState<RuleSettings | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetch("/api/settings/rules").then(r => r.json()).then(d => {
            if (d.rules) { setSaved(d.rules); setDraft(pick(d.rules)); setDefaults(d.defaults); }
        }).catch(() => toast.error("The exception rules could not be loaded. Reload the page to try again."));
    }, []);

    if (!saved || !draft || !defaults) {
        return <div className="skel h-72" aria-busy="true" aria-label="Loading exception rules" />;
    }

    const set = <K extends keyof RuleSettings>(k: K, v: RuleSettings[K]) => setDraft({ ...draft, [k]: v });
    const dirty = KEYS.some(k => draft[k] !== saved[k]);
    const isDefault = KEYS.every(k => draft[k] === defaults[k]);
    const within = (v: number, min: number, max: number) => Number.isFinite(v) && v >= min && v <= max;
    const valid = within(draft.repeatFillMaxKm, 1, 500) && within(draft.overCapacityFactor, 1.05, 10) && within(draft.overCapacityMinLitres, 0, 1000)
        && within(draft.odometerMissingMinFills, 1, 100) && Number.isInteger(draft.odometerMissingMinFills) && within(draft.classOutlierMultiple, 1.1, 10);

    const save = async () => {
        setSaving(true);
        try {
            const res = await fetch("/api/settings/rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(res.status === 403 ? "Only an administrator can change the exception rules." : data.error || "The rules were not saved. Check the values and try again.");
                return;
            }
            setSaved(data.rules); setDraft(pick(data.rules));
            // The worklist is recomputed from the new thresholds, so say what that did.
            const b = await fetch("/api/nav/badges").then(r => (r.ok ? r.json() : null)).catch(() => null);
            toast("Exception rules saved", b ? { description: `${b.exceptions} ${b.exceptions === 1 ? "exception is" : "exceptions are"} now open in the latest month.` } : undefined);
            refresh(); router.refresh();
        } catch {
            toast.error("The rules were not saved. Check your connection and try again.");
        } finally { setSaving(false); }
    };

    return (
        <Section id="exception-rules" title="Exception rules"
            sub="These decide which fills appear on the Exceptions worklist. Changing a threshold re-reads every fill on record; reviews already made are kept.">
            <Rule id="rule-repeat" name="Repeat fill" severity="hi" on={draft.repeatFillEnabled} onToggle={v => set("repeatFillEnabled", v)}
                hint="A unit fills twice on the same day with almost no distance driven in between.">
                <Num id="repeat-km" label="Repeat fill: maximum distance between fills" value={draft.repeatFillMaxKm} onChange={v => set("repeatFillMaxKm", v)} unit="km or less between fills" min={1} max={500} disabled={!draft.repeatFillEnabled} />
            </Rule>
            <Rule id="rule-capacity" name="Larger than the unit has ever taken" severity="hi" on={draft.overCapacityEnabled} onToggle={v => set("overCapacityEnabled", v)}
                hint="Tank sizes are not in the fleet register, so a fill is measured against the unit's own largest previous fill.">
                <Num id="cap-factor" label="Larger than ever: multiple of the previous largest fill" value={draft.overCapacityFactor} onChange={v => set("overCapacityFactor", v)} unit="× its largest," min={1.05} max={10} step={0.05} disabled={!draft.overCapacityEnabled} />
                <Num id="cap-litres" label="Larger than ever: minimum extra litres" value={draft.overCapacityMinLitres} onChange={v => set("overCapacityMinLitres", v)} unit="L or more over" min={0} max={1000} disabled={!draft.overCapacityEnabled} />
            </Rule>
            <Rule id="rule-outlier" name="Consumption far above its fuel type" severity="md" on={draft.classOutlierEnabled} onToggle={v => set("classOutlierEnabled", v)}
                hint="A unit's litres per 100 km over the period, against the median for petrol or diesel units. Also sets the diamonds on the Fleet page.">
                <Num id="outlier-x" label="Consumption outlier: multiple of the median" value={draft.classOutlierMultiple} onChange={v => set("classOutlierMultiple", v)} unit="× the median" min={1.1} max={10} step={0.1} disabled={!draft.classOutlierEnabled} />
            </Rule>
            <Rule id="rule-nodistance" name="Fuel with no distance" severity="md" on={draft.noDistanceEnabled} onToggle={v => set("noDistanceEnabled", v)}
                hint="Fuel is issued on a later day with the odometer unchanged since the previous fill." />
            <Rule id="rule-back" name="Odometer runs backwards" severity="lo" on={draft.odometerBackEnabled} onToggle={v => set("odometerBackEnabled", v)}
                hint="The reading is lower than at the previous fill. Usually a typing error, sometimes a swapped unit number." />
            <Rule id="rule-missing" name="Odometer not captured" severity="lo" on={draft.odometerMissingEnabled} onToggle={v => set("odometerMissingEnabled", v)}
                hint="A unit that normally records its odometer has fills in the period without one.">
                <Num id="missing-n" label="Odometer not captured: minimum fills" value={draft.odometerMissingMinFills} onChange={v => set("odometerMissingMinFills", v)} unit="fills or more" min={1} max={100} disabled={!draft.odometerMissingEnabled} />
            </Rule>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-4 mt-4">
                <div className="min-w-[240px] flex-1">
                    <div className="text-sm font-medium">Odometer readings are recorded in</div>
                    <p className="mt-0.5 max-w-[56ch] text-[13px] leading-normal text-muted-foreground">
                        Every distance and every litres-per-100-km figure depends on this. Tenths of a kilometre gives medians near 10 for petrol and 12 for diesel on the current data; whole kilometres would make them ten times smaller.
                    </p>
                </div>
                <Seg light label="Odometer unit" value={String(draft.odometerUnitsPerKm)} onChange={k => set("odometerUnitsPerKm", Number(k))}
                    items={[{ key: "10", label: "Tenths of a km" }, { key: "1", label: "Whole km" }]} />
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2.5">
                <span className="mr-auto text-[13px] text-muted-foreground">
                    {dirty ? "You have changes that are not saved yet."
                        : saved.updatedAt ? `Last changed ${new Date(saved.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}${saved.updatedBy ? ` by ${saved.updatedBy}` : ""}.`
                            : "These are the original thresholds; nobody has changed them."}
                </span>
                <Button variant="ghost" disabled={isDefault || saving} onClick={() => setDraft(defaults)}>Use original values</Button>
                <Button variant="outline" disabled={!dirty || saving} onClick={() => setDraft(pick(saved))}>Discard</Button>
                <Button disabled={!dirty || !valid || saving} onClick={save}>{saving ? "Saving" : "Save rules"}</Button>
            </div>
        </Section>
    );
}
