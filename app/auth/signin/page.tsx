"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff, Loader2, Droplets, TrendingDown } from "lucide-react";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion, useReducedMotion } from "framer-motion";

export default function SignInPage() {
    const router = useRouter();
    const reduceMotion = useReducedMotion();
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [formData, setFormData] = useState({
        email: "",
        password: ""
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const result = await signIn("credentials", {
                email: formData.email,
                password: formData.password,
                redirect: false,
                callbackUrl: "/dashboard"
            });

            if (result?.error) {
                toast.error("Invalid email or password");
                return;
            }

            toast.success("Login successful");
            router.push("/dashboard");
        } catch (error) {
            toast.error("Something went wrong");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen grid lg:grid-cols-2 bg-background font-sans selection:bg-accent selection:text-accent-foreground">

            {/* Left column: form */}
            <div className="flex flex-col justify-center px-8 md:px-16 lg:px-24 xl:px-32 py-12">
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <Link href="/" className="inline-block mb-12">
                        <img src="/logo-on-light.svg" alt="Motion Fuel Analyzer" className="w-44 h-auto object-contain" />
                    </Link>

                    <div className="space-y-6 max-w-sm w-full">
                        <div>
                            <h1 className="text-3xl font-extrabold tracking-tight">Welcome back</h1>
                            <p className="text-muted-foreground font-medium mt-2">Sign in to open the fleet command centre.</p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</label>
                                <Input
                                    type="email"
                                    placeholder="name@company.com"
                                    className="h-12 bg-card"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Password</label>
                                <div className="relative">
                                    <Input
                                        type={showPassword ? "text" : "password"}
                                        className="h-12 bg-card pr-10"
                                        placeholder="••••••••"
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        aria-label={showPassword ? "Hide password" : "Show password"}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-1">
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="remember" />
                                    <label htmlFor="remember" className="text-sm font-medium text-foreground/80">
                                        Remember me
                                    </label>
                                </div>
                                <Link href="#" className="text-sm font-semibold text-primary hover:underline underline-offset-4">
                                    Forgot password?
                                </Link>
                            </div>

                            <Button
                                type="submit"
                                disabled={isLoading}
                                className="w-full h-12 text-base mt-4"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Signing in…
                                    </>
                                ) : (
                                    "Sign in"
                                )}
                            </Button>
                        </form>

                        <div className="pt-6 border-t border-border text-sm font-medium text-muted-foreground">
                            Don't have an account?{" "}
                            <Link href="/auth/register" className="text-primary font-semibold hover:underline underline-offset-4">
                                Request one
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right column: ink panel with glass preview */}
            <div className="hidden lg:flex flex-col justify-between bg-[#0F172A] p-16 relative overflow-hidden">
                <div className="absolute -top-32 -right-24 w-[28rem] h-[28rem] bg-primary/20 rounded-full blur-3xl" />
                <div className="absolute bottom-0 -left-24 w-80 h-80 bg-[#1E293B] rounded-full blur-2xl opacity-60" />

                <div className="relative z-10 mt-8 max-w-lg">
                    <img src="/logo-mark.svg" alt="" aria-hidden="true" className="w-14 h-14 mb-8 animate-logo-drift" />
                    <h2 className="text-4xl xl:text-5xl font-extrabold text-white leading-tight tracking-tight mb-6">
                        One source of truth<br />
                        for <span className="text-[#60A5FA]">fleet fuel.</span>
                    </h2>
                    <p className="text-[#94A3B8] text-lg font-medium leading-relaxed">
                        Consumption, receipts, cost centres and fleet analytics —
                        verified, deduplicated, and ready to export.
                    </p>
                </div>

                {/* Glass preview card */}
                <motion.div
                    className="relative z-10 w-full max-w-md bg-white/[0.06] backdrop-blur-xl border border-white/10 p-6 rounded-2xl shadow-2xl"
                    animate={reduceMotion ? undefined : { y: [0, -6, 0] }}
                    transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                >
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <p className="text-[10px] text-[#94A3B8] font-semibold uppercase tracking-widest mb-1">May consumption</p>
                            <h3 className="text-3xl font-extrabold text-white tabular-nums">111,424 L</h3>
                        </div>
                        <div className="bg-emerald-500/15 text-emerald-300 text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1">
                            <TrendingDown className="w-3.5 h-3.5" /> 4%
                        </div>
                    </div>

                    <svg viewBox="0 0 360 90" className="w-full">
                        <defs>
                            <linearGradient id="signinArea" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.4" />
                                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        <path d="M0,70 L45,52 L90,60 L135,38 L180,48 L225,26 L270,38 L315,20 L360,30 L360,90 L0,90 Z" fill="url(#signinArea)" />
                        <path d="M0,70 L45,52 L90,60 L135,38 L180,48 L225,26 L270,38 L315,20 L360,30" fill="none" stroke="#60A5FA" strokeWidth="2.5" />
                    </svg>

                    <div className="mt-5 space-y-2.5">
                        {[
                            { label: "Diesel", w: "68%", c: "#1D4ED8" },
                            { label: "Petrol", w: "32%", c: "#60A5FA" },
                        ].map((r) => (
                            <div key={r.label} className="flex items-center gap-3">
                                <span className="w-12 text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">{r.label}</span>
                                <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                                    <div className="h-full rounded-full" style={{ width: r.w, background: r.c }} />
                                </div>
                                <span className="text-[10px] font-bold text-white tabular-nums flex items-center gap-1">
                                    <Droplets className="w-3 h-3 text-[#60A5FA]" /> {r.w}
                                </span>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
