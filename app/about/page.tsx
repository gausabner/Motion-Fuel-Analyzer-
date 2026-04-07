"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, BarChart3, Truck, ShieldCheck } from "lucide-react";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { motion } from "framer-motion";

export default function AboutPage() {
    return (
        <div className="min-h-screen bg-white text-black font-sans selection:bg-yellow-300 selection:text-black overflow-x-hidden">
            {/* Minimal Header */}
            <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-zinc-100">
                <div className="container mx-auto px-6 h-20 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2 text-zinc-500 hover:text-black transition-colors group">
                        <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                        <span className="text-sm font-bold uppercase tracking-wider">Back</span>
                    </Link>
                    <span className="text-xl font-extrabold tracking-tighter uppercase">Motion Analyzers</span>
                    <Link href="/auth/signin">
                        <Button className="bg-[#FDE047] hover:bg-[#FACC15] text-black font-bold uppercase tracking-wider border-none rounded-none px-6 h-10">
                            Sign In
                        </Button>
                    </Link>
                </div>
            </header>

            <main className="pt-32 pb-20">
                {/* Hero */}
                <section className="container mx-auto px-6 mb-32 relative">
                    <ScrollReveal>
                        <div className="max-w-4xl mx-auto text-center space-y-8 relative z-10">
                            <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-none">
                                DISCOVER THE <br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FDE047] to-[#eab308]">POWER</span> OF MOTION
                            </h1>
                            <p className="text-xl text-zinc-600 font-medium max-w-2xl mx-auto leading-relaxed">
                                A comprehensive system designed to transform raw fuel data into actionable strategic insights.
                            </p>
                        </div>
                    </ScrollReveal>

                    {/* Hero Background Elements */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-5xl pointer-events-none z-0">
                        <motion.div
                            className="absolute top-0 right-10 w-64 h-64 bg-[#FDE047]/10 rounded-full blur-3xl"
                            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                        />
                        <motion.div
                            className="absolute bottom-0 left-10 w-96 h-96 bg-zinc-200/50 rounded-full blur-3xl"
                            animate={{ scale: [1, 1.1, 1], x: [0, 20, 0] }}
                            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                        />
                    </div>
                </section>

                {/* Section 1: Analytics */}
                <section className="container mx-auto px-6 mb-32">
                    <div className="grid md:grid-cols-2 gap-16 items-center">
                        <ScrollReveal delay={0.2} className="order-2 md:order-1">
                            <div className="relative aspect-video bg-zinc-100 rounded-none overflow-hidden group">
                                <div className="absolute inset-0 bg-zinc-900/5 group-hover:bg-transparent transition-colors duration-500"></div>
                                {/* Geometric Abstract for 'Analytics' */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <motion.div
                                        className="w-1/2 h-1/2 border-[20px] border-zinc-900 rounded-full"
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                                    ></motion.div>
                                    <motion.div
                                        className="absolute w-1/3 h-1/3 bg-[#FDE047] rotate-45"
                                        animate={{ rotate: -45, scale: [1, 0.8, 1] }}
                                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                    ></motion.div>
                                </div>
                            </div>
                        </ScrollReveal>
                        <ScrollReveal className="order-1 md:order-2 space-y-6">
                            <div className="w-12 h-12 bg-black flex items-center justify-center text-[#FDE047]">
                                <BarChart3 className="h-6 w-6" />
                            </div>
                            <h2 className="text-4xl font-black tracking-tight uppercase">Precise Analytics</h2>
                            <p className="text-lg text-zinc-600 leading-relaxed">
                                Visualize consumption trends, cost velocity, and department performance with our monumental dashboards.
                                Our split-view charts for Petrol and Diesel give you granular control over every liter tracked.
                            </p>
                        </ScrollReveal>
                    </div>
                </section>

                {/* Section 2: Fleet Tracking */}
                <section className="container mx-auto px-6 mb-32">
                    <div className="grid md:grid-cols-2 gap-16 items-center">
                        <ScrollReveal className="space-y-6">
                            <div className="w-12 h-12 bg-black flex items-center justify-center text-[#FDE047]">
                                <Truck className="h-6 w-6" />
                            </div>
                            <h2 className="text-4xl font-black tracking-tight uppercase">Fleet Matrix</h2>
                            <p className="text-lg text-zinc-600 leading-relaxed">
                                Monitor your entire fleet's operational health in one view.
                                Identify high-consumption vehicles, track efficiency mile-by-mile, and ensure your logistics never stops moving.
                            </p>
                        </ScrollReveal>
                        <ScrollReveal delay={0.2}>
                            <div className="relative aspect-video bg-zinc-900 rounded-none overflow-hidden">
                                {/* Geometric Abstract for 'Fleet' */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="flex gap-4 items-end h-32">
                                        <motion.div className="w-4 bg-[#FDE047]" animate={{ height: ["20%", "60%", "20%"] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}></motion.div>
                                        <motion.div className="w-4 bg-zinc-700" animate={{ height: ["40%", "80%", "40%"] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}></motion.div>
                                        <motion.div className="w-4 bg-zinc-500" animate={{ height: ["60%", "100%", "60%"] }} transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}></motion.div>
                                        <motion.div className="w-4 bg-[#FDE047]" animate={{ height: ["30%", "70%", "30%"] }} transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}></motion.div>
                                    </div>
                                </div>
                            </div>
                        </ScrollReveal>
                    </div>
                </section>

                {/* Section 3: Cost Control */}
                <section className="container mx-auto px-6 mb-32">
                    <div className="grid md:grid-cols-2 gap-16 items-center">
                        <ScrollReveal delay={0.2} className="order-2 md:order-1">
                            <div className="relative aspect-video bg-zinc-100 rounded-none overflow-hidden">
                                {/* Geometric Abstract for 'Security' */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <motion.div
                                        className="w-64 h-64 border-[4px] border-zinc-900 flex items-center justify-center"
                                        animate={{ rotate: 90 }}
                                        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                                    >
                                        <motion.div
                                            className="w-48 h-48 bg-black rounded-full"
                                            animate={{ scale: [0.8, 1, 0.8] }}
                                            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                        ></motion.div>
                                    </motion.div>
                                </div>
                            </div>
                        </ScrollReveal>
                        <ScrollReveal className="order-1 md:order-2 space-y-6">
                            <div className="w-12 h-12 bg-black flex items-center justify-center text-[#FDE047]">
                                <ShieldCheck className="h-6 w-6" />
                            </div>
                            <h2 className="text-4xl font-black tracking-tight uppercase">Cost Control</h2>
                            <p className="text-lg text-zinc-600 leading-relaxed">
                                Stay ahead of the budget with predictive financial modeling.
                                Our system aggregates transactions instantly, providing a clear financial velocity report that empowers decision-making.
                            </p>
                        </ScrollReveal>
                    </div>
                </section>

                {/* Footer CTA */}
                <section className="container mx-auto px-6 py-20 bg-zinc-50 border-t border-zinc-100 text-center">
                    <ScrollReveal>
                        <h2 className="text-5xl font-black mb-8 tracking-tighter">READY TO START?</h2>
                        <Link href="/auth/signin">
                            <Button className="h-16 px-12 bg-black hover:bg-zinc-800 text-white text-xl font-bold uppercase tracking-widest rounded-none group transition-all duration-300">
                                Sign In Now
                                <ArrowRight className="ml-3 h-6 w-6 group-hover:translate-x-1 transition-transform" />
                            </Button>
                        </Link>
                    </ScrollReveal>
                </section>
            </main>
        </div>
    );
}
