"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell, Field } from "@/components/auth/AuthShell";

export default function SignInPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [formData, setFormData] = useState({ email: "", password: "" });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        try {
            const result = await signIn("credentials", {
                email: formData.email,
                password: formData.password,
                redirect: false,
                callbackUrl: "/dashboard",
            });
            if (result?.error) {
                setError("That email and password do not match an approved account. Check both and try again.");
                return;
            }
            router.push("/dashboard");
        } catch {
            setError("Sign-in could not be completed. Check your connection and try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AuthShell
            title="Sign in"
            lead="Use the account an administrator approved for you."
            foot={<>No account yet? <Link href="/auth/register" className="lnk">Request one</Link></>}
        >
            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate={false}>
                <Field id="email" label="Email">
                    <Input id="email" type="email" autoComplete="username" className="h-11" required
                        value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })}
                        aria-invalid={!!error} aria-describedby={error ? "signin-error" : undefined} />
                </Field>
                <Field id="password" label="Password" hint="Forgotten it? An administrator can set a new one from the Users page.">
                    <div className="relative">
                        <Input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" className="h-11 pr-11" required
                            value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })}
                            aria-invalid={!!error} aria-describedby={error ? "signin-error" : undefined} />
                        <button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}
                            className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-muted-foreground [@media(hover:hover)]:hover:text-foreground">
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    </div>
                </Field>
                {error && <p id="signin-error" role="alert" className="rounded-[12px] bg-crit-soft px-3 py-2 text-[13px] text-foreground">{error}</p>}
                <Button type="submit" disabled={isLoading} className="mt-1 h-11 w-full text-sm">
                    {isLoading ? "Signing in" : "Sign in"}
                </Button>
            </form>
        </AuthShell>
    );
}
