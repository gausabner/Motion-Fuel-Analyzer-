import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BrandLockup } from "@/components/brand/Logo";

/** Shared header for the public pages (landing, about). */
export function PublicHeader({ backLink }: { backLink?: boolean }) {
    return (
        <header className="mx-auto flex w-full max-w-[1120px] items-center justify-between gap-4 px-4 py-5 sm:px-6">
            <Link href="/" aria-label="Motion Fuel Analyzer home" className="text-foreground"><BrandLockup /></Link>
            <nav className="flex items-center gap-2" aria-label="Site">
                <Link href={backLink ? "/" : "/about"} className="tab">{backLink ? "Home" : "How it works"}</Link>
                <Link href="/auth/signin"><Button>Sign in</Button></Link>
            </nav>
        </header>
    );
}
