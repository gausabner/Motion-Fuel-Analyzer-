"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plate, SevPill, reviewException, useVehiclePanel } from "./VehiclePanel";
import { useNavBadges } from "@/components/dashboard/NavBadges";
import { Empty } from "./DashboardView";
import { fmtLitres } from "@/lib/format";
import type { FuelException, Severity } from "@/lib/fuel-insights";

const PAGE = 25;

/**
 * The exceptions worklist. Each row reads like a colleague's note, opens the
 * vehicle behind it, and can be closed out in place — the row dims, the menu
 * count drops, and a toast offers Undo.
 */
export function ExceptionsTable({ rows }: { rows: FuelException[] }) {
    const [filter, setFilter] = useState<"all" | Severity>("all");
    const [showDone, setShowDone] = useState(false);
    const [limit, setLimit] = useState(PAGE);
    const router = useRouter();
    const { open } = useVehiclePanel();
    const { refresh } = useNavBadges();

    const openRows = useMemo(() => rows.filter(r => r.status === "Open"), [rows]);
    const count = (s: "all" | Severity) => openRows.filter(r => s === "all" || r.sev === s).length;
    const pool = showDone ? rows : openRows;
    const shown = pool.filter(r => filter === "all" || r.sev === filter);
    const done = rows.length - openRows.length;
    const act = (e: FuelException, status: "Explained" | "Escalated") => reviewException(e, status, () => { refresh(); router.refresh(); });

    return (
        <>
            <div className="flex flex-wrap items-center gap-2">
                {([["all", "All"], ["hi", "High"], ["md", "Medium"], ["lo", "Low"]] as const).map(([k, l]) => (
                    <button key={k} type="button" className="tab" aria-pressed={filter === k} onClick={() => { setFilter(k); setLimit(PAGE); }}>
                        {l}<span className="ct">{count(k)}</span>
                    </button>
                ))}
                {done > 0 && (
                    <button type="button" className="tab ml-auto" aria-pressed={showDone} onClick={() => setShowDone(v => !v)}>
                        Show reviewed<span className="ct">{done}</span>
                    </button>
                )}
            </div>

            <section className="monumental-card">
                {shown.length === 0 ? (
                    <Empty title={rows.length ? "Nothing open at this level" : "No exceptions in this period"}
                        body={rows.length ? "Every exception here has been explained or escalated." : "None of the rules fired on the fills recorded for these dates."} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-separate border-spacing-0 text-[13px]">
                            <thead>
                                <tr>
                                    {["Vehicle", "What happened", "Department", "When", "Status"].map(h => (
                                        <th key={h} className="whitespace-nowrap bg-surface-2 px-2.5 py-2 text-left text-[11.5px] font-medium text-muted-foreground first:rounded-l-[10px]">{h}</th>
                                    ))}
                                    <th className="whitespace-nowrap bg-surface-2 px-2.5 py-2 text-right text-[11.5px] font-medium text-muted-foreground">Litres in question</th>
                                    <th className="rounded-r-[10px] bg-surface-2 px-2.5 py-2"><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {shown.slice(0, limit).map(e => (
                                    <tr key={e.key} onClick={() => open(e.unit)}
                                        className={`cursor-pointer transition-[background-color,opacity] duration-200 [@media(hover:hover)]:hover:bg-surface-2 ${e.status === "Open" ? "" : "opacity-55"}`}>
                                        <td className="border-b border-grid px-2.5 py-[11px] align-middle"><Plate unit={e.unit} /></td>
                                        <td className="border-b border-grid px-2.5 py-[11px] align-middle">{e.what}</td>
                                        <td className="border-b border-grid px-2.5 py-[11px] align-middle text-xs text-muted-foreground">{e.department ?? "No cost centre"}</td>
                                        <td className="mono whitespace-nowrap border-b border-grid px-2.5 py-[11px] align-middle text-xs text-muted-foreground">{e.whenLabel}</td>
                                        <td className="border-b border-grid px-2.5 py-[11px] align-middle"><SevPill e={e} /></td>
                                        <td className="mono border-b border-grid px-2.5 py-[11px] text-right align-middle">{e.risk == null ? "—" : fmtLitres(e.risk)}</td>
                                        <td className="whitespace-nowrap border-b border-grid px-2.5 py-[11px] text-right align-middle">
                                            {e.status === "Open" && (
                                                <span className="inline-flex gap-1.5" onClick={ev => ev.stopPropagation()}>
                                                    <button type="button" className="tab !px-3 !py-1 !text-xs" onClick={() => act(e, "Explained")}>Explained</button>
                                                    <button type="button" className="tab !px-3 !py-1 !text-xs" onClick={() => act(e, "Escalated")}>Escalate</button>
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {shown.length > limit && (
                    <div className="flex items-center justify-between gap-3 pt-3 text-xs text-muted-foreground">
                        <span>Showing {limit} of {shown.length}</span>
                        <button type="button" className="tab" onClick={() => setLimit(l => l + PAGE)}>Show {Math.min(PAGE, shown.length - limit)} more</button>
                    </div>
                )}
            </section>
        </>
    );
}
