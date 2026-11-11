import { prisma } from "@/lib/prisma";
import { toLocalYmd } from "@/lib/date-format";
import { fmtDept, fmtLitres, fmtMoneyCompact } from "@/lib/format";
import { getExceptions, getFleetEfficiency, getUnassigned, summariseExceptions, type FuelException, type ExceptionSummary } from "@/lib/fuel-insights";

/**
 * Everything the dashboard shows for one period, including the written
 * briefing. The briefing is assembled from these figures by fixed rules — each
 * sentence is only emitted when its condition holds — so it cannot state
 * something the data does not show.
 */

export type BriefPart = string | { b: string } | { unit: string };

export type TankBook = { store: string; fuel: string; received: number; issued: number };

export type Overview = {
    range: { fromDay: string; toDay: string; label: string; prevLabel: string };
    spend: number; prevSpend: number;
    litres: number; prevLitres: number;
    petrol: number; diesel: number;
    l100: number | null; prevL100: number | null;
    months: { key: string; label: string; full: string; spend: number; litres: number }[];
    avgSpend: number; avgLitres: number;
    departments: { label: string; litres: number; unassigned?: boolean }[];
    exceptions: ExceptionSummary & { byLevel: { hi: number; md: number; lo: number } };
    attention: FuelException[];
    tanks: TankBook[];
    unassigned: { codes: number; litres: number };
    lastUpload: { at: string; files: number; rows: number } | null;
    incomplete: boolean;
    brief: BriefPart[];
};

const DAY = 86_400_000;
const parseDay = (ymd: string) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(y, m - 1, d); };
const monthName = (d: Date, long = false) => d.toLocaleDateString("en-GB", { month: long ? "long" : "short" });

/** A human label for a range: "October 2026" for a whole month, otherwise the dates. */
export function rangeLabel(fromDay: string, toDay: string): string {
    const a = parseDay(fromDay), b = parseDay(toDay);
    const lastOfMonth = new Date(a.getFullYear(), a.getMonth() + 1, 0).getDate();
    if (a.getDate() === 1 && b.getDate() === lastOfMonth && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
        return a.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    }
    if (a.getDate() === 1 && a.getMonth() === 0 && a.getFullYear() === b.getFullYear()) {
        return `1 Jan – ${b.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
    }
    const f: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
    return `${a.toLocaleDateString("en-GB", f)} – ${b.toLocaleDateString("en-GB", f)}`;
}

/** The period to compare against: the previous calendar month for a whole month, else the same number of days before. */
export function previousRange(fromDay: string, toDay: string): { fromDay: string; toDay: string; label: string } {
    const a = parseDay(fromDay), b = parseDay(toDay);
    const lastOfMonth = new Date(a.getFullYear(), a.getMonth() + 1, 0).getDate();
    if (a.getDate() === 1 && b.getDate() === lastOfMonth && a.getMonth() === b.getMonth()) {
        const pa = new Date(a.getFullYear(), a.getMonth() - 1, 1), pb = new Date(a.getFullYear(), a.getMonth(), 0);
        return { fromDay: toLocalYmd(pa), toDay: toLocalYmd(pb), label: monthName(pa) };
    }
    if (a.getDate() === 1 && a.getMonth() === 0) {
        const pa = new Date(a.getFullYear() - 1, 0, 1), pb = new Date(b.getFullYear() - 1, b.getMonth(), b.getDate());
        return { fromDay: toLocalYmd(pa), toDay: toLocalYmd(pb), label: String(pa.getFullYear()) };
    }
    const days = Math.round((b.getTime() - a.getTime()) / DAY) + 1;
    const pb = new Date(a.getTime() - DAY), pa = new Date(pb.getTime() - (days - 1) * DAY);
    return { fromDay: toLocalYmd(pa), toDay: toLocalYmd(pb), label: "the period before" };
}

const q = (sql: string, ...params: any[]) => (prisma as any).$queryRawUnsafe(sql, ...params) as Promise<any[]>;
const IN_RANGE = `date(t.transDate, 'localtime') BETWEEN ? AND ?`;

async function totals(fromDay: string, toDay: string) {
    const rows = await q(
        `SELECT t.fuelType AS fuel, SUM(t.transQty) AS litres, SUM(t.transAmt) AS spend
         FROM FuelTransaction t WHERE t.transType = 'FIS' AND ${IN_RANGE} GROUP BY t.fuelType`, fromDay, toDay);
    let spend = 0, litres = 0, petrol = 0, diesel = 0;
    for (const r of rows) {
        const l = Number(r.litres || 0);
        spend += Number(r.spend || 0); litres += l;
        if (/petrol/i.test(r.fuel)) petrol += l; else if (/diesel/i.test(r.fuel)) diesel += l;
    }
    return { spend, litres, petrol, diesel };
}

async function byDepartment(fromDay: string, toDay: string): Promise<Map<string, number>> {
    const rows = await q(
        `SELECT COALESCE(c.department, '__unassigned') AS dept, SUM(t.transQty) AS litres
         FROM FuelTransaction t LEFT JOIN CostCentre c ON t.transVoteNo = c.voteNo
         WHERE t.transType = 'FIS' AND ${IN_RANGE} GROUP BY dept`, fromDay, toDay);
    return new Map(rows.map(r => [r.dept as string, Number(r.litres || 0)]));
}

const fleetL100 = async (fromDay: string, toDay: string) => {
    const { units } = await getFleetEfficiency(fromDay, toDay);
    let km = 0, l = 0;
    for (const u of units) if (u.l100 != null) { km += u.km; l += u.legLitres; }
    return km > 0 ? (l / km) * 100 : null;
};

export async function getOverview(fromDay: string, toDay: string, currency: string): Promise<Overview> {
    const prev = previousRange(fromDay, toDay);
    const label = rangeLabel(fromDay, toDay);

    const [cur, old, depts, oldDepts, l100, prevL100, exceptions, unassigned, monthRows, tankRows, tankDefs, uploads] = await Promise.all([
        totals(fromDay, toDay),
        totals(prev.fromDay, prev.toDay),
        byDepartment(fromDay, toDay),
        byDepartment(prev.fromDay, prev.toDay),
        fleetL100(fromDay, toDay),
        fleetL100(prev.fromDay, prev.toDay),
        getExceptions(fromDay, toDay),
        getUnassigned(),
        q(`SELECT strftime('%Y-%m', t.transDate, 'localtime') AS ym, SUM(t.transQty) AS litres, SUM(t.transAmt) AS spend
           FROM FuelTransaction t WHERE t.transType = 'FIS' AND date(t.transDate, 'localtime') <= ?
           GROUP BY ym ORDER BY ym DESC LIMIT 12`, toDay),
        q(`SELECT t.storeNo AS store, t.transType AS type, SUM(t.transQty) AS litres
           FROM FuelTransaction t WHERE t.transType IN ('FIS','FRE') AND ${IN_RANGE} GROUP BY t.storeNo, t.transType`, fromDay, toDay),
        (prisma as any).tankDefinition.findMany() as Promise<{ tankNo: string; fuelType: string }[]>,
        (prisma as any).uploadedFile.findMany({ orderBy: { uploadedAt: "desc" }, take: 20 }) as Promise<{ uploadedAt: Date; rowCount: number }[]>,
    ]);

    const months = monthRows.reverse().map(r => {
        const [y, m] = String(r.ym).split("-").map(Number), d = new Date(y, m - 1, 1);
        return { key: r.ym as string, label: monthName(d), full: d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }), spend: Number(r.spend || 0), litres: Number(r.litres || 0) };
    });
    // The reference line is the average of the months shown. No allocation is loaded, and the chart says so.
    const avgSpend = months.length ? months.reduce((s, m) => s + m.spend, 0) / months.length : 0;
    const avgLitres = months.length ? months.reduce((s, m) => s + m.litres, 0) / months.length : 0;

    const departments = [...depts.entries()]
        .filter(([d]) => d !== "__unassigned").sort((a, b) => b[1] - a[1]).slice(0, 7)
        .map(([label, litres]) => ({ label: fmtDept(label), litres }));
    const unassignedLitres = depts.get("__unassigned") ?? 0;
    if (unassignedLitres > 0) departments.push({ label: "Not assigned to a cost centre", litres: unassignedLitres, unassigned: true } as any);

    const tankFuel = new Map(tankDefs.map(t => [t.tankNo, t.fuelType]));
    const tankMap = new Map<string, TankBook>();
    for (const r of tankRows) {
        const fuel = tankFuel.get(r.store);
        if (!fuel) continue;
        const t = tankMap.get(r.store) ?? { store: r.store, fuel, received: 0, issued: 0 };
        if (r.type === "FRE") t.received += Number(r.litres || 0); else t.issued += Number(r.litres || 0);
        tankMap.set(r.store, t);
    }
    const tanks = [...tankMap.values()].sort((a, b) => b.issued - a.issued).slice(0, 3);

    const summary = summariseExceptions(exceptions);
    const open = exceptions.filter(e => e.status === "Open");
    const byLevel = { hi: open.filter(e => e.sev === "hi").length, md: open.filter(e => e.sev === "md").length, lo: open.filter(e => e.sev === "lo").length };

    let lastUpload: Overview["lastUpload"] = null;
    if (uploads.length) {
        const day = toLocalYmd(uploads[0].uploadedAt);
        const same = uploads.filter(u => toLocalYmd(u.uploadedAt) === day);
        lastUpload = { at: new Date(uploads[0].uploadedAt).toISOString(), files: same.length, rows: same.reduce((s, u) => s + (u.rowCount || 0), 0) };
    }

    // A whole month far below the usual volume is almost certainly a missing upload, not a quiet month.
    const days = Math.round((parseDay(toDay).getTime() - parseDay(fromDay).getTime()) / DAY) + 1;
    const typical = avgLitres * (days / 30.4);
    const incomplete = months.length >= 4 && typical > 0 && cur.litres < typical * 0.45;

    /* ---- the briefing, by fixed rules ---- */
    const brief: BriefPart[] = [];
    const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null);
    const sp = pct(cur.spend, old.spend), lp = pct(cur.litres, old.litres);
    if (cur.litres <= 0) {
        brief.push("No fuel issues are recorded for this period.");
    } else {
        brief.push(`${label} closed at `, { b: fmtMoneyCompact(cur.spend, currency) }, ` on ${fmtLitres(cur.litres)}`);
        if (sp != null && Math.abs(sp) >= 0.5) {
            brief.push(", which is ", { b: `${Math.abs(sp).toFixed(1)}% ${sp > 0 ? "more" : "less"}` }, ` than ${prev.label}`);
            if (lp != null && sp > 1 && lp < sp - 1) brief.push(lp > 0.5 ? ` — litres rose only ${lp.toFixed(1)}%, so the rest is price` : " — litres did not rise, so the increase is price");
            brief.push(".");
        } else if (sp != null) brief.push(`, level with ${prev.label}.`);
        else brief.push(".");

        if (incomplete) {
            brief.push(" ", { b: "This period looks incomplete:" }, ` a typical period of this length carries about ${fmtLitres(typical)}, so check that every report was uploaded before reading the comparisons.`);
        } else {
            let mover: { d: string; delta: number } | null = null;
            for (const [d, l] of depts) {
                if (d === "__unassigned") continue;
                const delta = l - (oldDepts.get(d) ?? 0);
                if (!mover || Math.abs(delta) > Math.abs(mover.delta)) mover = { d, delta };
            }
            if (mover && old.litres > 0 && Math.abs(mover.delta) >= Math.max(500, cur.litres * 0.01)) {
                brief.push(" The largest movement is ", { b: fmtDept(mover.d) }, `, ${mover.delta > 0 ? "up" : "down"} ${fmtLitres(Math.abs(mover.delta))} on ${prev.label}.`);
            }
        }
        const top = open.find(e => e.sev === "hi");
        if (top) brief.push(" ", { unit: top.unit }, ` needs a look: ${top.what.charAt(0).toLowerCase()}${top.what.slice(1)}.`);
        if (unassignedLitres > 0) brief.push(` ${fmtLitres(unassignedLitres)} of this period is not assigned to a cost centre.`);
    }

    return {
        range: { fromDay, toDay, label, prevLabel: prev.label },
        spend: cur.spend, prevSpend: old.spend, litres: cur.litres, prevLitres: old.litres,
        petrol: cur.petrol, diesel: cur.diesel, l100, prevL100,
        months, avgSpend, avgLitres, departments,
        exceptions: { ...summary, byLevel }, attention: open.filter(e => e.risk != null).slice(0, 4).concat(open.filter(e => e.risk == null)).slice(0, 4),
        tanks, unassigned: { codes: unassigned.codes, litres: unassigned.litres }, lastUpload, incomplete, brief,
    };
}
