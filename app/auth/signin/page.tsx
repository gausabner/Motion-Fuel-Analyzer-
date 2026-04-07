"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff, BarChart3, Truck, ShieldCheck, Loader2 } from "lucide-react";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { motion } from "framer-motion";

export default function SignInPage() {
    const router = useRouter();
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
        <div className="min-h-screen grid lg:grid-cols-2 bg-white font-sans selection:bg-[#FDE047] selection:text-black">

            {/* Left Column: Form Section */}
            <div className="flex flex-col justify-center px-8 md:px-16 lg:px-24 xl:px-32 py-12">
                <ScrollReveal width="100%">
                    <div className="mb-12">
                        <div className="flex items-center gap-2 mb-8">
                            <Link href="/">
                                <div className="w-6 h-6 bg-black relative overflow-hidden group cursor-pointer">
                                    <div className="absolute top-0 right-0 w-3 h-3 bg-[#FDE047] group-hover:scale-125 transition-transform duration-300"></div>
                                </div>
                            </Link>
                            <span className="text-xl font-extrabold tracking-tighter uppercase">Motion Analyzers</span>
                        </div>
                    </div>

                    <div className="space-y-6 max-w-sm w-full">
                        <h1 className="text-3xl font-black tracking-tight">Welcome Back</h1>
                        <p className="text-zinc-500 font-medium">Enter your credentials to access the fleet command center.</p>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-bold uppercase tracking-wider text-black">Email</label>
                                <Input
                                    type="email"
                                    placeholder="name@company.com"
                                    className="h-12 border-zinc-200 focus-visible:ring-black rounded-none bg-zinc-50"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold uppercase tracking-wider text-black">Password</label>
                                <div className="relative">
                                    <Input
                                        type={showPassword ? "text" : "password"}
                                        className="h-12 border-zinc-200 focus-visible:ring-black rounded-none bg-zinc-50 pr-10"
                                        placeholder="••••••••"
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-black"
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-2">
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="remember" className="rounded-none border-zinc-300 data-[state=checked]:bg-black data-[state=checked]:text-[#FDE047]" />
                                    <label
                                        htmlFor="remember"
                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                    >
                                        Remember me
                                    </label>
                                </div>
                                <Link href="#" className="text-sm font-bold hover:underline">
                                    Forgot Password?
                                </Link>
                            </div>

                            <Button
                                type="submit"
                                disabled={isLoading}
                                className="w-full h-12 bg-[#FDE047] hover:bg-[#FACC15] text-black font-bold uppercase tracking-wider text-base rounded-none mt-6 disabled:opacity-70"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Logging in...
                                    </>
                                ) : (
                                    "Log In"
                                )}
                            </Button>
                        </form>

                        <div className="mt-8 pt-8 border-t border-zinc-100 text-sm font-medium text-zinc-500">
                            Don't have an account? <Link href="#" className="text-black font-bold underline decoration-[#FDE047] decoration-2 underline-offset-4">Register Now</Link>
                        </div>
                    </div>
                </ScrollReveal>
            </div>

            {/* Right Column: Visual Feature */}
            <div className="hidden lg:flex flex-col justify-between bg-zinc-950 p-16 relative overflow-hidden">
                {/* Background Shapes */}
                <motion.div
                    className="absolute top-0 right-0 w-96 h-96 bg-zinc-900 rounded-bl-full opacity-50"
                    animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.4, 0.5] }}
                    transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
                ></motion.div>
                <motion.div
                    className="absolute bottom-0 left-0 w-64 h-64 bg-zinc-900 rounded-tr-full opacity-30"
                    animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.4, 0.3] }}
                    transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                ></motion.div>

                <div className="relative z-10 max-w-lg mt-12">
                    <ScrollReveal delay={0.2}>
                        <h2 className="text-5xl font-black text-white leading-tight mb-6 tracking-tighter">
                            EFFORTLESSLY <br />
                            MANAGE YOUR <br />
                            <span className="text-[#FDE047]">FLEET OPERATIONS</span>
                        </h2>
                        <p className="text-zinc-400 text-lg font-medium leading-relaxed mb-12">
                            Log in to access your comprehensive command center and manage your team with precision.
                        </p>
                    </ScrollReveal>
                </div>

                {/* Floating Card Visual */}
                <ScrollReveal delay={0.4} width="fit-content">
                    <motion.div
                        className="relative z-10 w-full max-w-md bg-zinc-900/50 backdrop-blur-xl border border-white/10 p-6 rounded-2xl shadow-2xl"
                        whileHover={{ scale: 1.02 }}
                        transition={{ duration: 0.3 }}
                    >
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest mb-1">Total Savings</p>
                                <h3 className="text-3xl font-black text-white">$189,374</h3>
                            </div>
                            <div className="bg-[#FDE047] text-black text-xs font-bold px-2 py-1 rounded flex items-center">
                                +12.5%
                            </div>
                        </div>

                        <div className="space-y-4">
                            {/* Mock List Items */}
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="flex items-center justify-between p-3 bg-black/40 rounded-lg border border-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-zinc-800 rounded flex items-center justify-center">
                                            {i === 1 && <Truck className="w-4 h-4 text-white" />}
                                            {i === 2 && <BarChart3 className="w-4 h-4 text-white" />}
                                            {i === 3 && <ShieldCheck className="w-4 h-4 text-white" />}
                                        </div>
                                        <div>
                                            <div className="w-24 h-2 bg-zinc-800 rounded mb-1"></div>
                                            <div className="w-16 h-2 bg-zinc-900 rounded"></div>
                                        </div>
                                    </div>
                                    <div className="w-12 h-6 bg-zinc-800 rounded"></div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </ScrollReveal>
            </div>
        </div>
    );
}
