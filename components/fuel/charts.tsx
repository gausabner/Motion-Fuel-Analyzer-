"use client";

/**
 * The chart system. Rules that hold for every chart here:
 *  - One ink mark per chart: only the value to look at gets the dark fill.
 *  - Flat fills; no gradients, glows or 3D on data.
 *  - Labels sit on the marks when there are 12 or fewer; tooltips only add detail.
 *  - Bars start at zero, always.
 *  - Every bar is focusable and Enter selects it.
 *  - Every chart has a table view, for screen readers and for copying figures.
 *  - Colour means fuel type or status, nothing else.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Table2, BarChart3 } from "lucide-react";

/* ---------- helpers ---------- */

/** A round axis maximum just above the data, and four even ticks under it. */
export function niceScale(maxValue: number): { max: number; ticks: number[] } {
    if (!(maxValue > 0)) return { max: 1, ticks: [0, 1] };
    const exp = Math.pow(10, Math.floor(Math.log10(maxValue)));
    const f = maxValue / exp;
    const step = (f <= 1 ? 0.25 : f <= 2 ? 0.5 : f <= 4 ? 1 : f <= 8 ? 2 : 2.5) * exp;
    const max = Math.ceil(maxValue / step) * step;
    const ticks: number[] = [];
    for (let t = 0; t <= max + step / 2; t += step) ticks.push(Number(t.toPrecision(10)));
    return { max, ticks };
}

export function compact(v: number): string {
    const a = Math.abs(v);
    if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 1 : 2)}m`;
    if (a >= 1e4) return `${(v / 1e3).toFixed(a >= 1e5 ? 0 : 1)}k`;
    if (a >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
    return String(Math.round(v));
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- ChartCard ---------- */

export type ChartTable = { head: string[]; rows: (string | number)[][] };

/** Card wrapper giving every chart a title row and a chart/table toggle. */
export function ChartCard({ title, sub, right, table, children, legend, className }: {
    title: ReactNode; sub?: ReactNode; right?: ReactNode; table?: ChartTable; children: ReactNode; legend?: ReactNode; className?: string;
}) {
    const [asTable, setAsTable] = useState(false);
    return (
        <section className={`monumental-card relative flex min-w-0 flex-col gap-3 ${className ?? ""}`}>
            <div className="card-h">
                <h2>{title}</h2>
                {sub && <span className="sub">{sub}</span>}
                <div className="r">
                    {right}
                    {table && (
                        <button type="button" className="ibtn !h-8 !w-8" onClick={() => setAsTable(v => !v)}
                            aria-pressed={asTable} aria-label={asTable ? "Show as chart" : "Show as table"} title={asTable ? "Show as chart" : "Show as table"}>
                            {asTable ? <BarChart3 /> : <Table2 />}
                        </button>
                    )}
                </div>
            </div>
            {asTable && table ? (
                <div className="overflow-x-auto">
                    <table className="w-full border-separate border-spacing-0 text-[13px]">
                        <thead><tr>{table.head.map((h, i) => (
                            <th key={i} className={`bg-surface-2 px-2.5 py-2 text-[11.5px] font-medium text-muted-foreground first:rounded-l-[10px] last:rounded-r-[10px] ${i ? "text-right" : "text-left"}`}>{h}</th>
                        ))}</tr></thead>
                        <tbody>{table.rows.map((r, i) => (
                            <tr key={i}>{r.map((c, j) => (
                                <td key={j} className={`border-b border-grid px-2.5 py-2 ${j ? "mono text-right" : ""}`}>{c}</td>
                            ))}</tr>
                        ))}</tbody>
                    </table>
                </div>
            ) : children}
            {!asTable && legend && <div className="legend">{legend}</div>}
        </section>
    );
}

/* ---------- RollingNumber ---------- */

/** A figure that rolls to its new value when the period changes (450ms, ease-out cubic). */
export function RollingNumber({ value, format }: { value: number; format: (v: number) => string }) {
    const ref = useRef<HTMLSpanElement>(null);
    const prev = useRef<number | null>(null);
    useEffect(() => {
        const node = ref.current;
        if (!node) return;
        const from = prev.current;
        prev.current = value;
        if (from == null || from === value || reducedMotion()) { node.textContent = format(value); return; }
        let raf = 0;
        const t0 = performance.now();
        const step = (t: number) => {
            const k = Math.min(1, (t - t0) / 450), e = 1 - Math.pow(1 - k, 3);
            node.textContent = format(from + (value - from) * e);
            if (k < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [value, format]);
    return <span ref={ref}>{format(value)}</span>;
}

/* ---------- Sparkline ---------- */

export function Sparkline({ values }: { values: number[] }) {
    if (values.length < 2) return <div className="h-[30px]" />;
    const w = 200, h = 30, mn = Math.min(...values), r = Math.max(...values) - mn || 1;
    const pts = values.map((x, i) => [i * (w - 6) / (values.length - 1) + 3, h - 4 - ((x - mn) / r) * (h - 10)]);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
    const q = pts[pts.length - 1];
    return (
        <svg className="block h-[30px] w-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
            <path d={`${d} L${q[0]} ${h} L3 ${h}Z`} fill="var(--brand)" opacity=".08" />
            <path d={d} fill="none" stroke="var(--brand)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            <circle cx={q[0]} cy={q[1]} r="3" fill="var(--primary)" />
        </svg>
    );
}

/* ---------- CapsuleColumns ---------- */

export type Column = { label: string; value: number; full?: string; detail?: string[] };

/**
 * Capsule columns with value chips and one ink bar. An optional dashed
 * reference line (an allocation, or the average when none is loaded) turns the
 * chart from "what happened" into "is that worse than usual"; columns above it
 * get a diamond under their label.
 */
export function CapsuleColumns({ data, selected, onSelect, format, unit, reference, ariaLabel, height = 270 }: {
    data: Column[];
    selected: number;
    onSelect?: (i: number) => void;
    format: (v: number) => string;
    unit: string;
    reference?: number;
    ariaLabel: string;
    height?: number;
}) {
    const wrap = useRef<HTMLDivElement>(null);
    const [tip, setTip] = useState<{ i: number; x: number; y: number } | null>(null);
    const [animKey, setAnimKey] = useState(0);
    const first = useRef(true);
    const sig = data.map(d => d.value).join(",");
    useEffect(() => { if (first.current) { first.current = false; return; } setAnimKey(k => k + 1); }, [sig]);

    const W = 640, H = height, L = 38, R = 8, T = 28, B = 28, ih = H - T - B, iw = W - L - R;
    const { max, ticks } = niceScale(Math.max(reference ?? 0, ...data.map(d => d.value)));
    const y = (v: number) => T + ih - (v / max) * ih;
    const step = iw / Math.max(1, data.length), bw = Math.min(40, step * 0.56);
    const showChips = data.length <= 12;

    const show = (i: number, ev: { currentTarget: Element }) => {
        const svg = (ev.currentTarget as SVGElement).ownerSVGElement!, box = svg.getBoundingClientRect(), host = wrap.current!.getBoundingClientRect();
        const sc = box.width / W, cx = L + step * i + step / 2;
        let x = box.left - host.left + cx * sc + (bw * sc) / 2 + 10;
        if (x + 176 > host.width) x = box.left - host.left + cx * sc - (bw * sc) / 2 - 176;
        setTip({ i, x: Math.max(4, x), y: box.top - host.top + y(data[i].value) * sc });
    };

    return (
        <div ref={wrap} className="relative">
            <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={ariaLabel} className="h-auto w-full overflow-visible">
                {ticks.map(t => (
                    <g key={t}>
                        <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="gridl" />
                        <text x={L - 8} y={y(t) + 4} textAnchor="end" className="ax">{compact(t)}</text>
                    </g>
                ))}
                <g key={animKey} className="grow">
                    {data.map((d, i) => {
                        const cx = L + step * i + step / 2, top = y(d.value), hot = i === selected;
                        const over = reference != null && d.value > reference;
                        const lbl = format(d.value), cw = lbl.length * 7 + 12;
                        return (
                            <g key={d.label + i} className="bar-g" tabIndex={0} role="button"
                                aria-label={`${d.full ?? d.label}: ${lbl} ${unit}${over ? ", above the reference line" : ""}`}
                                aria-pressed={hot}
                                onMouseEnter={ev => show(i, ev)} onFocus={ev => show(i, ev)} onMouseLeave={() => setTip(null)} onBlur={() => setTip(null)}
                                onClick={() => onSelect?.(i)}
                                onKeyDown={ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onSelect?.(i); } }}>
                                <rect x={cx - step / 2} y={T - 26} width={step} height={ih + 26} fill="transparent" />
                                <rect className={`b ${hot ? "bar-hot" : "bar-rest"}`} x={cx - bw / 2} y={top} width={bw} height={Math.max(2, T + ih - top)} rx={Math.min(bw / 2, Math.max(1, (T + ih - top) / 2))}
                                    style={{ animationDelay: `${i * 35}ms` }} />
                                {showChips && (
                                    <>
                                        <rect className={`fu chip-bg ${hot ? "hot" : ""}`} x={cx - cw / 2} y={top - 24} width={cw} height={19} rx={9.5} style={{ animationDelay: `${i * 35 + 250}ms` }} />
                                        <text className={`fu chip-t ${hot ? "hot" : ""}`} x={cx} y={top - 10.5} textAnchor="middle" style={{ animationDelay: `${i * 35 + 250}ms` }}>{lbl}</text>
                                    </>
                                )}
                                <text x={cx} y={H - 8} textAnchor="middle" className={hot ? "ax-f" : "ax"}>{d.label}</text>
                                {over && <rect x={cx - 3.5} y={H - B + 3} width={7} height={7} fill="var(--crit)" transform={`rotate(45 ${cx} ${H - B + 6.5})`} />}
                            </g>
                        );
                    })}
                </g>
                {reference != null && <line x1={L} x2={W - R} y1={y(reference)} y2={y(reference)} className="budget" />}
            </svg>
            <div className={`chart-tip ${tip ? "on" : ""}`} style={tip ? { left: tip.x, top: tip.y } : undefined} role="status">
                {tip && data[tip.i] && (
                    <>
                        <b>{data[tip.i].full ?? data[tip.i].label}</b>
                        <span className="mono">{format(data[tip.i].value)} {unit}</span>
                        {(data[tip.i].detail ?? []).map((l, k) => <span key={k} className="k block">{l}</span>)}
                    </>
                )}
            </div>
        </div>
    );
}

/* ---------- RankedBars ---------- */

export type RankedRow = { label: string; value: number; display: string; unassigned?: boolean; href?: string };

/** Ranked horizontal bars. The top row is ink; an unassigned row is hatched so it can't be read as a department. */
export function RankedBars({ rows, ariaLabel, wide = false }: { rows: RankedRow[]; ariaLabel: string; wide?: boolean }) {
    const id = useId().replace(/:/g, "");
    // The viewBox width sets how large the type renders: a card twice as wide needs twice the units, not twice the font.
    const w = wide ? 660 : 360, cut = wide ? 62 : 34, rh = 33, max = Math.max(1, ...rows.map(r => r.value)) * 1.05;
    return (
        <svg viewBox={`0 0 ${w} ${rows.length * rh + 2}`} role="img" aria-label={ariaLabel} className="h-auto w-full">
            <defs>
                <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="6" height="6" fill="var(--surface-2)" /><line x1="0" y1="0" x2="0" y2="6" stroke="var(--slate)" strokeWidth="2" />
                </pattern>
            </defs>
            {rows.map((r, i) => {
                const y = i * rh + 4;
                return (
                    <g key={r.label}>
                        <text x={0} y={y + 11} className="ax-f">{r.label.length > cut ? r.label.slice(0, cut - 1) + "…" : r.label}</text>
                        <text x={w} y={y + 11} textAnchor="end" className="ax-m" style={{ fill: "var(--foreground)" }}>{r.display}</text>
                        <rect x={0} y={y + 17} width={w} height={8} rx={4} fill="var(--surface-2)" />
                        <rect className="hb" x={0} y={y + 17} width={Math.max(3, (r.value / max) * w)} height={8} rx={4}
                            fill={r.unassigned ? `url(#${id})` : i === 0 ? "var(--primary)" : "var(--brand)"} fillOpacity={r.unassigned || i === 0 ? 1 : 0.5}
                            style={{ animationDelay: `${i * 40}ms` }} />
                    </g>
                );
            })}
        </svg>
    );
}

/* ---------- PairedBars ---------- */

export type Pair = { label: string; a: number; b: number };

/** Two periods side by side per category: pale for the earlier, ink for the later, with the change written above. */
export function PairedBars({ data, ariaLabel, flagAbovePct = 5 }: { data: Pair[]; ariaLabel: string; flagAbovePct?: number }) {
    const W = 760, H = 280, L = 40, T = 30, B = 30, ih = H - T - B, iw = W - L - 8;
    const { max, ticks } = niceScale(Math.max(1, ...data.flatMap(d => [d.a, d.b])));
    const y = (v: number) => T + ih - (v / max) * ih;
    const step = iw / Math.max(1, data.length), bw = Math.min(30, step * 0.3);
    return (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="h-auto w-full overflow-visible">
            {ticks.map(t => (
                <g key={t}><line x1={L} x2={W - 8} y1={y(t)} y2={y(t)} className="gridl" /><text x={L - 8} y={y(t) + 4} textAnchor="end" className="ax">{compact(t)}</text></g>
            ))}
            <g className="grow">
                {data.map((d, i) => {
                    const cx = L + step * i + step / 2;
                    const ch = d.a > 0 ? ((d.b - d.a) / d.a) * 100 : null, up = ch != null && ch > flagAbovePct;
                    const ty = Math.min(y(d.a), y(d.b)) - 10;
                    const lbl = ch == null ? "new" : `${ch >= 0 ? "+" : "−"}${Math.abs(ch).toFixed(1)}%`;
                    return (
                        <g key={d.label}>
                            <rect className="b bar-rest" x={cx - bw - 2} y={y(d.a)} width={bw} height={Math.max(2, T + ih - y(d.a))} rx={Math.min(bw / 2, Math.max(1, (T + ih - y(d.a)) / 2))} style={{ animationDelay: `${i * 40}ms` }} />
                            <rect className="b bar-hot" x={cx + 2} y={y(d.b)} width={bw} height={Math.max(2, T + ih - y(d.b))} rx={Math.min(bw / 2, Math.max(1, (T + ih - y(d.b)) / 2))} style={{ animationDelay: `${i * 40 + 80}ms` }} />
                            <text className="fu" x={cx + (up ? 6 : 0)} y={ty} textAnchor="middle" style={{ font: "500 11.5px var(--font-mono)", fill: up ? "var(--crit)" : "var(--muted-foreground)" }}>{lbl}</text>
                            {up && <rect x={cx - 27} y={ty - 8} width={7} height={7} fill="var(--crit)" transform={`rotate(45 ${cx - 23.5} ${ty - 4.5})`} />}
                            <text x={cx} y={H - 9} textAnchor="middle" className="ax-f" style={{ fontSize: 11.5 }}>{d.label.length > 16 ? d.label.slice(0, 15) + "…" : d.label}</text>
                        </g>
                    );
                })}
            </g>
        </svg>
    );
}

/* ---------- MirroredBars ---------- */

export type Mirror = { label: string; received: number; issued: number; gap: number; flag: boolean; chip: string };

/** Received above the line, issued below it, with the difference written on top. */
export function MirroredBars({ data, ariaLabel }: { data: Mirror[]; ariaLabel: string }) {
    const W = 760, H = 300, L = 40, T = 34, B = 26, mid = T + (H - T - B) / 2, half = (H - T - B) / 2 - 4;
    const max = Math.max(1, ...data.flatMap(d => [d.received, d.issued]));
    const step = (W - L - 8) / Math.max(1, data.length), bw = Math.min(30, step * 0.5);
    return (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="h-auto w-full overflow-visible">
            <text x={L - 8} y={T + 12} textAnchor="end" className="ax">in</text>
            <text x={L - 8} y={H - B - 4} textAnchor="end" className="ax">out</text>
            <g className="grow">
                {data.map((d, i) => {
                    const cx = L + step * i + step / 2, hu = (d.received / max) * half, hd = (d.issued / max) * half, cw = d.chip.length * 7 + 12;
                    return (
                        <g key={d.label} className="bar-g">
                            <rect className="b" x={cx - bw / 2} y={mid - 2 - hu} width={bw} height={Math.max(0, hu)} rx={Math.min(8, hu / 2)} fill="var(--slate)" fillOpacity={0.55} style={{ animationDelay: `${i * 35}ms` }} />
                            <rect className="b dn" x={cx - bw / 2} y={mid + 2} width={bw} height={Math.max(0, hd)} rx={Math.min(8, hd / 2)} fill="var(--brand)" fillOpacity={d.flag ? 1 : 0.6} style={{ animationDelay: `${i * 35}ms` }} />
                            <rect className={`fu chip-bg ${d.flag ? "hot" : ""}`} x={cx - cw / 2} y={mid - hu - 27} width={cw} height={19} rx={9.5} />
                            <text className={`fu chip-t ${d.flag ? "hot" : ""}`} x={cx} y={mid - hu - 13.5} textAnchor="middle">{d.chip}</text>
                            <text x={cx} y={H - 6} textAnchor="middle" className={d.flag ? "ax-f" : "ax"}>{d.label}</text>
                        </g>
                    );
                })}
            </g>
            <line x1={L} x2={W - 8} y1={mid} y2={mid} stroke="var(--border)" strokeWidth={1} />
        </svg>
    );
}

/* ---------- DotStrip ---------- */

export type StripClass = { name: string; median: number; values: { unit: string; v: number; outlier: boolean }[] };

/** One dot per vehicle, one row per class, a black tick at the class median; outliers are diamonds carrying their unit number. */
export function DotStrip({ classes, max, onOpen, ariaLabel }: { classes: StripClass[]; max: number; onOpen?: (unit: string) => void; ariaLabel: string }) {
    const L = 76, R = 16, W = 760, iw = W - L - R, rowH = 56, H = classes.length * rowH + 44;
    const x = (v: number) => L + (Math.min(v, max) / max) * iw;
    const { ticks } = niceScale(max);
    // Deterministic vertical jitter so dots don't stack into a line.
    const jit = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997; return (h / 997 - 0.5) * 22; };
    return (
        <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={ariaLabel} className="h-auto w-full">
            {ticks.filter(t => t <= max).map(t => (
                <g key={t}><line x1={x(t)} x2={x(t)} y1={6} y2={H - 36} className="gridl" /><text x={x(t)} y={H - 20} textAnchor="middle" className="ax">{t}</text></g>
            ))}
            <text x={W - R} y={H - 4} textAnchor="end" className="ax">L/100 km</text>
            {classes.map((c, i) => {
                const cy = 30 + i * rowH;
                return (
                    <g key={c.name}>
                        <text x={0} y={cy + 4} className="ax-f">{c.name}</text>
                        {c.values.filter(v => !v.outlier).map(v => (
                            <circle key={v.unit} cx={x(v.v)} cy={cy + jit(v.unit)} r={3.4} fill="var(--brand)" fillOpacity={0.42} />
                        ))}
                        <line x1={x(c.median)} x2={x(c.median)} y1={cy - 16} y2={cy + 16} stroke="var(--primary)" strokeWidth={2.5} strokeLinecap="round" />
                        {(() => {
                            // Outliers on the scale keep their true position; the ones beyond it are
                            // counted at the edge instead of being stacked on top of each other there.
                            const onScale = c.values.filter(v => v.outlier && v.v <= max);
                            const off = c.values.filter(v => v.outlier && v.v > max).length;
                            const named = onScale.slice(0, 5);
                            return (
                                <>
                                    {onScale.slice(5).map(v => (
                                        <rect key={v.unit} x={x(v.v) - 3} y={cy + jit(v.unit) - 3} width={6} height={6} fill="var(--crit)" fillOpacity={0.55} transform={`rotate(45 ${x(v.v)} ${cy + jit(v.unit)})`} />
                                    ))}
                                    {named.map((v, k) => {
                                        const ox = x(v.v), oy = cy + (k % 2 ? 9 : -9);
                                        return (
                                            <g key={v.unit} tabIndex={0} role="button" aria-label={`Open vehicle ${v.unit}, ${v.v.toFixed(1)} litres per 100 km`} style={{ cursor: "pointer" }}
                                                onClick={() => onOpen?.(v.unit)} onKeyDown={ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onOpen?.(v.unit); } }}>
                                                <rect x={ox - 14} y={oy - 14} width={28} height={28} fill="transparent" />
                                                <rect x={ox - 5.5} y={oy - 5.5} width={11} height={11} fill="var(--card)" stroke="var(--crit)" strokeWidth={2} transform={`rotate(45 ${ox} ${oy})`} />
                                                {k < 3 && <text x={ox} y={oy + (k % 2 ? 22 : -13)} textAnchor="middle" style={{ fill: "var(--crit)", font: "500 11px var(--font-mono)" }}>{v.unit}</text>}
                                            </g>
                                        );
                                    })}
                                    {off > 0 && <text x={0} y={cy + 19} className="ax">{off} off scale</text>}
                                </>
                            );
                        })()}
                    </g>
                );
            })}
        </svg>
    );
}

/* ---------- DailyLine ---------- */

export type DayPoint = { day: string; label: string; value: number; ghost?: number; weekend: boolean; note?: string };

/** Daily litres with weekends shaded, last period as a dotted ghost, and anomalies written on the chart itself. */
export function DailyLine({ data, ariaLabel, current, previous }: { data: DayPoint[]; ariaLabel: string; current: string; previous?: string }) {
    const W = 1000, H = 260, L = 44, R = 12, T = 40, B = 28, iw = W - L - R, ih = H - T - B;
    if (data.length < 2) return <p className="py-10 text-center text-[13.5px] text-muted-foreground">Not enough days in this period to draw a trend.</p>;
    const { max, ticks } = niceScale(Math.max(1, ...data.map(d => Math.max(d.value, d.ghost ?? 0))));
    const x = (i: number) => L + (i * iw) / (data.length - 1), y = (v: number) => T + ih - (v / max) * ih;
    const path = (f: (d: DayPoint) => number | undefined) => data.map((d, i) => f(d) == null ? "" : `${i && f(data[i - 1]) != null ? "L" : "M"}${x(i).toFixed(1)} ${y(f(d)!).toFixed(1)}`).join(" ");
    const cur = path(d => d.value), dw = iw / (data.length - 1);
    const every = Math.max(1, Math.round(data.length / 6));
    const notes = data.map((d, i) => ({ d, i })).filter(n => n.d.note).slice(0, 3);
    const hasGhost = data.some(d => d.ghost != null);
    return (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="h-auto w-full">
            {data.map((d, i) => d.weekend ? <rect key={d.day} x={Math.max(L, x(i) - dw / 2)} y={T} width={Math.min(dw, W - R - Math.max(L, x(i) - dw / 2))} height={ih} fill="var(--surface-2)" /> : null)}
            {ticks.map(t => (<g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="gridl" /><text x={L - 8} y={y(t) + 4} textAnchor="end" className="ax">{compact(t)}</text></g>))}
            {data.map((d, i) => i % every === 0 ? <text key={d.day} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : "middle"} className="ax">{d.label}</text> : null)}
            {hasGhost && <path d={path(d => d.ghost)} fill="none" stroke="var(--slate)" strokeWidth={1.5} strokeDasharray="2 4" />}
            <path d={`${cur} L${x(data.length - 1)} ${T + ih} L${L} ${T + ih}Z`} fill="var(--brand)" fillOpacity={0.14} />
            <path d={cur} fill="none" stroke="var(--brand)" strokeWidth={2} strokeLinejoin="round" />
            {notes.map(({ d, i }, k) => {
                const cx = x(i), cy = y(d.value), tw = d.note!.length * 6.3 + 16, flip = cx + tw > W - R;
                const ny = T - 34 + k * 0;
                return (
                    <g key={d.day}>
                        <line x1={cx} x2={cx} y1={cy - 8} y2={ny + 20} stroke="var(--crit)" strokeWidth={1} />
                        <rect x={cx - 6} y={cy - 6} width={12} height={12} fill="var(--crit)" stroke="var(--card)" strokeWidth={2} transform={`rotate(45 ${cx} ${cy})`} />
                        <rect x={flip ? cx - tw : cx} y={ny} width={tw} height={20} rx={10} fill="var(--crit-soft)" />
                        <text x={(flip ? cx - tw : cx) + tw / 2} y={ny + 14} textAnchor="middle" style={{ fill: "var(--crit)", fontSize: 11.5, fontWeight: 600 }}>{d.note}</text>
                    </g>
                );
            })}
            <circle cx={x(data.length - 1)} cy={y(data[data.length - 1].value)} r={4.5} fill="var(--primary)" stroke="var(--card)" strokeWidth={2} />
            <line x1={L} x2={L + 18} y1={H - 250} y2={H - 250} stroke="var(--brand)" strokeWidth={2} /><text x={L + 24} y={H - 246} className="ax">{current}</text>
            {hasGhost && previous && (<><line x1={L + 150} x2={L + 168} y1={H - 250} y2={H - 250} stroke="var(--slate)" strokeWidth={1.5} strokeDasharray="2 4" /><text x={L + 174} y={H - 246} className="ax">{previous}</text></>)}
        </svg>
    );
}
