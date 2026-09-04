import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Shared header for the public pages (landing, about). */
export function PublicHeader({ backLink }: { backLink?: boolean }) {
    return (
        <header className="fixed top-0 left-0 right-0 z-50 bg-card/90 backdrop-blur-md border-b border-border">
            <div className="container mx-auto px-6 h-20 flex items-center justify-between">
                <Link href="/" className="flex items-center">
                    <img src="/logo-on-light.svg" alt="Motion Fuel Analyzer" className="w-36 md:w-44 h-auto object-contain" />
                </Link>
                <nav className="flex items-center gap-6">
                    {!backLink && (
                        <Link
                            href="/about"
                            className="hidden md:block text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Discover
                        </Link>
                    )}
                    {backLink && (
                        <Link
                            href="/"
                            className="hidden md:block text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Home
                        </Link>
                    )}
                    <Link href="/auth/signin">
                        <Button className="px-6 h-10">Sign in</Button>
                    </Link>
                </nav>
            </div>
        </header>
    );
}
