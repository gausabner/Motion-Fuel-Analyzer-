"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Settings, Coins, Fuel, Save, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function SettingsPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState({
        currencyCode: "NAD",
        currencySymbol: "N$",
        petrolPrice: 20.00,
        dieselPrice: 22.00
    });

    useEffect(() => {
        fetch("/api/settings")
            .then(res => res.json())
            .then(data => {
                if (data.settings) setSettings(data.settings);
                setLoading(false);
            })
            .catch(() => {
                setLoading(false);
                toast.error("Failed to load settings");
            });
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settings)
            });
            if (res.ok) {
                toast.success("Settings updated successfully");
            } else {
                throw new Error();
            }
        } catch {
            toast.error("Failed to save settings");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return (
        <div className="h-96 flex items-center justify-center">
            <RefreshCcw className="h-8 w-8 animate-spin text-brand-primary" />
        </div>
    );

    return (
        <div className="max-w-4xl space-y-10">
            <div>
                <h2 className="text-4xl font-extrabold tracking-tight text-brand-dark flex items-center gap-3">
                    <Settings className="h-10 w-10 text-brand-primary" /> System Settings
                </h2>
                <p className="text-muted-foreground mt-2 font-medium">
                    Configure localization, currency, and standard fuel rates.
                </p>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                    <Card className="glass-panel border-0 shadow-xl rounded-[2rem] overflow-hidden">
                        <CardHeader className="bg-brand-primary/5 pb-8">
                            <div className="h-12 w-12 bg-brand-primary rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-brand-primary/20">
                                <Coins className="text-primary" />
                            </div>
                            <CardTitle className="text-2xl">Localization</CardTitle>
                            <CardDescription>Visual currency and code settings</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6 pt-8">
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Currency Symbol</label>
                                <Input
                                    value={settings.currencySymbol}
                                    onChange={e => setSettings({ ...settings, currencySymbol: e.target.value })}
                                    className="bg-background/80 border-input rounded-2xl h-12 text-lg font-bold"
                                    placeholder="e.g. N$"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Currency Code</label>
                                <Input
                                    value={settings.currencyCode}
                                    onChange={e => setSettings({ ...settings, currencyCode: e.target.value })}
                                    className="bg-background/80 border-input rounded-2xl h-12"
                                    placeholder="e.g. NAD"
                                />
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                    <Card className="glass-panel border-0 shadow-xl rounded-[2rem] overflow-hidden">
                        <CardHeader className="bg-[#B99A8B]/5 pb-8">
                            <div className="h-12 w-12 bg-[#B99A8B] rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-[#B99A8B]/20">
                                <Fuel className="text-white" />
                            </div>
                            <CardTitle className="text-2xl">Fuel Economics</CardTitle>
                            <CardDescription>Default rate per litre for calculations</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6 pt-8">
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Petrol Price ({settings.currencyCode})</label>
                                <Input
                                    type="number"
                                    value={settings.petrolPrice}
                                    onChange={e => setSettings({ ...settings, petrolPrice: parseFloat(e.target.value) })}
                                    className="bg-background/80 border-input rounded-2xl h-12 text-lg font-bold"
                                    step="0.01"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Diesel Price ({settings.currencyCode})</label>
                                <Input
                                    type="number"
                                    value={settings.dieselPrice}
                                    onChange={e => setSettings({ ...settings, dieselPrice: parseFloat(e.target.value) })}
                                    className="bg-background/80 border-input rounded-2xl h-12 text-lg font-bold"
                                    step="0.01"
                                />
                            </div>
                            <p className="text-xs text-muted-foreground italic p-4 bg-brand-light rounded-2xl">
                                These rates are used by the Cost Savings Calculator to estimate spend.
                            </p>
                        </CardContent>
                    </Card>
                </motion.div>

                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                    <Card className="glass-panel border-0 shadow-xl rounded-[2rem] overflow-hidden">
                        <CardHeader className="bg-muted/400/10 pb-8">
                            <div className="h-12 w-12 bg-zinc-800 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-zinc-800/20">
                                <Settings className="text-white" />
                            </div>
                            <CardTitle className="text-2xl">Appearance</CardTitle>
                            <CardDescription>Customize the interface theme</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6 pt-8">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Interface Theme</label>
                                <ThemeToggle />
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Switch between Light (Industrial) and Dark (Monumental) modes.
                            </p>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>

            <div className="flex justify-end pt-6">
                <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-brand-primary text-primary-foreground font-bold rounded-2xl px-10 h-14 shadow-lg shadow-brand-primary/20 hover:scale-105 transition-transform"
                >
                    {saving ? <RefreshCcw className="mr-2 animate-spin" /> : <Save className="mr-2 h-5 w-5" />}
                    Deploy System Changes
                </Button>
            </div>
        </div>
    );
}
