"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Coins, Droplet, Gauge, TriangleAlert, MessageSquareText, Fuel } from "lucide-react";
import { Seg } from "@/components/ui/Seg";
import { CapsuleColumns, ChartCard, RankedBars, RollingNumber, Sparkline, compact } from "./charts";
import { TankGauge } from "./TankGauge";
import { Plate, SevPill } from "./VehiclePanel";
import { fmtLitres, fmtMoney, fmtMoneyCompact } from "@/lib/format";
import type { Overview } from "@/lib/overview";

type Tone = "good" | "bad" | "flat" | "warn";

function delta(cur: number, prev: number, label: string, lowerIsBetter = true): { text: string; tone: Tone } {
    if (!(prev > 0)) return { text: "no earlier period", tone: "flat" };
    const p = ((cur - prev) / prev) * 100;
    if (Math.abs(p) < 0.5) return { text: `level with ${label}`, tone: "flat" };
    return { text: `${p > 0 ? "+" : "−"}${Math.abs(p).toFixed(1)}% vs ${label}`, tone: (p > 0) === lowerIsBetter ? "bad" : "good" };
}

export function DashboardView({ data, currency, periods, period }: {
    data: Overview;
    currency: string;
    periods: { key: string; label: string; href: string }[];
    period: string;
}) {
    const [metric, setMetric] = useState<"spend" | "litres">("spend");
    const [sel, setSel] = useState(Math.max(0, data.months.length - 1));
    const money = useCallback((v: number) => fmtMoneyCompact(v, currency), [currency]);
    const litres = useCallback((v: number) => Math.round(v).toLocaleString(), []);
    const one = useCallback((v: number) => v.toFixed(1), []);
    const whole = useCallback((v: number) => String(Math.round(v)), []);

    const { range } = data;
    const measured = data.tanks.some(t => t.level.status === "ok");
    const allMeasured = data.tanks.length > 0 && data.tanks.every(t => t.level.status === "ok");
    const spendD = delta(data.spend, data.prevSpend, range.prevLabel);
    const litresD = delta(data.litres, data.prevLitres, range.prevLabel);
    const totalFuel = data.petrol + data.diesel;
    const dPct = totalFuel > 0 ? Math.round((data.diesel / totalFuel) * 100) : 0;
    const ex = data.exceptions;
    const exTotal = Math.max(1, ex.byLevel.hi + ex.byLevel.md + ex.byLevel.lo);
    const l100D: { text: string; tone: Tone } = data.l100 != null && data.prevL100 != null
        ? Math.abs(data.l100 - data.prevL100) < 0.05
            ? { text: `same as ${range.prevLabel}`, tone: "flat" }
            : { text: `${data.l100 > data.prevL100 ? "+" : "−"}${Math.abs(data.l100 - data.prevL100).toFixed(1)} vs ${range.prevLabel}`, tone: data.l100 > data.prevL100 ? "bad" : "good" }
        : { text: "no earlier period", tone: "flat" };

    const series = data.months.map((m, i) => {
        const v = metric === "spend" ? m.spend : m.litres, pv = i ? (metric === "spend" ? data.months[i - 1].spend : data.months[i - 1].litres) : null;
        const avg = metric === "spend" ? data.avgSpend : data.avgLitres;
        const detail: string[] = [];
        if (pv && pv > 0) detail.push(`${v >= pv ? "+" : "−"}${Math.abs(((v - pv) / pv) * 100).toFixed(1)}% vs ${data.months[i - 1].label}`);
        if (avg > 0) detail.push(`${v >= avg ? "Above" : "Below"} the average by ${Math.abs(((v - avg) / avg) * 100).toFixed(1)}%`);
        return { label: m.label, full: m.full, value: v, detail };
    });
    const fmtCol = metric === "spend" ? (v: number) => compact(v) : (v: number) => compact(v);
    const avg = metric === "spend" ? data.avgSpend : data.avgLitres;

    return (
        <div className="flex flex-col gap-3.5">
            {/* Words before charts: what happened, in sentences built from the figures by fixed rules. */}
            <section className="monumental-card flex items-start gap-3.5 !px-5 !py-4" aria-label="Period briefing">
                <span className="disc soft !h-[34px] !w-[34px]"><MessageSquareText aria-hidden="true" /></span>
                <div className="min-w-0">
                    <p className="max-w-[86ch] text-base leading-normal">
                        {data.brief.map((p, i) => typeof p === "string" ? <span key={i}>{p}</span>
                            : "b" in p ? <b key={i} className="font-semibold">{p.b}</b>
                            : <Plate key={i} unit={p.unit} />)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Written from this period&apos;s figures by fixed rules.{" "}
                        <Link href="/dashboard/exceptions" className="lnk">See all {ex.open} open exceptions</Link>
                    </p>
                </div>
            </section>

            <div className="stagger-tiles grid grid-cols-1 gap-3 min-[431px]:grid-cols-2 xl:grid-cols-4">
                <Link href="/dashboard/fis" className="kpi" aria-label={`Fuel spend ${fmtMoney(data.spend, { currency })}, ${spendD.text}. Open fuel issues.`}>
                    <div className="kpi-h"><span>Fuel spend</span><span className="disc"><Coins aria-hidden="true" /></span></div>
                    <div className="kpi-v"><RollingNumber value={data.spend} format={money} /></div>
                    <Sparkline values={data.months.map(m => m.spend)} />
                    <div className="kpi-f"><span className={`delta ${spendD.tone}`}>{spendD.text}</span></div>
                </Link>
                <Link href="/dashboard/fis" className="kpi" aria-label={`Litres issued ${fmtLitres(data.litres)}, ${litresD.text}. Open fuel issues.`}>
                    <div className="kpi-h"><span>Litres issued</span><span className="disc"><Droplet aria-hidden="true" /></span></div>
                    <div className="kpi-v"><RollingNumber value={data.litres} format={litres} /><small>L</small></div>
                    <div>
                        <div className="splitbar" role="img" aria-label={`Diesel ${dPct}%, petrol ${100 - dPct}%`}>
                            <i style={{ width: `${dPct}%`, background: "var(--brand)" }} /><i style={{ width: `${100 - dPct}%`, background: "var(--sky)" }} />
                        </div>
                        <div className="legend mt-1.5 !text-[11px]">
                            <span><i className="sw" style={{ background: "var(--brand)" }} />Diesel {dPct}%</span>
                            <span><i className="sw" style={{ background: "var(--sky)" }} />Petrol {100 - dPct}%</span>
                        </div>
                    </div>
                    <div className="kpi-f"><span className="delta flat">{litresD.text}</span></div>
                </Link>
                <Link href="/dashboard/fleet" className="kpi" aria-label={`Fleet consumption ${data.l100 != null ? data.l100.toFixed(1) + " litres per 100 km" : "not measurable"}. Open fleet.`}>
                    <div className="kpi-h"><span>Fleet consumption</span><span className="disc"><Gauge aria-hidden="true" /></span></div>
                    <div className="kpi-v">{data.l100 != null ? <><RollingNumber value={data.l100} format={one} /><small>L/100 km</small></> : <span className="text-muted-foreground">—</span>}</div>
                    <p className="ctx min-h-[30px]">From odometer readings on consecutive fills; units without readings are left out.</p>
                    <div className="kpi-f"><span className={`delta ${l100D.tone}`}>{l100D.text}</span></div>
                </Link>
                <Link href="/dashboard/exceptions" className="kpi" aria-label={`${ex.open} open exceptions, ${ex.high} high. Open the worklist.`}>
                    <div className="kpi-h"><span>Open exceptions</span><span className="disc"><TriangleAlert aria-hidden="true" /></span></div>
                    <div className="kpi-v"><RollingNumber value={ex.open} format={whole} /><small>{ex.high} high</small></div>
                    <div>
                        <div className="splitbar" role="img" aria-label={`${ex.byLevel.hi} high, ${ex.byLevel.md} medium, ${ex.byLevel.lo} low`}>
                            {ex.open > 0 ? <>
                                <i style={{ width: `${(ex.byLevel.hi / exTotal) * 100}%`, background: "var(--crit)" }} />
                                <i style={{ width: `${(ex.byLevel.md / exTotal) * 100}%`, background: "var(--warn)" }} />
                                <i style={{ width: `${(ex.byLevel.lo / exTotal) * 100}%`, background: "var(--bar)" }} />
                            </> : <i style={{ width: "100%", background: "var(--ok-soft)" }} />}
                        </div>
                        <div className="legend mt-1.5 !text-[11px]"><span>{ex.byLevel.hi} high</span><span>{ex.byLevel.md} medium</span><span>{ex.byLevel.lo} low</span></div>
                    </div>
                    <div className="kpi-f"><span className={`delta ${ex.high > 0 ? "warn" : "good"}`}>{fmtLitres(ex.litresAtRisk)} in question</span></div>
                </Link>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
                <ChartCard
                    title={metric === "spend" ? "Monthly fuel spend" : "Monthly litres issued"}
                    sub={`${metric === "spend" ? currency : "Litres"} · last ${data.months.length} months with data`}
                    right={<Seg light label="Metric" value={metric} onChange={k => setMetric(k as any)} items={[{ key: "spend", label: "Spend" }, { key: "litres", label: "Litres" }]} />}
                    table={{ head: ["Month", "Spend", "Litres"], rows: data.months.map(m => [m.full, fmtMoney(m.spend, { currency }), fmtLitres(m.litres)]) }}
                    legend={<>
                        <span><i className="sw" style={{ background: "var(--primary)" }} />Selected month</span>
                        <span><i className="sw" style={{ background: "var(--bar)" }} />Other months</span>
                        <span><i className="sw dash" />Average of these months, {compact(avg)}</span>
                        <span><i className="sw dia" />Above average</span>
                    </>}>
                    {series.length ? (
                        <CapsuleColumns data={series} selected={sel} onSelect={setSel} format={fmtCol} unit={metric === "spend" ? currency : "L"} reference={avg}
                            ariaLabel={`Monthly ${metric === "spend" ? "fuel spend" : "litres issued"} against the average of the months shown.`} />
                    ) : <Empty title="No months to chart yet" body="Upload a fuel issues report to start the monthly record." />}
                </ChartCard>

                <ChartCard title="Litres by department" sub={range.label}
                    table={{ head: ["Department", "Litres"], rows: data.departments.map(d => [d.label, fmtLitres(d.litres)]) }}>
                    {data.departments.length ? (
                        <RankedBars ariaLabel={`Litres by department for ${range.label}.`}
                            rows={data.departments.map(d => ({ label: d.label, value: d.litres, display: `${compact(d.litres)} L`, unassigned: (d as any).unassigned }))} />
                    ) : <Empty title="No fills in this period" body="Nothing was issued in this range." />}
                </ChartCard>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
                <section className="monumental-card flex min-w-0 flex-col gap-3">
                    <div className="card-h"><h2>Bulk tanks</h2><span className="sub">{measured ? `Levels from dip readings, to the end of ${range.label}` : `Book position · receipts less issues, ${range.label}`}</span></div>
                    {data.tanks.some(t => t.received > 0 || t.level.status === "ok") ? (
                        <>
                            <div className="grid gap-2.5 sm:grid-cols-3">
                                {data.tanks.map(t => {
                                    const lv = t.level;
                                    const petrol = /petrol/i.test(t.fuel);
                                    if (lv.status === "ok") {
                                        const pct = Math.round((lv.fill ?? 0) * 100);
                                        return (
                                            <div key={t.store} className="flex min-w-0 flex-col items-start gap-2 rounded-2xl bg-surface-2 p-3 max-lg:flex-row max-lg:items-center max-lg:gap-3.5">
                                                <TankGauge level={lv.fill ?? 0} tone={lv.belowReorder ? "warn" : petrol ? "sky" : "brand"}
                                                    label={`Tank ${t.store}: ${pct}% full, ${compact(lv.litres ?? 0)} litres`} />
                                                <div className="min-w-0">
                                                    <div className="text-xs leading-snug text-muted-foreground">{t.name ?? `Tank ${t.store}`} · {t.fuel}</div>
                                                    <div className="num text-[22px] font-semibold leading-tight tracking-[-0.02em]">{pct}%</div>
                                                    <div className="mono text-[11.5px] text-muted-foreground">{compact(lv.litres ?? 0)} of {compact(lv.capacityLitres ?? 0)} L</div>
                                                    <span className={`delta mt-1 !whitespace-normal ${lv.belowReorder ? "warn" : "flat"}`}>
                                                        {lv.belowReorder ? "at or below the reorder level" : lv.daysOfCover != null ? `about ${Math.round(lv.daysOfCover)} days at the recent rate` : "no recent issues"}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    }
                                    const left = t.received > 0 ? Math.max(0, (t.received - t.issued) / t.received) : 0;
                                    const net = t.received - t.issued;
                                    return (
                                        <div key={t.store} className="flex min-w-0 flex-col items-start gap-2 rounded-2xl bg-surface-2 p-3 max-lg:flex-row max-lg:items-center max-lg:gap-3.5">
                                            <TankGauge level={left} tone={t.received === 0 ? "warn" : petrol ? "sky" : "brand"}
                                                label={`Tank ${t.store}: ${Math.round(left * 100)}% of this period's receipts not yet issued`} />
                                            <div className="min-w-0">
                                                <div className="text-xs leading-snug text-muted-foreground">{t.name ?? `Tank ${t.store}`} · {t.fuel}</div>
                                                <div className="num text-[22px] font-semibold leading-tight tracking-[-0.02em]">{t.received > 0 ? `${Math.round(left * 100)}%` : "—"}</div>
                                                <div className="mono text-[11.5px] text-muted-foreground">{compact(t.received)} in · {compact(t.issued)} out</div>
                                                <span className={`delta mt-1 !whitespace-normal ${lv.status === "short" || lv.status === "over" || net < 0 ? "warn" : "flat"}`}>
                                                    {lv.status === "short" ? `level cannot be stated: ${compact(lv.gapLitres ?? 0)} L of receipts missing since the dip`
                                                        : lv.status === "over" ? "level cannot be stated: the sum is above capacity"
                                                            : t.received === 0 ? "no receipt recorded" : net < 0 ? `drew ${compact(-net)} L of earlier stock` : `${compact(net)} L added to stock`}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {measured && allMeasured
                                    ? "Each level is the latest dip reading plus receipts less issues since."
                                    : measured
                                        ? "Tanks with a dip reading show a real level. The others show the share of this period's receipts not yet issued, which is a book figure."
                                        : "The level is the share of this period's receipts not yet issued, a book figure, not the litres physically in the tank."}{" "}
                                {!allMeasured && <Link href="/dashboard/settings#tanks" className="lnk">Set capacities and record a dip</Link>}
                            </p>
                        </>
                    ) : (
                        <Empty icon title="No tank receipts in this period"
                            body="A level needs a capacity and a dip reading; a book position needs the tank receipts for the same dates as the issues."
                            action={<Link href="/dashboard/settings#tanks" className="tab" aria-current="page">Set up tanks</Link>} />
                    )}
                </section>

                <section className="monumental-card flex min-w-0 flex-col gap-3">
                    <div className="card-h">
                        <h2>Needs attention</h2><span className="sub">Top by litres in question</span>
                        <div className="r"><Link href="/dashboard/exceptions" className="tab !px-3 !py-1.5">All {ex.open}</Link></div>
                    </div>
                    {data.attention.length ? (
                        <ul className="flex flex-col">
                            {data.attention.map(e => (
                                <li key={e.key} className="flex items-center gap-3 border-b border-grid py-[11px] text-[13px] last:border-b-0">
                                    <Plate unit={e.unit} />
                                    <span className="min-w-0 flex-1">{e.what}<span className="block text-xs text-muted-foreground">{[e.department, e.whenLabel].filter(Boolean).join(" · ")}</span></span>
                                    <SevPill e={e} />
                                </li>
                            ))}
                        </ul>
                    ) : <Empty title="Nothing open in this period" body="Every exception raised for these dates has been explained or escalated." />}
                </section>
            </div>
        </div>
    );
}

export function Empty({ title, body, action, icon }: { title: string; body: string; action?: React.ReactNode; icon?: boolean }) {
    return (
        <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
            {icon && <span className="disc soft !h-11 !w-11"><Fuel aria-hidden="true" className="!h-5 !w-5" /></span>}
            <b className="text-[14.5px]">{title}</b>
            <p className="max-w-[46ch] text-[13.5px] text-muted-foreground">{body}</p>
            {action}
        </div>
    );
}
