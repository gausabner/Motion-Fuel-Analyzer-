import { prisma } from "@/lib/prisma";
import { toLocalYmd } from "@/lib/date-format";
import { fmtDept, fmtLitres } from "@/lib/format";
import { getRuleSettings, type RuleSettings } from "@/lib/rule-settings";

/**
 * Exceptions, per-vehicle efficiency and the vehicle panel.
 *
 * Everything here is computed from the issued fills by fixed rules, on every
 * request. Nothing is stored except a human's review of an exception — so a
 * figure on screen can never say something the data does not show.
 *
 * What the data cannot support is left out rather than approximated:
 *  - After-hours fills: the export's time column is not a clock time (every
 *    one of ~29,000 values begins with "10"), so no rule is built on it.
 *  - True tank capacity: the fleet register carries no capacity, so the
 *    "over capacity" rule compares a fill with the unit's OWN largest previous
 *    fill and says so in its wording.
 *  - Vehicle class: not in the register either; fuel type stands in for it.
 */

/**
 * Odometer scale and every rule threshold come from Settings → Exception rules
 * (lib/rule-settings.ts). The default scale is 10 units per km: the HR580
 * odometer column carries one implied decimal, so 1257020 is 125,702.0 km, and
 * at that scale the medians come out at 9.7 L/100 km for petrol and 12.3 for
 * diesel.
 */

/** A leg shorter or longer than this is a typo or a missed fill, not a trip. */
const MIN_LEG_KM = 5;
const MAX_LEG_KM = 3000;

export type Fill = {
    id: string;
    unit: string;
    date: string;      // stored ISO instant (local midnight)
    day: string;       // local YYYY-MM-DD
    seq: string;
    qty: number;
    amt: number;
    rd: number | null; // odometer, raw units
    fuel: string;
    store: string;
    pump: string;
    ref: string;
    dept: string | null;
};

export type Severity = "hi" | "md" | "lo";
export type ReviewStatus = "Open" | "Explained" | "Escalated";

export type FuelException = {
    key: string;
    rule: "repeat-fill" | "over-capacity" | "class-outlier" | "no-distance" | "odometer-back" | "odometer-missing";
    sev: Severity;
    unit: string;
    what: string;
    /** Local YYYY-MM-DD the exception belongs to (the period end for period-level rules). */
    day: string;
    whenLabel: string;
    department: string | null;
    /** Litres the rule puts in question; null where no volume is implied. */
    risk: number | null;
    status: ReviewStatus;
};

const isRealUnit = (u: string | null | undefined) => !!u && u.trim() !== "" && u.toUpperCase() !== "UNKNOWN";
const fuelClass = (f: string) => (/petrol/i.test(f) ? "Petrol" : /diesel/i.test(f) ? "Diesel" : "Other");
const dayLabel = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

let cache: { stamp: string; fills: Fill[]; byUnit: Map<string, Fill[]> } | null = null;

/** All issued fills, oldest first per unit. Cached until the table changes. */
export async function loadFills(): Promise<{ fills: Fill[]; byUnit: Map<string, Fill[]> }> {
    const meta = (await (prisma as any).$queryRawUnsafe(
        `SELECT COUNT(*) AS n, MAX(createdAt) AS latest FROM FuelTransaction WHERE transType = 'FIS'`
    )) as { n: number | bigint; latest: string | number | null }[];
    const stamp = `${meta[0]?.n}:${meta[0]?.latest}`;
    if (cache && cache.stamp === stamp) return cache;

    const rows = (await (prisma as any).$queryRawUnsafe(`
        SELECT t.id, t.fleetUnit, t.transDate, t.issueTime, t.transQty, t.transAmt, t.fleetReading,
               t.fuelType, t.storeNo, t.pumpNo, t.transRefNo, c.department
        FROM FuelTransaction t
        LEFT JOIN CostCentre c ON t.transVoteNo = c.voteNo
        WHERE t.transType = 'FIS'
        ORDER BY t.fleetUnit, t.transDate, t.issueTime
    `)) as any[];

    const fills: Fill[] = [];
    const byUnit = new Map<string, Fill[]>();
    for (const r of rows) {
        if (!isRealUnit(r.fleetUnit)) continue;
        const raw = String(r.fleetReading ?? "").trim();
        const n = Number(raw);
        // "0" and "100" are the placeholders bulk units and blank slips carry.
        const rd = raw === "" || !Number.isFinite(n) || n <= 100 ? null : n;
        const f: Fill = {
            id: r.id,
            unit: String(r.fleetUnit).trim(),
            date: r.transDate,
            day: toLocalYmd(r.transDate),
            seq: r.issueTime ?? "",
            qty: Number(r.transQty) || 0,
            amt: Number(r.transAmt) || 0,
            rd,
            fuel: fuelClass(r.fuelType ?? ""),
            store: r.storeNo ?? "",
            pump: r.pumpNo ?? "",
            ref: r.transRefNo ?? "",
            dept: r.department ? fmtDept(r.department) : null,
        };
        fills.push(f);
        const list = byUnit.get(f.unit);
        if (list) list.push(f); else byUnit.set(f.unit, [f]);
    }
    cache = { stamp, fills, byUnit };
    return cache;
}

const median = (xs: number[]) => {
    if (xs.length === 0) return 0;
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export type UnitEfficiency = {
    unit: string;
    fuel: string;
    department: string | null;
    litres: number;      // all litres issued in range
    km: number;          // distance covered by usable legs
    legLitres: number;   // litres on those legs
    legs: number;
    l100: number | null; // null when there is not enough odometer evidence
    classMedian: number | null;
    ratio: number | null;
};

/** One row per unit active in the range, with L/100 km where the odometer supports it. */
export async function getFleetEfficiency(fromDay?: string, toDay?: string, rules?: RuleSettings): Promise<{ units: UnitEfficiency[]; medians: Record<string, number> }> {
    const { byUnit } = await loadFills();
    const cfg = rules ?? await getRuleSettings();
    const units: UnitEfficiency[] = [];
    for (const [unit, list] of byUnit) {
        let litres = 0, km = 0, legLitres = 0, legs = 0, prev: number | null = null;
        let dept: string | null = null, fuel = "Other";
        const deptCount = new Map<string, number>();
        for (const f of list) {
            const inRange = (!fromDay || f.day >= fromDay) && (!toDay || f.day <= toDay);
            if (f.rd != null) {
                if (prev != null && inRange) {
                    const leg = (f.rd - prev) / cfg.odometerUnitsPerKm;
                    if (leg >= MIN_LEG_KM && leg <= MAX_LEG_KM) { km += leg; legLitres += f.qty; legs++; }
                }
                prev = f.rd;
            }
            if (inRange) {
                litres += f.qty;
                fuel = f.fuel;
                if (f.dept) deptCount.set(f.dept, (deptCount.get(f.dept) ?? 0) + 1);
            }
        }
        if (litres <= 0) continue;
        let best = 0;
        for (const [d, n] of deptCount) if (n > best) { best = n; dept = d; }
        const enough = legs >= 3 && km >= 100;
        units.push({ unit, fuel, department: dept, litres, km, legLitres, legs, l100: enough ? (legLitres / km) * 100 : null, classMedian: null, ratio: null });
    }
    const medians: Record<string, number> = {};
    for (const cls of ["Petrol", "Diesel"]) {
        const xs = units.filter(u => u.fuel === cls && u.l100 != null).map(u => u.l100 as number);
        if (xs.length >= 8) medians[cls] = median(xs);
    }
    for (const u of units) {
        const m = medians[u.fuel];
        if (m && u.l100 != null) { u.classMedian = m; u.ratio = u.l100 / m; }
    }
    units.sort((a, b) => b.litres - a.litres);
    return { units, medians };
}

/** Every exception whose day falls in [fromDay, toDay], highest severity and volume first. */
export async function getExceptions(fromDay?: string, toDay?: string): Promise<FuelException[]> {
    const { byUnit } = await loadFills();
    const cfg = await getRuleSettings();
    const inRange = (d: string) => (!fromDay || d >= fromDay) && (!toDay || d <= toDay);
    const out: FuelException[] = [];
    const push = (e: Omit<FuelException, "status">) => out.push({ ...e, status: "Open" });

    for (const [unit, list] of byUnit) {
        let prev: Fill | null = null;       // previous fill with a usable odometer
        let prevAny: Fill | null = null;    // previous fill of any kind
        let maxFill = 0, seen = 0, everRead = false, missing = 0, missingDept: string | null = null;

        for (const f of list) {
            const here = inRange(f.day);

            // Repeat fill: a second issue the same day with almost no distance between.
            if (cfg.repeatFillEnabled && prevAny && prevAny.day === f.day) {
                if (f.rd != null && prevAny.rd != null) {
                    const km = (f.rd - prevAny.rd) / cfg.odometerUnitsPerKm;
                    if (km >= 0 && km < cfg.repeatFillMaxKm && here) {
                        push({ key: `repeat-fill:${unit}:${f.day}:${f.ref || f.seq}`, rule: "repeat-fill", sev: "hi", unit,
                            what: `Two fills the same day, ${km < 1 ? "under 1" : Math.round(km)} km driven between them`,
                            day: f.day, whenLabel: dayLabel(f.day), department: f.dept, risk: f.qty });
                    }
                } else if (here && everRead) {
                    push({ key: `repeat-fill:${unit}:${f.day}:${f.ref || f.seq}`, rule: "repeat-fill", sev: "md", unit,
                        what: "Two fills the same day, odometer not captured on one",
                        day: f.day, whenLabel: dayLabel(f.day), department: f.dept, risk: f.qty });
                }
            }

            // Larger than this unit has ever taken: the capacity rule, on the unit's own record.
            if (cfg.overCapacityEnabled && seen >= 8 && f.qty > maxFill * cfg.overCapacityFactor && f.qty - maxFill >= cfg.overCapacityMinLitres && here) {
                push({ key: `over-capacity:${unit}:${f.day}:${f.ref || f.seq}`, rule: "over-capacity", sev: "hi", unit,
                    what: `${fmtLitres(f.qty)} issued; its largest fill before this was ${fmtLitres(maxFill)}`,
                    day: f.day, whenLabel: dayLabel(f.day), department: f.dept, risk: f.qty - maxFill });
            }

            if (f.rd != null) {
                if (prev) {
                    if (cfg.odometerBackEnabled && f.rd < prev.rd! && here) {
                        push({ key: `odometer-back:${unit}:${f.day}:${f.ref || f.seq}`, rule: "odometer-back", sev: "lo", unit,
                            what: "Odometer lower than the previous fill",
                            day: f.day, whenLabel: dayLabel(f.day), department: f.dept, risk: null });
                    } else if (cfg.noDistanceEnabled && f.rd === prev.rd && f.day !== prev.day && here) {
                        push({ key: `no-distance:${unit}:${f.day}:${f.ref || f.seq}`, rule: "no-distance", sev: "md", unit,
                            what: `${fmtLitres(f.qty)} issued with no distance since the fill on ${dayLabel(prev.day)}`,
                            day: f.day, whenLabel: dayLabel(f.day), department: f.dept, risk: f.qty });
                    }
                }
                prev = f; everRead = true;
            } else if (everRead && here) {
                missing++; missingDept = f.dept ?? missingDept;
            }

            if (f.qty > maxFill) maxFill = f.qty;
            seen++; prevAny = f;
        }

        if (cfg.odometerMissingEnabled && missing >= cfg.odometerMissingMinFills) {
            const day = toDay ?? list[list.length - 1].day;
            push({ key: `odometer-missing:${unit}:${fromDay ?? "all"}:${toDay ?? "all"}`, rule: "odometer-missing", sev: "lo", unit,
                what: `Odometer not captured on ${missing} fills`,
                day, whenLabel: "This period", department: missingDept, risk: null });
        }
    }

    // Consumption far above the unit's fuel class, over the period as a whole.
    const { units } = cfg.classOutlierEnabled ? await getFleetEfficiency(fromDay, toDay, cfg) : { units: [] };
    for (const u of units) {
        if (u.ratio != null && u.ratio > cfg.classOutlierMultiple && u.classMedian) {
            const day = toDay ?? toLocalYmd(new Date());
            push({ key: `class-outlier:${u.unit}:${fromDay ?? "all"}:${toDay ?? "all"}`, rule: "class-outlier", sev: "md", unit: u.unit,
                what: `${u.l100!.toFixed(1)} L/100 km; the ${u.fuel.toLowerCase()} median is ${u.classMedian.toFixed(1)}`,
                day, whenLabel: "Period total", department: u.department,
                risk: Math.max(0, u.legLitres - (u.km * u.classMedian) / 100) });
        }
    }

    // Attach human reviews.
    try {
        const reviews = (await (prisma as any).exceptionReview.findMany()) as { key: string; status: string }[];
        const map = new Map(reviews.map(r => [r.key, r.status]));
        for (const e of out) {
            const s = map.get(e.key);
            if (s === "EXPLAINED") e.status = "Explained";
            else if (s === "ESCALATED") e.status = "Escalated";
        }
    } catch { /* table missing on an un-migrated database: everything stays Open */ }

    const rank = { hi: 0, md: 1, lo: 2 } as const;
    out.sort((a, b) => rank[a.sev] - rank[b.sev] || (b.risk ?? -1) - (a.risk ?? -1) || b.day.localeCompare(a.day));
    return out;
}

export type ExceptionSummary = { open: number; high: number; litresAtRisk: number; total: number };

export function summariseExceptions(list: FuelException[]): ExceptionSummary {
    const open = list.filter(e => e.status === "Open");
    return {
        open: open.length,
        high: open.filter(e => e.sev === "hi").length,
        litresAtRisk: open.reduce((s, e) => s + (e.risk ?? 0), 0),
        total: list.length,
    };
}

export type VehicleDetail = {
    unit: string;
    fuel: string;
    department: string | null;
    fillCount: number;
    firstDay: string;
    lastFill: { day: string; label: string; qty: number; store: string; pump: string } | null;
    /** Largest fill on record before the last one — the stand-in for tank size. */
    largestFill: number;
    periodLitres: number;
    periodLabel: string;
    l100: number | null;
    classMedian: number | null;
    recent: { day: string; label: string; qty: number; where: string; flagged: boolean }[];
    exceptions: FuelException[];
};

/** Everything the vehicle panel shows for one unit. Period = the unit's latest calendar month. */
export async function getVehicleDetail(unit: string): Promise<VehicleDetail | null> {
    const { byUnit } = await loadFills();
    const list = byUnit.get(unit);
    if (!list || list.length === 0) return null;
    const last = list[list.length - 1];
    const ym = last.day.slice(0, 7);
    const fromDay = `${ym}-01`, toDay = `${ym}-31`;

    const deptCount = new Map<string, number>();
    for (const f of list) if (f.dept) deptCount.set(f.dept, (deptCount.get(f.dept) ?? 0) + 1);
    let department: string | null = null, best = 0;
    for (const [d, n] of deptCount) if (n > best) { best = n; department = d; }

    const priorMax = list.slice(0, -1).reduce((m, f) => Math.max(m, f.qty), 0);
    const { units, medians } = await getFleetEfficiency(fromDay, toDay);
    const mine = units.find(u => u.unit === unit);
    // Fall back to the unit's whole record when one month is too thin to judge.
    let l100 = mine?.l100 ?? null;
    if (l100 == null) {
        const all = await getFleetEfficiency();
        l100 = all.units.find(u => u.unit === unit)?.l100 ?? null;
    }
    const exceptions = (await getExceptions(fromDay, toDay)).filter(e => e.unit === unit);
    const flaggedDays = new Set(exceptions.filter(e => e.status === "Open").map(e => e.day));
    const where = (f: Fill) => [f.store && `Store ${f.store}`, f.pump && `pump ${f.pump}`].filter(Boolean).join(" · ") || "Depot not recorded";
    const [y, m] = ym.split("-").map(Number);

    return {
        unit,
        fuel: last.fuel,
        department,
        fillCount: list.length,
        firstDay: list[0].day,
        lastFill: { day: last.day, label: dayLabel(last.day), qty: last.qty, store: last.store, pump: last.pump },
        largestFill: priorMax,
        periodLitres: list.filter(f => f.day >= fromDay && f.day <= toDay).reduce((s, f) => s + f.qty, 0),
        periodLabel: new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
        l100,
        classMedian: medians[last.fuel] ?? null,
        recent: list.slice(-6).reverse().map(f => ({ day: f.day, label: dayLabel(f.day), qty: f.qty, where: where(f), flagged: flaggedDays.has(f.day) })),
        exceptions,
    };
}

/** The latest calendar month that has issues — the default period everywhere. */
export async function getLatestMonth(): Promise<{ fromDay: string; toDay: string; label: string; from: Date; to: Date } | null> {
    const rows = (await (prisma as any).$queryRawUnsafe(
        `SELECT MAX(transDate) AS maxDate FROM FuelTransaction WHERE transType = 'FIS' AND transDate <= ?`,
        new Date().toISOString()
    )) as { maxDate: string | null }[];
    const max = rows?.[0]?.maxDate ? new Date(rows[0].maxDate) : null;
    if (!max || isNaN(max.getTime())) return null;
    const from = new Date(max.getFullYear(), max.getMonth(), 1);
    const to = new Date(max.getFullYear(), max.getMonth() + 1, 0);
    return {
        from, to,
        fromDay: toLocalYmd(from), toDay: toLocalYmd(to),
        label: from.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    };
}

/** Vote codes on issues that resolve to no cost centre, and the litres behind them. */
export async function getUnassigned(): Promise<{ codes: number; litres: number; transactions: number; totalTransactions: number }> {
    const r = (await (prisma as any).$queryRawUnsafe(`
        SELECT COUNT(DISTINCT CASE WHEN c.voteNo IS NULL THEN t.transVoteNo END) AS codes,
               SUM(CASE WHEN c.voteNo IS NULL THEN t.transQty ELSE 0 END) AS litres,
               SUM(CASE WHEN c.voteNo IS NULL THEN 1 ELSE 0 END) AS tx,
               COUNT(*) AS total
        FROM FuelTransaction t LEFT JOIN CostCentre c ON t.transVoteNo = c.voteNo
        WHERE t.transType = 'FIS' AND t.transVoteNo != ''
    `)) as any[];
    return { codes: Number(r[0]?.codes || 0), litres: Number(r[0]?.litres || 0), transactions: Number(r[0]?.tx || 0), totalTransactions: Number(r[0]?.total || 0) };
}
