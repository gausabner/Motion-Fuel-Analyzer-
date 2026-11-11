import Link from "next/link";
import type { ReactNode } from "react";
import { MotionLogo } from "@/components/brand/Logo";

/** The sign-in and request-access frame: the full logo, the product name, one card. */
export function AuthShell({ title, lead, children, foot }: { title: string; lead: string; children: ReactNode; foot?: ReactNode }) {
    return (
        <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
            <div className="route-enter w-full max-w-[400px]">
                <Link href="/" aria-label="Motion Fuel Analyzer home" className="mx-auto block w-[240px] max-w-full text-foreground">
                    <MotionLogo className="h-auto w-full" />
                </Link>
                <p className="mt-3 text-center text-sm text-muted-foreground">Fuel Analyzer</p>
                <section className="monumental-card mt-7 !p-6">
                    <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{title}</h1>
                    <p className="mt-1 text-[13.5px] leading-normal text-muted-foreground">{lead}</p>
                    <div className="mt-5">{children}</div>
                </section>
                {foot && <p className="mt-5 text-center text-[13px] text-muted-foreground">{foot}</p>}
            </div>
        </main>
    );
}

export function Field({ id, label, children, hint }: { id: string; label: string; children: ReactNode; hint?: string }) {
    return (
        <div className="flex flex-col gap-1.5">
            <label htmlFor={id} className="text-[13px] font-medium">{label}</label>
            {children}
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
    );
}
