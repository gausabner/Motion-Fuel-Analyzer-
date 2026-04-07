"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { motion } from "framer-motion";

export default function HomePage() {
    return (
        <div className="min-h-screen bg-white text-black font-sans selection:bg-yellow-300 selection:text-black overflow-x-hidden">
            {/* Minimal Header */}
            <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-zinc-100">
                <div className="container mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {/* Abstract Logo Icon */}
                        <div className="w-8 h-8 bg-black relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-4 h-4 bg-[#FDE047]"></div>
                        </div>
                        <span className="text-xl font-extrabold tracking-tighter uppercase">Motion Analyzers</span>
                    </div>
                    <div className="flex items-center gap-6">
                        <Link href="/about">
                            <span className="hidden md:block text-sm font-bold uppercase tracking-wider hover:text-zinc-600 transition-colors cursor-pointer">
                                Discover
                            </span>
                        </Link>
                        <Link href="/auth/signin">
                            <Button className="bg-[#FDE047] hover:bg-[#FACC15] text-black font-bold uppercase tracking-wider border-none rounded-none px-6 h-10">
                                Sign In
                            </Button>
                        </Link>
                    </div>
                </div>
            </header>

            {/* Main Content Grid */}
            <main className="container mx-auto px-6 pt-24 pb-12 min-h-screen flex flex-col justify-center max-w-[1400px]">
                <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center">

                    {/* Left Column: Typography */}
                    <div className="space-y-8 max-w-2xl">
                        <ScrollReveal>
                            <h1 className="text-6xl md:text-7xl lg:text-8xl font-black leading-[0.9] tracking-tighter">
                                UNLEASH YOUR <br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-black to-zinc-800">FLEET'S</span> <br />
                                POTENTIAL
                            </h1>
                        </ScrollReveal>

                        <ScrollReveal delay={0.1}>
                            <p className="text-lg md:text-xl text-zinc-600 font-medium leading-relaxed max-w-lg">
                                Elevate your fuel management with precise analytics.
                                Designed to inspire efficiency and empower your operational journey.
                            </p>
                        </ScrollReveal>

                        <ScrollReveal delay={0.2}>
                            <div className="flex flex-wrap gap-8 md:gap-12 pt-6 border-t-2 border-black/5">
                                <div>
                                    <h3 className="text-3xl font-black mb-1">300+</h3>
                                    <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Vehicles Tracked</p>
                                </div>
                                <div>
                                    <h3 className="text-3xl font-black mb-1">50+</h3>
                                    <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Active Depts</p>
                                </div>
                                <div>
                                    <h3 className="text-3xl font-black mb-1">100k+</h3>
                                    <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Liters Analyzed</p>
                                </div>
                            </div>
                        </ScrollReveal>

                        <ScrollReveal delay={0.3}>
                            <div className="pt-2">
                                <Link href="/auth/signin">
                                    <Button className="h-14 px-8 bg-black hover:bg-zinc-800 text-white text-base font-bold uppercase tracking-wider rounded-none group transition-all duration-300">
                                        Sign In
                                        <ArrowRight className="ml-3 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                                    </Button>
                                </Link>
                            </div>
                        </ScrollReveal>
                    </div>

                    {/* Right Column: Geometric Composition */}
                    <div className="relative w-full aspect-square max-w-[500px] lg:max-w-[550px] mx-auto lg:ml-auto hidden md:block">
                        <div className="grid grid-cols-2 grid-rows-2 gap-0 w-full h-full">
                            {/* Top Left: Rounded Grey */}
                            <motion.div
                                className="bg-zinc-200 rounded-tl-[100px]"
                                animate={{ scale: [1, 1.02, 1] }}
                                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                            ></motion.div>

                            {/* Top Right: Yellow Circle + Diamond */}
                            <div className="relative">
                                {/* Yellow Semi-Circle */}
                                <motion.div
                                    className="absolute right-0 top-0 w-full h-full bg-[#FDE047] rounded-r-full"
                                    animate={{ borderRadius: ["0px 50% 50% 0px", "0px 40% 40% 0px", "0px 50% 50% 0px"] }}
                                    transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                                ></motion.div>
                                {/* Yellow Diamond overlay */}
                                <motion.div
                                    className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 w-1/2 h-1/2 bg-[#FDE047] rotate-45 z-10"
                                    animate={{ rotate: 45, scale: [1, 1.1, 1] }}
                                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                                ></motion.div>
                            </div>

                            {/* Bottom Left: Stacked shapes */}
                            <div className="relative">
                                {/* Border Square */}
                                <div className="absolute inset-4 border-[16px] border-zinc-900"></div>
                                {/* Black Circle Overlay */}
                                <motion.div
                                    className="absolute -right-1/4 -top-1/4 w-3/4 h-3/4 bg-zinc-800 rounded-full z-20"
                                    animate={{ x: [0, 10, 0], y: [0, -10, 0] }}
                                    transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
                                ></motion.div>
                                {/* Bottom semi-circle */}
                                <div className="absolute bottom-0 left-0 w-full h-1/2 bg-black rounded-b-full"></div>
                            </div>

                            {/* Bottom Right: Black Quarter */}
                            <motion.div
                                className="bg-zinc-900 rounded-tr-[100px] rounded-bl-[100px] relative overflow-hidden"
                                whileHover={{ scale: 0.98 }}
                                transition={{ duration: 0.3 }}
                            >
                                {/* Triangle Shape using CSS borders */}
                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-0 
                                    border-l-[60px] border-l-transparent
                                    border-r-[60px] border-r-transparent
                                    border-b-[100px] border-b-zinc-700">
                                </div>
                                {/* Inner Triangle hole */}
                                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-0 h-0 
                                    border-l-[30px] border-l-transparent
                                    border-r-[30px] border-r-transparent
                                    border-b-[50px] border-b-zinc-900">
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
