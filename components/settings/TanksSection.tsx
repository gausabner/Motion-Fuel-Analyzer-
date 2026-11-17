"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Seg } from "@/components/ui/Seg";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Section } from "./parts";
import type { Tank, TankDip, TankLevel } from "@/lib/tanks";

type Moved = { rows: number; litres: number };
type Payload = { asOfDay: string; tanks: TankLevel[]; oilStores?: Tank[]; dips: TankDip[]; unregistered: { storeNo: string; issues: number; litres: number }[]; reclassified?: number; toOil?: Moved; fromOil?: Moved };
type Form = { tankNo: string; isNew: boolean; fuelType: string; name: string; capacity: string; reorder: string; focus?: "name" | "capacity" };

const litres = (n: number) => `${Math.round(n).toLocaleString("en-GB")}\u00A0L`;
const dayLabel = (ymd: string) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** What the register can say about a tank right now, in one line. */
function position(t: TankLevel): { text: string; tone: "ok" | "md" | "hi" | "lo" } {
    switch (t.status) {
        case "no-capacity": return { text: t.stock ? "Add a capacity to draw a level" : "Add a capacity to show a level", tone: "lo" };
        case "no-dip": return { text: "Record a dip, or upload the stores report (HR440), to show a level", tone: "lo" };
        case "short": return { text: `Cannot be stated: issues since the ${t.basis?.kind === "stores-report" ? "stores-report stock" : "dip"} exceed stock and receipts by ${litres(t.gapLitres ?? 0)}`, tone: "hi" };
        case "over": return { text: `Cannot be stated: the sum is ${litres(t.gapLitres ?? 0)} above capacity`, tone: "hi" };
        default: return {
            text: `${litres(t.litres ?? 0)}, ${Math.round((t.fill ?? 0) * 100)}% full${t.basis?.kind === "stores-report" ? " by the stores report" : ""}${t.daysOfCover != null ? `, about ${Math.round(t.daysOfCover)} days at the recent rate` : ""}`,
            tone: t.belowReorder ? "md" : "ok",
        };
    }
}

export function TanksSection() {
    const router = useRouter();
    const [data, setData] = useState<Payload | null>(null);
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState<Form | null>(null);
    const [dipFor, setDipFor] = useState<TankLevel | null>(null);
    const [dip, setDip] = useState({ day: today(), litres: "" });

    useEffect(() => {
        fetch("/api/settings/tanks").then(r => r.json()).then(d => { if (d.tanks) setData(d); })
            .catch(() => toast.error("The tank register could not be loaded. Reload the page to try again."));
    }, []);

    if (!data) return <div className="skel-line h-72" aria-busy="true" aria-label="Loading the tank register" />;

    const send = async (method: "POST" | "DELETE", url: string, body: unknown): Promise<Payload | null> => {
        setBusy(true);
        try {
            const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(res.status === 403 ? "Only a Super admin or System admin can change the tank register." : d.error || "That change was not saved. Try again.");
                return null;
            }
            setData(d); router.refresh();
            return d;
        } catch {
            toast.error("That change was not saved. Check your connection and try again.");
            return null;
        } finally { setBusy(false); }
    };

    const edit = (t: Tank, over: Partial<Form> = {}) => setForm({ tankNo: t.tankNo, isNew: false, fuelType: t.fuelType, name: t.name ?? "", capacity: t.capacityLitres ? String(t.capacityLitres) : "", reorder: t.reorderLitres != null ? String(t.reorderLitres) : "", ...over });
    const add = (storeNo = "") => setForm({ tankNo: storeNo, isNew: true, fuelType: "Diesel", name: "", capacity: "", reorder: "" });

    const cap = form?.capacity === "" ? null : Number(form?.capacity);
    const reo = form?.reorder === "" ? null : Number(form?.reorder);
    const formError = !form ? null
        : !form.tankNo.trim() ? "Enter the tank number as it appears on the fuel reports."
            : form.isNew && data.tanks.some(t => t.tankNo === form.tankNo.trim()) ? "That tank is already in the register."
                : cap != null && !(cap > 0) ? "Capacity must be more than zero."
                    : reo != null && !(reo >= 0) ? "The reorder level cannot be negative."
                        : cap != null && reo != null && reo >= cap ? "The reorder level must be below the capacity."
                            : null;

    const saveTank = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form || formError) return;
        const d = await send("POST", "/api/settings/tanks", { tankNo: form.tankNo.trim(), fuelType: form.fuelType, name: form.name.trim() || null, capacityLitres: cap, reorderLitres: reo });
        if (!d) return;
        const said = [
            d.toOil?.rows ? `${d.toOil.rows.toLocaleString("en-GB")} records (${litres(d.toOil.litres)}) are now kept out of fuel totals as oil.` : "",
            d.fromOil?.rows ? `${d.fromOil.rows.toLocaleString("en-GB")} records (${litres(d.fromOil.litres)}) are back in fuel totals as ${form.fuelType.toLowerCase()}.` : "",
            d.reclassified ? `${d.reclassified} ${d.reclassified === 1 ? "record" : "records"} from this tank had no fuel type and ${d.reclassified === 1 ? "is" : "are"} now counted as ${form.fuelType.toLowerCase()}.` : "",
        ].filter(Boolean).join(" ");
        toast(`${form.fuelType === "Oil" ? "Oil store" : "Tank"} ${form.tankNo.trim()} saved`, said ? { description: said } : undefined);
        setForm(null);
    };

    const dipNum = Number(dip.litres);
    const dipError = !dipFor ? null
        : dip.litres === "" || !Number.isFinite(dipNum) || dipNum < 0 ? "Enter the litres read from the tank."
            : dip.day > today() ? "A dip reading cannot be dated in the future."
                : dipFor.capacityLitres && dipNum > dipFor.capacityLitres ? `That is more than the tank holds (${litres(dipFor.capacityLitres)}).`
                    : null;
    const replacesDip = dipFor ? data.dips.find(d => d.tankNo === dipFor.tankNo && d.day === dip.day) : undefined;

    const saveDip = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!dipFor || dipError) return;
        const d = await send("POST", "/api/settings/tanks/dips", { tankNo: dipFor.tankNo, day: dip.day, litres: dipNum });
        if (!d) return;
        toast(`Dip of ${litres(dipNum)} recorded for tank ${dipFor.tankNo}`, { description: `Levels are counted from the end of ${dayLabel(dip.day)}.` });
        setDipFor(null); setDip({ day: today(), litres: "" });
    };

    const removeDip = async (d: TankDip) => {
        const ok = await send("DELETE", `/api/settings/tanks/dips?id=${encodeURIComponent(d.id)}`, null);
        if (!ok) return;
        toast(`Dip of ${dayLabel(d.day)} removed from tank ${d.tankNo}`, {
            duration: 5000,
            action: { label: "Undo", onClick: async () => { if (await send("POST", "/api/settings/tanks/dips", { tankNo: d.tankNo, day: d.day, litres: d.litres })) toast("Dip reading restored"); } },
        });
    };

    return (
        <Section id="tanks" title="Tanks and stock"
            sub="A level starts from the latest known stock: a dip reading, or the closing stock on the stores report (HR440) when that is more recent. From there it is receipts booked into the tank less issues drawn from it. Capacity and a reorder level set the gauge and the warning. Super admins and System admins can name and change tanks.">
            <div className="mt-3 flex flex-col">
                {data.tanks.map(t => {
                    const p = position(t);
                    const dips = data.dips.filter(d => d.tankNo === t.tankNo);
                    return (
                        <div key={t.tankNo} className="border-b border-grid py-4 last:border-0">
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                <div className="min-w-[200px] flex-1">
                                    <div className="flex flex-wrap items-baseline gap-x-2.5">
                                        <span className="mono text-sm font-medium">{t.tankNo}</span>
                                        {t.name
                                            ? <span className="text-sm font-medium">{t.name}</span>
                                            : <button type="button" className="lnk text-sm" disabled={busy} onClick={() => edit(t, { focus: "name" })}>Name this tank</button>}
                                        <span className="text-[13px] text-muted-foreground">{t.fuelType}</span>
                                    </div>
                                    <p className="mono mt-0.5 text-[12.5px] text-muted-foreground">
                                        {t.capacityLitres ? `Holds ${litres(t.capacityLitres)}` : "No capacity set"}
                                        {t.reorderLitres != null ? ` · reorder at ${litres(t.reorderLitres)}` : ""}
                                    </p>
                                    {t.stock && (
                                        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                                            Stores report: <span className="mono">{litres(t.stock.litres)}</span> on hand at the end of {dayLabel(t.stock.day)}
                                            {t.reportMax ? <> · maximum stock <span className="mono">{litres(t.reportMax)}</span></> : null}
                                            {!t.capacityLitres && t.reportMax ? <>{" "}<button type="button" className="lnk" disabled={busy}
                                                onClick={() => edit(t, { capacity: String(t.reportMax), focus: "capacity" })}>Use it as the capacity</button></> : null}
                                        </p>
                                    )}
                                </div>
                                <span className={`sev ${p.tone} !whitespace-normal`}>{p.text}</span>
                                <span className="flex gap-2">
                                    <Button size="sm" variant="outline" disabled={busy} onClick={() => edit(t)}>Edit</Button>
                                    <Button size="sm" variant="outline" disabled={busy} onClick={() => { setDipFor(t); setDip({ day: today(), litres: "" }); }}>Record dip</Button>
                                </span>
                            </div>
                            {t.status === "short" && t.basis && (
                                <p className="mt-2 max-w-[78ch] text-[13px] text-muted-foreground">
                                    Since the {t.basis.kind === "dip" ? "dip" : "stores-report stock"} of {litres(t.basis.litres)} on {dayLabel(t.basis.day)}, {litres(t.issuedSince)} was issued and {litres(t.receivedSince)} received.
                                    {t.lastReceiptDay ? ` The last receipt on record for this tank is ${dayLabel(t.lastReceiptDay)}, so later deliveries have probably not been uploaded.` : " No receipt is on record for this tank at all."}
                                    {" "}Upload the stores report (HR440) for the months since, or record a more recent dip.
                                </p>
                            )}
                            {t.status === "over" && t.basis && (
                                <p className="mt-2 max-w-[78ch] text-[13px] text-muted-foreground">
                                    Since the {t.basis.kind === "dip" ? "dip" : "stores-report stock"} of {litres(t.basis.litres)} on {dayLabel(t.basis.day)}, {litres(t.receivedSince)} was received and {litres(t.issuedSince)} issued, which is more than the tank holds. Check the capacity, the {t.basis.kind === "dip" ? "dip" : "stores report"}, or for a receipt booked to the wrong tank.
                                </p>
                            )}
                            {dips.length > 0 && (
                                <ul className="mt-2 flex flex-wrap gap-2" aria-label={`Dip readings for tank ${t.tankNo}`}>
                                    {dips.slice(0, 4).map((d, i) => (
                                        <li key={d.id} className="mono flex items-center gap-1.5 rounded-full bg-surface-2 py-0.5 pl-3 pr-1 text-xs">
                                            {litres(d.litres)} on {dayLabel(d.day)}{i === 0 ? " (latest)" : ""}
                                            <button type="button" className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground [@media(hover:hover)]:hover:text-crit" disabled={busy}
                                                aria-label={`Remove the dip of ${dayLabel(d.day)} from tank ${t.tankNo}`} onClick={() => removeDip(d)}><Trash2 className="h-3.5 w-3.5" /></button>
                                        </li>
                                    ))}
                                    {dips.length > 4 && <li className="text-xs text-muted-foreground">and {dips.length - 4} earlier</li>}
                                </ul>
                            )}
                        </div>
                    );
                })}
            </div>

            {(data.oilStores?.length ?? 0) > 0 && (
                <div className="mt-2 border-t border-grid pt-4">
                    <p className="text-sm font-medium">Oil stores</p>
                    <p className="mt-0.5 max-w-[78ch] text-[13px] text-muted-foreground">Lubricants, not fuel: no level is drawn, and their records are kept out of every fuel total.</p>
                    <ul className="mt-2.5 flex flex-wrap gap-2">
                        {data.oilStores!.map(t => (
                            <li key={t.tankNo} className="flex items-center gap-2 rounded-full bg-surface-2 py-1 pl-3 pr-1 text-[13px]">
                                <span className="mono font-medium">{t.tankNo}</span>
                                {t.name ? <span>{t.name}</span> : <span className="text-muted-foreground">Oil</span>}
                                <Button size="sm" variant="ghost" className="h-7 rounded-full px-2.5" disabled={busy} onClick={() => edit(t)}
                                    aria-label={`Edit oil store ${t.tankNo}`}>{t.name ? "Edit" : "Name"}</Button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {data.unregistered.length > 0 && (
                <div className="mt-4 rounded-tile bg-warn-soft p-4">
                    <p className="text-sm font-medium">{data.unregistered.length === 1 ? "One store on the fuel reports is" : `${data.unregistered.length} stores on the fuel reports are`} not in the register</p>
                    <p className="mt-0.5 max-w-[78ch] text-[13px] text-muted-foreground">
                        Fuel from an unregistered store has no fuel type, so it shows as &ldquo;fuel type not recorded&rdquo; on Reports. Adding the store as a tank classifies those records.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {data.unregistered.map(u => (
                            <Button key={u.storeNo} size="sm" variant="outline" disabled={busy} onClick={() => add(u.storeNo)}>
                                <Plus className="mr-1 h-3.5 w-3.5" /> Add {u.storeNo}<span className="mono ml-1.5 text-muted-foreground">{litres(u.litres)}</span>
                            </Button>
                        ))}
                    </div>
                </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <span className="text-[13px] text-muted-foreground">Levels are worked out to {dayLabel(data.asOfDay)}, the latest day with fuel records.</span>
                <Button variant="outline" disabled={busy} onClick={() => add()}><Plus className="mr-1.5 h-4 w-4" /> Add a tank</Button>
            </div>

            <Dialog open={!!form} onOpenChange={o => { if (!o) setForm(null); }}>
                {form && (
                    <DialogContent className="max-w-[460px]">
                        <form onSubmit={saveTank}>
                            <DialogHeader>
                                <DialogTitle>{form.isNew ? "Add a tank" : `Tank ${form.tankNo}${form.name.trim() ? `, ${form.name.trim()}` : ""}`}</DialogTitle>
                                <DialogDescription>
                                    {form.isNew
                                        ? "Use the store number exactly as it appears on the fuel reports. Records from that store with no fuel type will take the fuel you choose here."
                                        : "Changing the fuel only affects records from this tank that have no fuel type recorded."}
                                </DialogDescription>
                            </DialogHeader>
                            <div className="mt-4 flex flex-col gap-3.5">
                                {form.isNew && (
                                    <div className="flex flex-col gap-1.5"><label htmlFor="tank-no" className="text-[13px] font-medium">Tank number</label>
                                        <Input id="tank-no" className="mono" maxLength={20} autoComplete="off" value={form.tankNo} onChange={e => setForm({ ...form, tankNo: e.target.value })} /></div>
                                )}
                                <div className="flex flex-col gap-1.5"><span className="text-[13px] font-medium">Fuel</span>
                                    <Seg light label="Fuel held in this tank" value={form.fuelType} onChange={k => setForm({ ...form, fuelType: k })} items={[{ key: "Diesel", label: "Diesel" }, { key: "Petrol", label: "Petrol" }, { key: "Oil", label: "Oil store" }]} />
                                    {form.fuelType === "Oil" && <span className="text-xs text-muted-foreground">Every record from an oil store is kept out of fuel totals, charts and exceptions. Choosing a fuel again brings them back.</span>}</div>
                                <div className="flex flex-col gap-1.5"><label htmlFor="tank-name" className="text-[13px] font-medium">Name</label>
                                    <Input id="tank-name" maxLength={60} autoComplete="off" autoFocus={form.focus === "name"} placeholder="For example Main depot diesel" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                                    <span className="text-xs text-muted-foreground">Shown with the tank number on the dashboard, receipts and fuel logs.</span></div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="flex flex-col gap-1.5"><label htmlFor="tank-cap" className="text-[13px] font-medium">Capacity, litres</label>
                                        <Input id="tank-cap" type="number" inputMode="decimal" min={0} className="mono" autoFocus={form.focus === "capacity"} value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} /></div>
                                    <div className="flex flex-col gap-1.5"><label htmlFor="tank-reorder" className="text-[13px] font-medium">Reorder at, litres</label>
                                        <Input id="tank-reorder" type="number" inputMode="decimal" min={0} className="mono" value={form.reorder} onChange={e => setForm({ ...form, reorder: e.target.value })} /></div>
                                </div>
                                {formError && (form.tankNo || form.capacity || form.reorder) && <p role="alert" className="text-xs text-crit">{formError}</p>}
                            </div>
                            <DialogFooter className="mt-5 gap-2">
                                <Button type="button" variant="outline" onClick={() => setForm(null)}>Cancel</Button>
                                <Button type="submit" disabled={busy || !!formError}>{form.isNew ? "Add tank" : "Save tank"}</Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                )}
            </Dialog>

            <Dialog open={!!dipFor} onOpenChange={o => { if (!o) setDipFor(null); }}>
                {dipFor && (
                    <DialogContent className="max-w-[440px]">
                        <form onSubmit={saveDip}>
                            <DialogHeader>
                                <DialogTitle>Record a dip for tank {dipFor.tankNo}</DialogTitle>
                                <DialogDescription>
                                    Enter what was physically in the tank at the end of that day. Issues and receipts from the next day onward are counted from it.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="mt-4 grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1.5"><label htmlFor="dip-day" className="text-[13px] font-medium">Date of reading</label>
                                    <Input id="dip-day" type="date" className="mono" max={today()} value={dip.day} onChange={e => setDip({ ...dip, day: e.target.value })} /></div>
                                <div className="flex flex-col gap-1.5"><label htmlFor="dip-litres" className="text-[13px] font-medium">Litres in the tank</label>
                                    <Input id="dip-litres" type="number" inputMode="decimal" min={0} autoFocus className="mono" value={dip.litres} onChange={e => setDip({ ...dip, litres: e.target.value })} /></div>
                            </div>
                            {dipError && dip.litres !== "" && <p role="alert" className="mt-2 text-xs text-crit">{dipError}</p>}
                            {replacesDip && !dipError && <p className="mt-2 text-xs text-muted-foreground">A dip of {litres(replacesDip.litres)} is already recorded for that day; saving replaces it.</p>}
                            <DialogFooter className="mt-5 gap-2">
                                <Button type="button" variant="outline" onClick={() => setDipFor(null)}>Cancel</Button>
                                <Button type="submit" disabled={busy || !!dipError}>{replacesDip ? "Replace reading" : "Record dip"}</Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                )}
            </Dialog>
        </Section>
    );
}
