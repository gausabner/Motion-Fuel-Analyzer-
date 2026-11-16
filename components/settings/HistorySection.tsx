"use client";

import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Section } from "./parts";
import { AUDIT_AREAS, type AuditEvent } from "@/lib/audit-areas";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** The change history: who changed what, newest first. Administrators only. */
export function HistorySection() {
    const [area, setArea] = useState<string>("all");
    const [events, setEvents] = useState<AuditEvent[] | null>(null);
    const [more, setMore] = useState(false);
    const [denied, setDenied] = useState(false);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async (a: string, before?: string) => {
        setLoading(true);
        try {
            const qs = new URLSearchParams();
            if (a !== "all") qs.set("area", a);
            if (before) qs.set("before", before);
            const res = await fetch(`/api/settings/history?${qs}`);
            if (res.status === 403) { setDenied(true); setEvents([]); return; }
            const d = await res.json();
            setEvents(prev => (before && prev ? [...prev, ...d.events] : d.events));
            setMore(!!d.more);
        } catch {
            toast.error("The change history could not be loaded. Reload the page to try again.");
            setEvents(prev => prev ?? []);
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(area); }, [area, load]);

    if (events === null) return <div className="skel-line h-64" aria-busy="true" aria-label="Loading the change history" />;

    return (
        <Section id="history" title="Change history"
            sub="Every change to settings, the registry, users, exception reviews and uploads, with who made it. Entries cannot be edited or removed.">
            {denied ? (
                <p className="mt-3 text-[13px] text-muted-foreground">The change history is visible to administrators only.</p>
            ) : (
                <>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        {["all", ...AUDIT_AREAS].map(a => (
                            <button key={a} type="button" className="tab !px-3 !py-1.5 !text-xs" aria-pressed={area === a} onClick={() => setArea(a)}>{a === "all" ? "Everything" : a}</button>
                        ))}
                        <a className="tab ml-auto !px-3 !py-1.5 !text-xs" href={`/api/settings/history?format=csv${area !== "all" ? `&area=${area}` : ""}`} download>
                            <Download className="h-3.5 w-3.5" /> CSV
                        </a>
                    </div>
                    {events.length === 0 ? (
                        <p className="mt-4 text-[13px] text-muted-foreground">
                            {area === "all" ? "Nothing has been recorded yet. Changes made from now on will appear here." : `No ${area.toLowerCase()} changes have been recorded yet.`}
                        </p>
                    ) : (
                        <ol className="mt-3">
                            {events.map(e => (
                                <li key={e.id} className="grid gap-x-4 gap-y-0.5 border-b border-grid py-2.5 last:border-0 sm:grid-cols-[150px_minmax(0,1fr)]">
                                    <time dateTime={e.at} className="mono whitespace-nowrap text-xs text-muted-foreground sm:pt-0.5">{when(e.at)}</time>
                                    <div className="min-w-0">
                                        <p className="break-words text-[13px] leading-normal">{e.summary}</p>
                                        <p className="text-xs text-muted-foreground">{e.actor} · {e.area}</p>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    )}
                    {more && <Button variant="outline" size="sm" className="mt-3" disabled={loading} onClick={() => load(area, events[events.length - 1]?.at)}>{loading ? "Loading" : "Show earlier changes"}</Button>}
                </>
            )}
        </Section>
    );
}
