"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Seg } from "@/components/ui/Seg";
import { Section } from "./parts";
import type { ReferencePrice } from "@/lib/reference-prices";

const FUELS = ["Petrol", "Diesel"] as const;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dayLabel = (ymd: string) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); };

/**
 * Reference prices with a history. Each price applies from its date until the
 * next one for the same fuel, so an old month is judged by the price that was
 * in force then, not by today's.
 */
export function PricesSection({ currencySymbol, currencyCode }: { currencySymbol: string; currencyCode: string }) {
    const router = useRouter();
    const [prices, setPrices] = useState<ReferencePrice[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState({ fuel: "Petrol", price: "", effectiveFrom: today() });

    useEffect(() => {
        fetch("/api/settings/prices").then(r => r.json()).then(d => setPrices(d.prices ?? []))
            .catch(() => toast.error("The reference prices could not be loaded. Reload the page to try again."));
    }, []);

    if (!prices) return <div className="skel h-64" aria-busy="true" aria-label="Loading reference prices" />;

    const send = async (method: "POST" | "DELETE", url: string, body: unknown, ok: string, undo?: () => void) => {
        setBusy(true);
        try {
            const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(res.status === 403 ? "Only an administrator can change reference prices." : data.error || "That change was not saved. Try again.");
                return false;
            }
            setPrices(data.prices ?? []);
            toast(ok, undo ? { duration: 5000, action: { label: "Undo", onClick: undo } } : undefined);
            router.refresh();
            return true;
        } catch {
            toast.error("That change was not saved. Check your connection and try again.");
            return false;
        } finally { setBusy(false); }
    };

    const priceNum = Number(form.price);
    const valid = form.price !== "" && Number.isFinite(priceNum) && priceNum > 0 && /^\d{4}-\d{2}-\d{2}$/.test(form.effectiveFrom);
    const replaces = prices.find(p => p.fuel === form.fuel && p.effectiveFrom === form.effectiveFrom);

    const add = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!valid) return;
        const ok = await send("POST", "/api/settings/prices", { fuel: form.fuel, price: priceNum, effectiveFrom: form.effectiveFrom },
            `${form.fuel} set to ${currencySymbol}${priceNum.toFixed(2)} from ${dayLabel(form.effectiveFrom)}`);
        if (ok) setForm({ ...form, price: "" });
    };

    const remove = (p: ReferencePrice) => send("DELETE", `/api/settings/prices?id=${encodeURIComponent(p.id)}`, null,
        `${p.fuel} price from ${dayLabel(p.effectiveFrom)} removed`,
        () => send("POST", "/api/settings/prices", { fuel: p.fuel, price: p.price, effectiveFrom: p.effectiveFrom }, `${p.fuel} price from ${dayLabel(p.effectiveFrom)} restored`));

    const now = today();

    return (
        <Section id="reference-prices" title="Reference prices"
            sub={`The price per litre, in ${currencyCode || "the set currency"}, that issues are compared against. A price applies from its date until the next one for the same fuel.`}>
            <div className="mt-3 grid gap-3.5 md:grid-cols-2">
                {FUELS.map(fuel => {
                    const list = prices.filter(p => p.fuel === fuel);          // newest first
                    const current = list.find(p => p.effectiveFrom <= now);
                    return (
                        <div key={fuel} className="rounded-tile bg-surface-2 p-4">
                            <div className="flex items-baseline justify-between gap-3">
                                <h3 className="text-sm font-semibold">{fuel}</h3>
                                <span className="mono text-[13px]">{current ? `${currencySymbol}${current.price.toFixed(2)} now` : "No price in force"}</span>
                            </div>
                            {list.length === 0 ? (
                                <p className="mt-3 text-[13px] text-muted-foreground">No reference price yet. Add one below and {fuel.toLowerCase()} issues from that date on will be compared with it.</p>
                            ) : (
                                <ul className="mt-2">
                                    {list.map((p, i) => {
                                        const next = list[i - 1];                 // the later entry that ends this one
                                        const state = p.effectiveFrom > now ? "Starts later" : p === current ? "In force" : null;
                                        return (
                                            <li key={p.id} className="flex items-center gap-3 border-b border-border py-2 last:border-0">
                                                <span className="mono w-[76px] text-[13px]">{currencySymbol}{p.price.toFixed(2)}</span>
                                                <span className="min-w-0 flex-1 text-[13px] text-muted-foreground">
                                                    From {dayLabel(p.effectiveFrom)}{next ? ` until ${dayLabel(next.effectiveFrom)}` : ""}
                                                </span>
                                                {state && <span className={`sev ${state === "In force" ? "ok" : "lo"}`}>{state}</span>}
                                                <button type="button" className="ibtn !h-8 !w-8" disabled={busy} title="Remove this price" aria-label={`Remove the ${fuel.toLowerCase()} price from ${dayLabel(p.effectiveFrom)}`} onClick={() => remove(p)}><Trash2 /></button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    );
                })}
            </div>

            <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4">
                <div className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-medium">Fuel</span>
                    <Seg light label="Fuel for the new price" value={form.fuel} onChange={k => setForm({ ...form, fuel: k })} items={FUELS.map(f => ({ key: f, label: f }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="ref-price" className="text-[13px] font-medium">Price per litre</label>
                    <Input id="ref-price" type="number" inputMode="decimal" min={0} step="0.01" className="mono h-9 w-[130px]" placeholder="0.00"
                        value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="ref-from" className="text-[13px] font-medium">Applies from</label>
                    <Input id="ref-from" type="date" className="mono h-9 w-[170px]" value={form.effectiveFrom} onChange={e => setForm({ ...form, effectiveFrom: e.target.value })} />
                </div>
                <Button type="submit" disabled={!valid || busy}>{replaces ? "Replace price" : "Add price"}</Button>
                {replaces && (
                    <p className="basis-full text-xs text-muted-foreground">
                        {form.fuel} already has {currencySymbol}{replaces.price.toFixed(2)} from {dayLabel(replaces.effectiveFrom)}; saving replaces it.
                    </p>
                )}
            </form>
        </Section>
    );
}
