"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Monitor, Moon, PanelLeft, PanelTop, Sun } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Seg } from "@/components/ui/Seg";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { MotionLogo } from "@/components/brand/Logo";
import { NAV_LAYOUT_COOKIE } from "@/lib/nav";
import { Row, Section } from "@/components/settings/parts";
import { RulesSection } from "@/components/settings/RulesSection";
import { PricesSection } from "@/components/settings/PricesSection";

type SystemSettings = { currencyCode: string; currencySymbol: string; petrolPrice: number; dieselPrice: number };
const DEFAULTS: SystemSettings = { currencyCode: "NAD", currencySymbol: "N$", petrolPrice: 0, dieselPrice: 0 };

export default function SettingsPage() {
    const router = useRouter();
    const { theme, setTheme } = useTheme();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState<SystemSettings>(DEFAULTS);
    const [settings, setSettings] = useState<SystemSettings>(DEFAULTS);
    const [layout, setLayout] = useState<"menu" | "sidebar">("menu");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        setLayout(document.cookie.split("; ").some(c => c === `${NAV_LAYOUT_COOKIE}=sidebar`) ? "sidebar" : "menu");
        fetch("/api/settings")
            .then(res => res.json())
            .then(data => {
                if (data.settings) {
                    const s = { ...DEFAULTS, ...data.settings };
                    setSettings(s);
                    setSaved(s);
                }
            })
            .catch(() => toast.error("The settings could not be loaded. Reload the page to try again."))
            .finally(() => setLoading(false));
    }, []);

    const dirty = settings.currencyCode !== saved.currencyCode || settings.currencySymbol !== saved.currencySymbol;
    const invalid = !settings.currencyCode.trim() || !settings.currencySymbol.trim();

    const save = async () => {
        setSaving(true);
        try {
            const res = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currencyCode: settings.currencyCode, currencySymbol: settings.currencySymbol }),
            });
            if (!res.ok) {
                toast.error(res.status === 403 ? "Only an administrator can change these settings." : "The settings were not saved. Check the values and try again.");
                return;
            }
            setSaved(settings);
            toast("Currency saved", { description: "Every page, export and PDF now uses it." });
            router.refresh();
        } catch {
            toast.error("The settings were not saved. Check your connection and try again.");
        } finally {
            setSaving(false);
        }
    };

    const changeLayout = (next: string) => {
        const value = next === "sidebar" ? "sidebar" : "menu";
        setLayout(value);
        document.cookie = `${NAV_LAYOUT_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
    };

    if (loading) return (
        <div className="flex max-w-[860px] flex-col gap-3.5" aria-busy="true" aria-label="Loading settings">
            <div className="skel h-9 w-40" />
            <div className="skel h-56" />
            <div className="skel h-56" />
        </div>
    );


    return (
        <div className="flex max-w-[920px] flex-col gap-3.5">
            <PageHeader title="Settings" scope={["Currency, prices and rules apply to everyone", "Appearance applies to this browser"]} />

            <Section title="Currency" sub="How money is written on every page, export and PDF.">
                <Row label="Currency symbol" hint="Shown in front of every amount, for example N$ 1,250." htmlFor="currency-symbol">
                    <Input id="currency-symbol" value={settings.currencySymbol} maxLength={8} autoComplete="off"
                        onChange={e => setSettings({ ...settings, currencySymbol: e.target.value })} />
                </Row>
                <Row label="Currency code" hint="The three-letter code used in exports, for example NAD." htmlFor="currency-code">
                    <Input id="currency-code" value={settings.currencyCode} maxLength={8} autoComplete="off" className="mono uppercase"
                        onChange={e => setSettings({ ...settings, currencyCode: e.target.value.toUpperCase() })} />
                </Row>
                <div className="mt-4 flex flex-wrap items-center justify-end gap-2.5">
                    {dirty && <span className="mr-auto text-[13px] text-muted-foreground">You have changes that are not saved yet.</span>}
                    <Button variant="outline" disabled={!dirty || saving} onClick={() => setSettings(saved)}>Discard</Button>
                    <Button disabled={!dirty || invalid || saving} onClick={save}>{saving ? "Saving" : "Save currency"}</Button>
                </div>
            </Section>

            <PricesSection currencySymbol={saved.currencySymbol} currencyCode={saved.currencyCode} />

            <RulesSection />

            <Section title="Appearance" sub="Kept in this browser only. Nobody else's view changes.">
                <Row label="Theme" hint="Follow the device, or hold the interface in light or dark.">
                    {mounted && (
                        <Seg light label="Theme" value={theme ?? "system"} onChange={setTheme}
                            items={[
                                { key: "light", label: "Light", icon: <Sun className="h-3.5 w-3.5" /> },
                                { key: "dark", label: "Dark", icon: <Moon className="h-3.5 w-3.5" /> },
                                { key: "system", label: "Device", icon: <Monitor className="h-3.5 w-3.5" /> },
                            ]} />
                    )}
                </Row>
                <Row label="Navigation" hint="The menu bar keeps the page wide. The sidebar lists every page at once.">
                    {mounted && (
                        <Seg light label="Navigation layout" value={layout} onChange={changeLayout}
                            items={[
                                { key: "menu", label: "Menu bar", icon: <PanelTop className="h-3.5 w-3.5" /> },
                                { key: "sidebar", label: "Sidebar", icon: <PanelLeft className="h-3.5 w-3.5" /> },
                            ]} />
                    )}
                </Row>
            </Section>

            <Section title="About" sub="Motion Fuel Analyzer is built and maintained by Motion Dynamic Systems.">
                <div className="flex flex-wrap items-end justify-between gap-6 pt-3">
                    <MotionLogo className="h-auto w-[240px] max-w-full text-foreground" />
                    <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-[13px]">
                        <dt className="text-muted-foreground">Version</dt><dd className="mono">0.1.0</dd>
                    </dl>
                </div>
            </Section>
        </div>
    );
}
