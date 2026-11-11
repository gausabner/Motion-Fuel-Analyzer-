"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavBadges } from "@/components/dashboard/NavBadges";
import { MONTH_NAMES, financialYearStart, financialYearEnd, financialYearLabel } from "@/lib/financial-year";
import { Row, Section } from "./parts";
import type { Organisation } from "@/lib/organisation";

const KEYS: (keyof Organisation)[] = ["orgName", "orgLogo", "signatoryName", "signatoryTitle", "reportFooter", "financialYearStartMonth"];
/** Logos are stored inline with the settings, so the file is kept small. */
const MAX_LOGO_BYTES = 300 * 1024;
const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function OrganisationSection() {
    const router = useRouter();
    const { refresh } = useNavBadges();
    const file = useRef<HTMLInputElement>(null);
    const [saved, setSaved] = useState<Organisation | null>(null);
    const [draft, setDraft] = useState<Organisation | null>(null);
    const [saving, setSaving] = useState(false);
    const [logoError, setLogoError] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/settings/organisation").then(r => r.json()).then(d => { if (d.organisation) { setSaved(d.organisation); setDraft(d.organisation); } })
            .catch(() => toast.error("The organisation details could not be loaded. Reload the page to try again."));
    }, []);

    if (!saved || !draft) return <div className="skel h-80" aria-busy="true" aria-label="Loading organisation details" />;

    const set = <K extends keyof Organisation>(k: K, v: Organisation[K]) => setDraft({ ...draft, [k]: v });
    const dirty = KEYS.some(k => draft[k] !== saved[k]);

    const pickLogo = (f: File | undefined) => {
        setLogoError(null);
        if (!f) return;
        if (!/^image\/(png|jpeg)$/.test(f.type)) { setLogoError("Choose a PNG or JPEG image. Other formats cannot be printed on the PDF."); return; }
        if (f.size > MAX_LOGO_BYTES) { setLogoError(`That file is ${Math.round(f.size / 1024)} KB. Choose one under 300 KB.`); return; }
        const reader = new FileReader();
        reader.onload = () => set("orgLogo", String(reader.result));
        reader.onerror = () => setLogoError("That file could not be read. Try another.");
        reader.readAsDataURL(f);
    };

    const save = async () => {
        setSaving(true);
        try {
            const res = await fetch("/api/settings/organisation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(res.status === 403 ? "Only an administrator can change the organisation details." : data.error || "The details were not saved. Check them and try again.");
                return;
            }
            setSaved(data.organisation); setDraft(data.organisation);
            toast("Organisation details saved", { description: "PDF reports and the year-to-date presets now use them." });
            refresh(); router.refresh();
        } catch {
            toast.error("The details were not saved. Check your connection and try again.");
        } finally { setSaving(false); }
    };

    const fyStart = financialYearStart(new Date(), draft.financialYearStartMonth);
    const fyEnd = financialYearEnd(fyStart);

    return (
        <Section id="organisation" title="Organisation" sub="Who the reports are from. These details are printed on every PDF export; nothing here changes a figure.">
            <Row label="Organisation name" hint="Printed above the title of every PDF report." htmlFor="org-name">
                <Input id="org-name" maxLength={120} autoComplete="organization" value={draft.orgName} onChange={e => set("orgName", e.target.value)} />
            </Row>

            <Row label="Logo" hint="Printed at the top left of every PDF. PNG or JPEG, under 300 KB. A version made for a white background prints best.">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="grid h-16 w-[132px] flex-none place-items-center rounded-[12px] border border-border bg-white p-2">
                        {draft.orgLogo
                            // eslint-disable-next-line @next/next/no-img-element -- an inline data URL; there is nothing for the image optimiser to fetch
                            ? <img src={draft.orgLogo} alt="Organisation logo as it will print" className="max-h-full max-w-full object-contain" />
                            : <span className="text-xs text-[#5B6B82]">No logo</span>}
                    </div>
                    <input ref={file} type="file" accept="image/png,image/jpeg" className="sr-only" aria-label="Choose a logo file" tabIndex={-1}
                        onChange={e => { pickLogo(e.target.files?.[0]); e.target.value = ""; }} />
                    <Button type="button" variant="outline" onClick={() => file.current?.click()}>{draft.orgLogo ? "Replace" : "Choose file"}</Button>
                    {draft.orgLogo && <Button type="button" variant="ghost" onClick={() => { set("orgLogo", ""); setLogoError(null); }}>Remove</Button>}
                    {logoError && <p role="alert" className="basis-full text-xs text-crit">{logoError}</p>}
                </div>
            </Row>

            <Row label="Financial year starts in" hint={`"Year to date" and the financial-year comparison run from this month. The current year is ${financialYearLabel(fyStart)}: ${day(fyStart)} to ${day(fyEnd)}.`}>
                <Select value={String(draft.financialYearStartMonth)} onValueChange={v => set("financialYearStartMonth", Number(v))}>
                    <SelectTrigger aria-label="Financial year starts in"><SelectValue /></SelectTrigger>
                    <SelectContent>{MONTH_NAMES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
            </Row>

            <Row label="Signatory name" hint="The person who signs reports off. Leave both signatory fields empty to print no signature block." htmlFor="sig-name">
                <Input id="sig-name" maxLength={80} autoComplete="off" value={draft.signatoryName} onChange={e => set("signatoryName", e.target.value)} />
            </Row>
            <Row label="Signatory title" hint="Their position, printed under the name." htmlFor="sig-title">
                <Input id="sig-title" maxLength={80} autoComplete="off" value={draft.signatoryTitle} onChange={e => set("signatoryTitle", e.target.value)} />
            </Row>

            <Row label="Report footer" hint="One line at the bottom left of every PDF page, for an address, a reference or a confidentiality note." htmlFor="report-footer">
                <Input id="report-footer" maxLength={160} autoComplete="off" value={draft.reportFooter} onChange={e => set("reportFooter", e.target.value)} />
            </Row>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2.5">
                {dirty && <span className="mr-auto text-[13px] text-muted-foreground">You have changes that are not saved yet.</span>}
                <Button variant="outline" disabled={!dirty || saving} onClick={() => { setDraft(saved); setLogoError(null); }}>Discard</Button>
                <Button disabled={!dirty || saving} onClick={save}>{saving ? "Saving" : "Save organisation"}</Button>
            </div>
        </Section>
    );
}
