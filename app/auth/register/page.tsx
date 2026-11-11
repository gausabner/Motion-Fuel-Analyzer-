"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell, Field } from "@/components/auth/AuthShell";

export default function RegisterPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState({ name: "", email: "", password: "" });

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (form.password.length < 8) {
            setError("Choose a password of at least 8 characters.");
            return;
        }
        setIsLoading(true);
        try {
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) setDone(true);
            else setError(data.error || "The request could not be sent. Check the details and try again.");
        } catch {
            setError("The request could not be sent. Check your connection and try again.");
        } finally {
            setIsLoading(false);
        }
    };

    if (done) {
        return (
            <AuthShell title="Request received" lead="An administrator has to approve the account before you can sign in. Nothing more is needed from you.">
                <Link href="/auth/signin"><Button variant="outline" className="h-11 w-full">Back to sign in</Button></Link>
            </AuthShell>
        );
    }

    return (
        <AuthShell
            title="Request an account"
            lead="New accounts are reviewed by an administrator before access is granted."
            foot={<>Already approved? <Link href="/auth/signin" className="lnk">Sign in</Link></>}
        >
            <form onSubmit={submit} className="flex flex-col gap-4">
                <Field id="name" label="Full name">
                    <Input id="name" autoComplete="name" className="h-11" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </Field>
                <Field id="email" label="Work email">
                    <Input id="email" type="email" autoComplete="email" className="h-11" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                </Field>
                <Field id="password" label="Password" hint="At least 8 characters.">
                    <div className="relative">
                        <Input id="password" type={showPassword ? "text" : "password"} autoComplete="new-password" className="h-11 pr-11" required minLength={8}
                            value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                        <button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}
                            className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-muted-foreground [@media(hover:hover)]:hover:text-foreground">
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    </div>
                </Field>
                {error && <p role="alert" className="rounded-[12px] bg-crit-soft px-3 py-2 text-[13px] text-foreground">{error}</p>}
                <Button type="submit" disabled={isLoading} className="mt-1 h-11 w-full text-sm">
                    {isLoading ? "Sending request" : "Request account"}
                </Button>
            </form>
        </AuthShell>
    );
}
