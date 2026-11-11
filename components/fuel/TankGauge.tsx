import { useId } from "react";

const WAVE = "M-60 5 q15 -6 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 V170 H-60Z";

/**
 * A tank drawn as liquid that settles to its level. This is the one ambient
 * motion in the app — it is literal, because the product is about fuel — so
 * it is used only where a level is actually known.
 *
 * `over` draws the liquid past a dashed line at the reference level, for a
 * fill larger than the tank (or the unit's own record) should hold.
 */
export function TankGauge({ level, tone = "brand", over = false, className, label }: {
    /** 0–1 */
    level: number;
    tone?: "brand" | "sky" | "warn" | "crit";
    over?: boolean;
    className?: string;
    label?: string;
}) {
    const id = useId().replace(/:/g, "");
    const top = 14, bot = 140;
    const y = over ? top + 2 : bot - (bot - top) * Math.max(0, Math.min(level, 1));
    const col = { brand: "var(--brand)", sky: "var(--sky)", warn: "var(--warn)", crit: "var(--crit)" }[tone];
    return (
        <svg className={className ?? "tk"} viewBox="0 0 120 150" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
            <defs><clipPath id={id}><rect x="10" y="8" width="100" height="134" rx="24" /></clipPath></defs>
            <rect x="10" y="8" width="100" height="134" rx="24" fill="var(--card)" />
            <g clipPath={`url(#${id})`}>
                <g className="lvl" style={{ transform: `translateY(${y}px)` }}>
                    <g className="rise">
                        <g transform="translate(-22 -4)"><path className="wv w2" d={WAVE} fill={col} opacity=".35" /></g>
                        <path className="wv" d={WAVE} fill={col} />
                    </g>
                </g>
            </g>
            {[0.25, 0.5, 0.75].map(t => (
                <line key={t} x1="96" x2="108" y1={bot - (bot - top) * t} y2={bot - (bot - top) * t} stroke="var(--faint)" strokeWidth="1.5" />
            ))}
            {over && <line x1="10" x2="110" y1={top + 20} y2={top + 20} stroke="#fff" strokeWidth="2" strokeDasharray="5 4" />}
            <rect x="10" y="8" width="100" height="134" rx="24" fill="none" stroke="var(--border)" strokeWidth="2" />
        </svg>
    );
}
