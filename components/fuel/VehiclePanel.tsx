"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { TankGauge } from "./TankGauge";
import { fmtLitres } from "@/lib/format";
import { useNavBadges } from "@/components/dashboard/NavBadges";
import type { VehicleDetail, FuelException, ReviewStatus } from "@/lib/fuel-insights";

const Ctx = createContext<{ open: (unit: string) => void }>({ open: () => {} });
export const useVehiclePanel = () => useContext(Ctx);

/** Record a review, with an Undo that puts it back. Shared by the panel and the worklist. */
export async function reviewException(e: Pick<FuelException, "key" | "unit">, status: ReviewStatus, after: () => void) {
    const send = (s: ReviewStatus) => fetch("/api/exceptions/review", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: e.key, status: s }),
    });
    const res = await send(status);
    if (!res.ok) { toast("Couldn't save that review", { description: "The server didn't accept it. Try again." }); return; }
    after();
    toast(`${e.unit} marked ${status.toLowerCase()}`, {
        action: { label: "Undo", onClick: async () => { await send("Open"); after(); } },
    });
}

function SevPill({ e }: { e: FuelException }) {
    if (e.status !== "Open") return <span className="sev ok">{e.status}</span>;
    return <span className={`sev ${e.sev}`}>{{ hi: "High", md: "Medium", lo: "Low" }[e.sev]}</span>;
}

/**
 * The vehicle panel: any unit number in the app opens it, so a total is never
 * more than two clicks from the vehicle behind it. It glides in over a dimmed
 * page (340ms on the spring) and leaves faster than it arrived (260ms).
 */
export function VehiclePanelProvider({ children }: { children: ReactNode }) {
    const [unit, setUnit] = useState<string | null>(null);
    const [shown, setShown] = useState(false);
    const [data, setData] = useState<VehicleDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const lastFocus = useRef<HTMLElement | null>(null);
    const closeBtn = useRef<HTMLButtonElement>(null);
    const router = useRouter();
    const { refresh: refreshBadges } = useNavBadges();

    const load = useCallback((u: string) => {
        setError(null);
        fetch(`/api/vehicles/${encodeURIComponent(u)}`)
            .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "The server didn't answer."); return r.json(); })
            .then(setData)
            .catch(err => setError(err.message));
    }, []);

    const open = useCallback((u: string) => {
        lastFocus.current = document.activeElement as HTMLElement | null;
        setData(null); setUnit(u); setShown(true); load(u);
    }, [load]);

    const close = useCallback(() => {
        setShown(false);
        const el = lastFocus.current;
        if (el && document.contains(el)) el.focus({ preventScroll: true });
    }, []);

    useEffect(() => {
        if (!shown) return;
        closeBtn.current?.focus({ preventScroll: true });
        const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") close(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [shown, close]);

    const act = (e: FuelException, status: ReviewStatus) =>
        reviewException(e, status, () => { if (unit) load(unit); refreshBadges(); router.refresh(); });

    const v = data;
    const last = v?.lastFill;
    const ref = v?.largestFill ?? 0;
    const over = !!last && ref > 0 && last.qty > ref * 1.5 && last.qty - ref >= 20;
    const bad = v?.l100 != null && v.classMedian != null && v.l100 / v.classMedian > 1.25;
    const mx = v?.l100 != null && v.classMedian != null ? Math.max(v.l100, v.classMedian) * 1.25 : 1;

    return (
        <Ctx.Provider value={{ open }}>
            {children}
            <div className={`scrim ${shown ? "on" : ""}`} onClick={close} aria-hidden="true" />
            <aside className={`drawer ${shown ? "on" : ""}`} role="dialog" aria-modal="true" aria-label={unit ? `Vehicle ${unit}` : "Vehicle detail"} inert={!shown}>
                <div className="flex items-center gap-3 border-b border-border px-[18px] py-4">
                    <span className="plate !rounded-[9px] !border-[1.5px] !px-3 !py-1.5 !text-[17px]">{unit}</span>
                    <div className="min-w-0">
                        <div className="font-semibold leading-snug">{v ? `${v.fuel} unit` : "Loading…"}</div>
                        <div className="sub truncate">{v ? [v.department ?? "No cost centre resolved", `${v.fillCount.toLocaleString()} fills on record`].join(" · ") : " "}</div>
                    </div>
                    <button ref={closeBtn} type="button" className="ibtn ml-auto" onClick={close} aria-label="Close vehicle panel"><X /></button>
                </div>

                <div className="flex flex-col gap-[18px] overflow-y-auto px-[18px] pb-5 pt-4">
                    {error && (
                        <div className="flex flex-col items-center gap-2 py-10 text-center text-[13.5px] text-muted-foreground">
                            <b className="text-[14.5px] text-foreground">Couldn&apos;t load {unit}</b>
                            <span>{error}</span>
                            <button type="button" className="tab" onClick={() => unit && load(unit)}>Try again</button>
                        </div>
                    )}
                    {!v && !error && (
                        <div className="flex flex-col gap-3" aria-label="Loading vehicle">
                            <div className="skel-line h-[105px]" /><div className="skel-line h-10" /><div className="skel-line h-24" />
                        </div>
                    )}
                    {v && last && (
                        <>
                            <div className="flex items-center gap-4">
                                <TankGauge className="h-[105px] w-[84px] flex-none" level={ref > 0 ? last.qty / ref : 0} tone={over ? "crit" : "brand"} over={over}
                                    label={`Last fill ${fmtLitres(last.qty)} against a largest previous fill of ${fmtLitres(ref)}`} />
                                <div className="flex flex-col gap-2">
                                    <div>
                                        <div className="sub">Last fill against its largest on record</div>
                                        <div className="num text-[22px] font-semibold tracking-[-0.02em]">
                                            {fmtLitres(last.qty)} <span className="text-[13px] font-normal text-muted-foreground">vs {fmtLitres(ref)}</span>
                                        </div>
                                    </div>
                                    {over
                                        ? <span className="sev hi self-start">{fmtLitres(last.qty - ref)} above its record</span>
                                        : <span className="delta flat self-start">{ref > 0 ? `${Math.round((last.qty / ref) * 100)}% of its largest fill` : "First fill on record"}</span>}
                                    <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1 text-[13px]">
                                        <dt className="text-muted-foreground">{v.periodLabel}</dt><dd className="mono m-0 font-medium">{fmtLitres(v.periodLitres)}</dd>
                                        <dt className="text-muted-foreground">Last fill</dt><dd className="mono m-0 font-medium">{last.label}</dd>
                                    </dl>
                                </div>
                            </div>
                            <p className="sub -mt-2">Tank size is not in the fleet register, so the unit&apos;s own largest fill stands in for it.</p>

                            <div className="dr-sec">
                                <h3>Consumption against its fuel class</h3>
                                {v.l100 != null && v.classMedian != null ? (
                                    <>
                                        <div className="cmp">
                                            <i className={bad ? "over" : ""} style={{ width: `${(v.l100 / mx) * 100}%` }} />
                                            <u style={{ left: `${(v.classMedian / mx) * 100}%` }} data-l={`median ${v.classMedian.toFixed(1)}`} />
                                        </div>
                                        <div className="text-[13.5px]">
                                            <b className="mono">{v.l100.toFixed(1)} L/100 km</b>{" "}
                                            <span className="text-muted-foreground">
                                                {v.l100 >= v.classMedian
                                                    ? `${Math.round((v.l100 / v.classMedian - 1) * 100)}% above`
                                                    : `${Math.round((1 - v.l100 / v.classMedian) * 100)}% below`} the {v.fuel.toLowerCase()} median
                                            </span>
                                        </div>
                                    </>
                                ) : (
                                    <p className="text-[13.5px] text-muted-foreground">Not enough odometer readings to work out consumption for this unit.</p>
                                )}
                            </div>

                            {v.exceptions.length > 0 && (
                                <div className="dr-sec">
                                    <h3>Exceptions · {v.periodLabel}</h3>
                                    {v.exceptions.map(e => (
                                        <div key={e.key} className="flex flex-col gap-2 rounded-[14px] border border-border p-3 text-[13.5px]">
                                            <div className="flex items-start justify-between gap-2.5">
                                                <span><b>{e.what}</b><br /><span className="sub">{e.whenLabel}{e.risk != null ? ` · ${fmtLitres(e.risk)} at risk` : ""}</span></span>
                                                <SevPill e={e} />
                                            </div>
                                            {e.status === "Open" && (
                                                <div className="flex flex-wrap gap-2">
                                                    <button type="button" className="tab !px-3 !py-1.5 !text-xs" aria-pressed="true" onClick={() => act(e, "Explained")}>Mark explained</button>
                                                    <button type="button" className="tab !px-3 !py-1.5 !text-xs" onClick={() => act(e, "Escalated")}>Escalate to manager</button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="dr-sec">
                                <h3>Recent fills</h3>
                                <div className="flex flex-col">
                                    {v.recent.map((f, i) => (
                                        <div key={i} className={`fill-row ${f.flagged ? "flag" : ""}`}>
                                            <span className="pt" />
                                            <div><span className="mono">{f.label}</span><div className="text-xs text-muted-foreground">{f.where}{f.flagged ? " · flagged" : ""}</div></div>
                                            <b className="mono">{fmtLitres(f.qty)}</b>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </aside>
        </Ctx.Provider>
    );
}

/** A unit number that opens the vehicle panel. Falls back to plain text for the no-unit placeholder. */
export function Plate({ unit, className }: { unit: string; className?: string }) {
    const { open } = useVehiclePanel();
    if (!unit || unit.toUpperCase() === "UNKNOWN") return <span className="text-muted-foreground italic">Unattributed</span>;
    return (
        <button type="button" className={`plate ${className ?? ""}`} onClick={(ev) => { ev.stopPropagation(); open(unit); }} aria-label={`Open vehicle ${unit}`}>
            {unit}
        </button>
    );
}

export { SevPill };
