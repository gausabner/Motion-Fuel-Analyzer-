"use client";

import { usePathname } from "next/navigation";

/**
 * Route transition.
 *
 * This used to be an AnimatePresence with `mode="wait"`, which holds the
 * incoming page back until the outgoing one has finished leaving — so every
 * navigation cost the exit (150ms) plus the entrance (300ms) before the
 * operator could read anything. It also animated through Framer Motion's
 * `x`/`y`/`scale` shorthand, which runs on the main thread via
 * requestAnimationFrame, so it dropped frames during exactly the moment it
 * plays: while the next route's data is being fetched and parsed.
 *
 * It is a CSS animation now. It runs on the compositor, it cannot be starved
 * by a busy main thread, and there is no exit — the new page simply arrives.
 * 180ms and a 6px rise is enough to say "this is a different page" on a
 * surface where someone changes pages all day.
 *
 * The key on the wrapper restarts the animation per route. Content is visible
 * in its resting state, so a failed script leaves the page readable rather
 * than blank.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    return (
        <div key={pathname} className="w-full h-full route-enter">
            {children}
        </div>
    );
}
