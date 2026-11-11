"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type SegItem = { key: string; label: ReactNode; href?: string; icon?: ReactNode };

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Sliding segmented control. One white pill slides under the selected item on
 * a spring (320ms, small overshoot) — a transition, not a keyframe, so a
 * second click mid-flight retargets instead of restarting.
 *
 * The indicator is placed without animation on first paint; it only moves when
 * the selection does.
 */
export function Seg({
    items, value, onChange, label, light = false, className,
}: {
    items: SegItem[];
    value: string;
    onChange?: (key: string) => void;
    label: string;
    light?: boolean;
    className?: string;
}) {
    const root = useRef<HTMLDivElement>(null);
    const ind = useRef<HTMLSpanElement>(null);
    const [ready, setReady] = useState(false);

    const place = useCallback(() => {
        const r = root.current, i = ind.current;
        if (!r || !i) return;
        const on = r.querySelector<HTMLElement>('[data-on="true"]');
        if (!on || !r.offsetWidth) { i.style.width = "0px"; return; }
        i.style.width = `${on.offsetWidth}px`;
        i.style.transform = `translateX(${on.offsetLeft}px)`;
        // On a narrow screen the control scrolls sideways; keep the selected item in view.
        if (r.scrollWidth > r.clientWidth) {
            const left = on.offsetLeft - 8, right = on.offsetLeft + on.offsetWidth + 8;
            if (left < r.scrollLeft) r.scrollLeft = left;
            else if (right > r.scrollLeft + r.clientWidth) r.scrollLeft = right - r.clientWidth;
        }
    }, []);

    useIsoLayoutEffect(() => { place(); }, [place, value, items.length]);

    useEffect(() => {
        const r = root.current;
        if (!r) return;
        const id = requestAnimationFrame(() => setReady(true));
        const ro = new ResizeObserver(place);
        ro.observe(r);
        document.fonts?.ready.then(place).catch(() => {});
        return () => { cancelAnimationFrame(id); ro.disconnect(); };
    }, [place]);

    return (
        <div ref={root} className={cn("seg", light && "light", className)} role="group" aria-label={label}>
            <span ref={ind} className="ind" data-ready={ready} aria-hidden="true" />
            {items.map(it => {
                const on = it.key === value;
                const inner = <>{it.icon}{it.label}</>;
                return it.href ? (
                    <Link key={it.key} href={it.href} data-on={on} aria-current={on ? "page" : undefined} onClick={() => onChange?.(it.key)}>
                        {inner}
                    </Link>
                ) : (
                    <button key={it.key} type="button" data-on={on} aria-pressed={on} onClick={() => onChange?.(it.key)}>
                        {inner}
                    </button>
                );
            })}
        </div>
    );
}
