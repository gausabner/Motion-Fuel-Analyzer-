"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Droplets, TrendingDown, Truck } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { PublicHeader } from "@/components/PublicHeader";

export default function HomePage() {
    const reduceMotion = useReducedMotion();

    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-accent selection:text-accent-foreground overflow-x-hidden">
            <PublicHeader />

            <main className="container mx-auto px-6 pt-28 pb-12 min-h-screen flex flex-col justify-center max-w-[1400px]">
                <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center">

                    {/* Left column: message */}
                    <div className="space-y-8 max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.02] tracking-tight">
                            Every litre,<br />
                            <span className="text-primary">accounted for.</span>
                        </h1>

                        <p className="text-lg md:text-xl text-muted-foreground font-medium leading-relaxed max-w-lg">
                            Motion Fuel Analyzer turns raw fuel transactions into clear consumption,
                            cost-centre and fleet intelligence for the whole municipality.
                        </p>

                        <div className="flex flex-wrap gap-8 md:gap-12 pt-6 border-t border-border">
                            <div>
                                <h3 className="text-3xl font-extrabold tabular-nums mb-1">890+</h3>
                                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Fleet units tracked</p>
                            </div>
                            <div>
                                <h3 className="text-3xl font-extrabold tabular-nums mb-1">10</h3>
                                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Departments</p>
                            </div>
                            <div>
                                <h3 className="text-3xl font-extrabold tabular-nums mb-1">1.9M+</h3>
                                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Litres analysed</p>
                            </div>
                        </div>

                        <div className="pt-2 flex items-center gap-4">
                            <Link href="/auth/signin">
                                <Button className="h-13 px-8 text-base group">
                                    Open the dashboard
                                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                                </Button>
                            </Link>
                            <Link href="/about">
                                <Button variant="outline" className="h-13 px-6 text-base">
                                    Discover more
                                </Button>
                            </Link>
                        </div>
                    </div>

                    {/* Right column: glass composition around the mark */}
                    <div className="relative w-full aspect-square max-w-[480px] mx-auto lg:ml-auto hidden md:block animate-in fade-in zoom-in-95 duration-700">
                        {/* soft blue glow */}
                        <div className="absolute inset-8 rounded-full bg-primary/10 blur-3xl" />

                        {/* main glass tile — echoes the favicon */}
                        <motion.div
                            className="absolute inset-[12%] rounded-[3rem] bg-gradient-to-br from-[#3B82F6] via-[#165DFC] to-[#0E3FBF] shadow-2xl shadow-primary/30 overflow-hidden"
                            animate={reduceMotion ? undefined : { y: [0, -8, 0] }}
                            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                        >
                            <div className="absolute inset-0 bg-gradient-to-b from-white/35 via-white/5 to-transparent" />
                            <div className="absolute inset-2 rounded-[2.6rem] border border-white/30" />
                            <img
                                src="/logo-mark.svg"
                                alt=""
                                aria-hidden="true"
                                className="absolute inset-0 m-auto w-1/2 h-1/2 brightness-0 invert"
                            />
                        </motion.div>

                        {/* floating glass stat cards */}
                        <motion.div
                            className="absolute -left-2 top-[16%] bg-card/80 backdrop-blur-md border border-border rounded-2xl px-5 py-4 shadow-lg"
                            animate={reduceMotion ? undefined : { y: [0, 6, 0] }}
                            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center">
                                    <Droplets className="w-4 h-4 text-primary" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">This month</p>
                                    <p className="text-lg font-extrabold tabular-nums">111,424 L</p>
                                </div>
                            </div>
                        </motion.div>

                        <motion.div
                            className="absolute right-0 bottom-[18%] bg-card/80 backdrop-blur-md border border-border rounded-2xl px-5 py-4 shadow-lg"
                            animate={reduceMotion ? undefined : { y: [0, -6, 0] }}
                            transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                                    <TrendingDown className="w-4 h-4 text-emerald-700" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Consumption</p>
                                    <p className="text-lg font-extrabold tabular-nums text-emerald-700">▼ 4% vs April</p>
                                </div>
                            </div>
                        </motion.div>

                        <motion.div
                            className="absolute left-[8%] bottom-[4%] bg-card/80 backdrop-blur-md border border-border rounded-2xl px-5 py-4 shadow-lg"
                            animate={reduceMotion ? undefined : { y: [0, 5, 0] }}
                            transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center">
                                    <Truck className="w-4 h-4 text-primary" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Active units</p>
                                    <p className="text-lg font-extrabold tabular-nums">570</p>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </main>
        </div>
    );
}
