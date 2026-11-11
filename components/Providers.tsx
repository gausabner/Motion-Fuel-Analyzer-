"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <SessionProvider>
            <ThemeProvider
                attribute="class"
                defaultTheme="system"
                enableSystem
                disableTransitionOnChange
            >
                {children}
                {/* One toast style: an ink pill at the bottom, with Undo where an
                    action can be reversed. */}
                <Toaster
                    position="bottom-center"
                    duration={5000}
                    toastOptions={{
                        unstyled: true,
                        classNames: {
                            toast: "flex items-center gap-3 rounded-full bg-ink py-[9px] pl-4 pr-2.5 text-[13px] text-white shadow-[0_10px_30px_-10px_rgb(0_0_0/0.5)] w-auto max-w-[calc(100vw-24px)] mx-auto",
                            title: "font-medium",
                            description: "text-white/70 text-xs",
                            actionButton: "ml-1 rounded-full bg-white/15 px-[11px] py-[5px] text-xs font-semibold text-white",
                            closeButton: "hidden",
                        },
                    }}
                />
            </ThemeProvider>
        </SessionProvider>
    );
}
