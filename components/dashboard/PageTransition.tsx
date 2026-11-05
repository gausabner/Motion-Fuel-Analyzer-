"use client";

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";

/**
 * Route transition: content rises in like the logo's arrow (up-right drift),
 * exits softly upward. Honours prefers-reduced-motion.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const reduceMotion = useReducedMotion();

    if (reduceMotion) {
        return <div className="w-full h-full">{children}</div>;
    }

    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={pathname}
                initial={{ opacity: 0, x: -6, y: 10, scale: 0.995 }}
                animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 4, y: -8, transition: { duration: 0.15, ease: "easeIn" } }}
                transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
                className="w-full h-full"
            >
                {children}
            </motion.div>
        </AnimatePresence>
    );
}
