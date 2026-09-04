"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function RegisterPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [done, setDone] = useState(false);
    const [form, setForm] = useState({ name: "", email: "", password: "" });

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (form.password.length < 8) {
            toast.error("Password must be at least 8 characters");
            return;
        }
        setIsLoading(true);
        try {
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (res.ok) setDone(true);
            else toast.error(data.error || "Registration failed");
        } catch {
            toast.error("Something went wrong");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 py-12">
            <div className="w-full max-w-sm">
                <Link href="/" className="inline-block mb-10">
                    <img src="/logo-on-light.svg" alt="Motion Fuel Analyzer" className="w-44 h-auto object-contain" />
                </Link>

                {done ? (
                    <div className="space-y-4">
                        <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                            <CheckCircle2 className="w-6 h-6 text-emerald-700" />
                        </div>
                        <h1 className="text-2xl font-extrabold tracking-tight">Request received</h1>
                        <p className="text-muted-foreground font-medium">
                            Your account is awaiting administrator approval. You'll be able to sign in once it's approved.
                        </p>
                        <Link href="/auth/signin">
                            <Button variant="outline" className="mt-2">Back to sign in</Button>
                        </Link>
                    </div>
                ) : (
                    <>
                        <h1 className="text-3xl font-extrabold tracking-tight">Request an account</h1>
                        <p className="text-muted-foreground font-medium mt-2 mb-6">
                            New accounts are reviewed by an administrator before access is granted.
                        </p>
                        <form onSubmit={submit} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Full name</label>
                                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-12 bg-card" placeholder="Jane Doe" required />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</label>
                                <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="h-12 bg-card" placeholder="name@company.com" required />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Password</label>
                                <div className="relative">
                                    <Input type={showPassword ? "text" : "password"} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="h-12 bg-card pr-10" placeholder="At least 8 characters" required />
                                    <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                            <Button type="submit" disabled={isLoading} className="w-full h-12 text-base mt-2">
                                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</> : "Request account"}
                            </Button>
                        </form>
                        <div className="pt-6 mt-6 border-t border-border text-sm font-medium text-muted-foreground">
                            Already have an account?{" "}
                            <Link href="/auth/signin" className="text-primary font-semibold hover:underline underline-offset-4">Sign in</Link>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
