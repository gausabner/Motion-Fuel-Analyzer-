"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, BarChart3, Truck, ShieldCheck, Flame, Container } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { PublicHeader } from "@/components/PublicHeader";

function FeatureVisualAnalytics() {
    const reduceMotion = useReducedMotion();
    return (
        <div className="relative aspect-video bg-card border border-border rounded-2xl overflow-hidden p-8">
            <div className="absolute top-6 left-8 right-8 flex justify-between text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                <span>Consumption trend</span><span>May 2026</span>
            </div>
            <svg viewBox="0 0 400 160" className="absolute inset-x-8 bottom-6 top-14 w-auto h-auto">
                <line x1="0" y1="40" x2="400" y2="40" stroke="#F1F5F9" /><line x1="0" y1="80" x2="400" y2="80" stroke="#F1F5F9" /><line x1="0" y1="120" x2="400" y2="120" stroke="#F1F5F9" />
                <defs>
                    <linearGradient id="aboutDiesel" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1D4ED8" stopOpacity="0.3" /><stop offset="100%" stopColor="#1D4ED8" stopOpacity="0" />
                    </linearGradient>
                </defs>
                <motion.path
                    d="M0,120 L50,95 L100,108 L150,70 L200,88 L250,52 L300,72 L350,42 L400,58 L400,160 L0,160 Z"
                    fill="url(#aboutDiesel)"
                    initial={false}
                />
                <motion.path
                    d="M0,120 L50,95 L100,108 L150,70 L200,88 L250,52 L300,72 L350,42 L400,58"
                    fill="none" stroke="#1D4ED8" strokeWidth="3"
                    initial={reduceMotion ? false : { pathLength: 0 }}
                    whileInView={{ pathLength: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.4, ease: "easeOut" }}
                />
                <motion.path
                    d="M0,140 L50,128 L100,134 L150,118 L200,126 L250,110 L300,120 L350,104 L400,112"
                    fill="none" stroke="#60A5FA" strokeWidth="3"
                    initial={reduceMotion ? false : { pathLength: 0 }}
                    whileInView={{ pathLength: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.4, ease: "easeOut", delay: 0.3 }}
                />
            </svg>
        </div>
    );
}

function FeatureVisualFleet() {
    const reduceMotion = useReducedMotion();
    const bars = [
        { h: "62%", c: "#1D4ED8", d: 0 },
        { h: "84%", c: "#3B82F6", d: 0.15 },
        { h: "48%", c: "#60A5FA", d: 0.3 },
        { h: "72%", c: "#1D4ED8", d: 0.45 },
        { h: "38%", c: "#93C5FD", d: 0.6 },
        { h: "56%", c: "#3B82F6", d: 0.75 },
    ];
    return (
        <div className="relative aspect-video bg-[#0F172A] rounded-2xl overflow-hidden p-8">
            <div className="absolute top-6 left-8 text-[10px] font-semibold uppercase tracking-widest text-[#94A3B8]">Top fleet utilisation</div>
            <div className="absolute inset-x-10 bottom-8 top-16 flex gap-4 items-end justify-center">
                {bars.map((b, i) => (
                    <motion.div
                        key={i}
                        className="w-8 rounded-t-md"
                        style={{ background: b.c }}
                        initial={reduceMotion ? { height: b.h } : { height: "8%" }}
                        whileInView={{ height: b.h }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.9, ease: "easeOut", delay: b.d }}
                    />
                ))}
            </div>
        </div>
    );
}

function FeatureVisualSplit() {
    return (
        <div className="relative aspect-video bg-card border border-border rounded-2xl overflow-hidden p-8 flex flex-col justify-center gap-6">
            <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                <span className="flex items-center gap-1.5"><Flame className="w-3.5 h-3.5 text-primary" /> Issues (FIS)</span>
                <span className="flex items-center gap-1.5"><Container className="w-3.5 h-3.5" /> Receipts (FRE)</span>
            </div>
            <div className="space-y-4">
                <div>
                    <div className="flex justify-between text-xs font-bold mb-1.5"><span>Consumption</span><span className="tabular-nums">1,928,178 L</span></div>
                    <div className="h-3 rounded-full bg-muted overflow-hidden">
                        <motion.div className="h-full rounded-full bg-gradient-to-r from-[#60A5FA] to-[#1D4ED8]"
                            initial={{ width: "10%" }} whileInView={{ width: "78%" }} viewport={{ once: true }} transition={{ duration: 1, ease: "easeOut" }} />
                    </div>
                </div>
                <div>
                    <div className="flex justify-between text-xs font-bold mb-1.5"><span>Replenishment</span><span className="tabular-nums">658,876 L</span></div>
                    <div className="h-3 rounded-full bg-muted overflow-hidden">
                        <motion.div className="h-full rounded-full bg-[#64748B]"
                            initial={{ width: "6%" }} whileInView={{ width: "27%" }} viewport={{ once: true }} transition={{ duration: 1, ease: "easeOut", delay: 0.25 }} />
                    </div>
                </div>
            </div>
            <p className="text-[11px] text-muted-foreground">Issues and receipts are tracked separately — deliveries never inflate consumption.</p>
        </div>
    );
}

export default function AboutPage() {
    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-accent selection:text-accent-foreground overflow-x-hidden">
            <PublicHeader backLink />

            <main className="pt-32 pb-20">
                {/* Hero */}
                <section className="container mx-auto px-6 mb-28 relative">
                    <div className="max-w-4xl mx-auto text-center space-y-8 relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.02]">
                            Discover the power<br />of <span className="text-primary">motion</span>
                        </h1>
                        <p className="text-xl text-muted-foreground font-medium max-w-2xl mx-auto leading-relaxed">
                            A comprehensive system that transforms raw fuel data into actionable
                            strategic insight for municipal fleet operations.
                        </p>
                    </div>

                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-5xl pointer-events-none z-0">
                        <div className="absolute top-0 right-10 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
                        <div className="absolute bottom-0 left-10 w-96 h-96 bg-accent/60 rounded-full blur-3xl" />
                    </div>
                </section>

                {/* Section 1: Analytics */}
                <section className="container mx-auto px-6 mb-28">
                    <div className="grid md:grid-cols-2 gap-12 lg:gap-16 items-center">
                        <div className="order-2 md:order-1">
                            <FeatureVisualAnalytics />
                        </div>
                        <div className="order-1 md:order-2 space-y-5">
                            <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center">
                                <BarChart3 className="h-6 w-6 text-primary" />
                            </div>
                            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">Precise analytics</h2>
                            <p className="text-lg text-muted-foreground leading-relaxed">
                                Visualise consumption trends, cost velocity and department performance.
                                Split petrol and diesel views give granular control over every litre issued,
                                with one-click date presets and CSV or PDF export on every table.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Section 2: Fleet */}
                <section className="container mx-auto px-6 mb-28">
                    <div className="grid md:grid-cols-2 gap-12 lg:gap-16 items-center">
                        <div className="space-y-5">
                            <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center">
                                <Truck className="h-6 w-6 text-primary" />
                            </div>
                            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">Fleet intelligence</h2>
                            <p className="text-lg text-muted-foreground leading-relaxed">
                                Monitor the whole fleet's operational health in one view — nearly nine hundred
                                registered units, ranked by consumption, matched to their cost centres, and
                                flagged the moment usage runs above pattern.
                            </p>
                        </div>
                        <FeatureVisualFleet />
                    </div>
                </section>

                {/* Section 3: FIS/FRE integrity */}
                <section className="container mx-auto px-6 mb-28">
                    <div className="grid md:grid-cols-2 gap-12 lg:gap-16 items-center">
                        <div className="order-2 md:order-1">
                            <FeatureVisualSplit />
                        </div>
                        <div className="order-1 md:order-2 space-y-5">
                            <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center">
                                <ShieldCheck className="h-6 w-6 text-primary" />
                            </div>
                            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">Numbers you can defend</h2>
                            <p className="text-lg text-muted-foreground leading-relaxed">
                                Fuel issued to vehicles and fuel delivered into tanks are strictly separated,
                                duplicates are rejected on upload, and degraded vote numbers self-heal against
                                the cost-centre registry — so every report stands up to scrutiny.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Footer CTA */}
                <section className="container mx-auto px-6">
                    <div className="rounded-3xl bg-[#0F172A] text-white text-center py-16 px-8 relative overflow-hidden">
                        <div className="absolute -top-24 -right-16 w-80 h-80 bg-primary/25 rounded-full blur-3xl" />
                        <div className="relative z-10 space-y-6">
                            <img src="/logo-mark.svg" alt="" aria-hidden="true" className="w-12 h-12 mx-auto" />
                            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight">Ready to start?</h2>
                            <p className="text-[#94A3B8] max-w-xl mx-auto">Sign in to open the dashboard and see this month's consumption at a glance.</p>
                            <Link href="/auth/signin" className="inline-block">
                                <Button className="h-13 px-10 text-base group">
                                    Sign in now
                                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                                </Button>
                            </Link>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
