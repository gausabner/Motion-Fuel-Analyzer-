"use client";

/**
 * One palette for every chart in the app.
 *
 * Before this existed there were four. Charts.tsx and FleetScatterChart each
 * declared their own PETROL/DIESEL constants, FlowChart invented #378ADD and
 * #1D9E75 inline, and FuelPriceChart invented #D85A30 and #378ADD again — so
 * the same quantity wore a different colour depending on which page you opened
 * it from. Grid lines, axis labels and tooltip cursors were hardcoded light
 * greys (#F1F5F9, #F4F4F5, #E4E4E7), which is why charts in dark mode had
 * chrome you could not see.
 *
 * Two rules this file exists to enforce:
 *
 * 1. Colour follows the ENTITY, never its rank. Petrol is always slot 1 and
 *    Diesel always slot 2, so a filter that drops a series cannot repaint the
 *    ones that remain.
 * 2. Every value resolves from a CSS custom property, so the dark theme is a
 *    selected set of steps for the dark surface rather than the same hex
 *    dimmed. The tokens live in app/globals.css next to the rest of the theme.
 *
 * Recharts takes colours as strings and cannot read a CSS variable through its
 * canvas measurements, so useChartTheme() resolves them off the document once
 * per theme change and hands back plain hex.
 */

import { useEffect, useState } from "react";

export type ChartTheme = {
    /** Petrol — categorical slot 1. */
    petrol: string;
    /** Diesel — categorical slot 2. */
    diesel: string;
    /** Received / FRE — categorical slot 3. */
    received: string;
    /** Horizontal rules. Recessive by design; the baseline is drawn separately. */
    grid: string;
    /** Axis tick labels. */
    axis: string;
    /** Hover crosshair and bar highlight. */
    cursor: string;
    /** The card the chart sits on — used for the ring around overlapping marks. */
    surface: string;
    /** Body ink, for tooltip values. */
    ink: string;
};

/**
 * Fallbacks match the light tokens in globals.css. They are only used during
 * the first render pass on the server, where there is no document to read.
 */
const LIGHT: ChartTheme = {
    petrol: "#60A5FA",
    diesel: "#1D4ED8",
    received: "#64748B",
    grid: "#EBEFF5",
    axis: "#5B6B82",
    cursor: "#94A3B8",
    surface: "#FFFFFF",
    ink: "#0F172A",
};

const VARS: Record<keyof ChartTheme, string> = {
    petrol: "--chart-1",
    diesel: "--chart-2",
    received: "--chart-3",
    grid: "--chart-grid",
    axis: "--chart-axis",
    cursor: "--chart-cursor",
    surface: "--chart-surface",
    ink: "--foreground",
};

function readTheme(): ChartTheme {
    if (typeof window === "undefined") return LIGHT;
    const cs = getComputedStyle(document.documentElement);
    const out = { ...LIGHT };
    (Object.keys(VARS) as (keyof ChartTheme)[]).forEach((k) => {
        const v = cs.getPropertyValue(VARS[k]).trim();
        if (v) out[k] = v;
    });
    return out;
}

/**
 * Resolved chart colours for the current theme, re-read when the theme flips.
 *
 * next-themes toggles a class on <html>, so a MutationObserver on that
 * attribute is what tells us to re-read — there is no media query to listen to
 * once the user has made an explicit choice.
 */
export function useChartTheme(): ChartTheme {
    const [theme, setTheme] = useState<ChartTheme>(LIGHT);

    useEffect(() => {
        const sync = () => setTheme(readTheme());
        sync();
        const mo = new MutationObserver(sync);
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        mq.addEventListener("change", sync);
        return () => {
            mo.disconnect();
            mq.removeEventListener("change", sync);
        };
    }, []);

    return theme;
}

/** Shared axis/grid geometry, so every chart in the app has the same chrome. */
export const AXIS = {
    tickSize: 12,
    tickMargin: 8,
    /** Charts carry their own baseline; the axis line would double it. */
    axisLine: false as const,
    tickLine: false as const,
};

/**
 * Litres on an axis: six digits of raw litres crowd the gutter and are read as
 * a shape rather than a number, so the axis speaks in thousands and the
 * tooltip carries the exact figure.
 */
export function axisLitres(value: number): string {
    if (!Number.isFinite(value)) return "";
    if (value === 0) return "0";
    if (Math.abs(value) >= 1000) {
        const k = value / 1000;
        return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
    }
    return String(Math.round(value));
}

/** Same idea for money, where the magnitudes are larger again. */
export function axisMoney(value: number, currency = ""): string {
    if (!Number.isFinite(value)) return "";
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${currency}${(value / 1_000_000).toFixed(1)}M`;
    if (abs >= 1000) return `${currency}${Math.round(value / 1000)}k`;
    return `${currency}${Math.round(value)}`;
}

/**
 * Tooltip chrome. Recharts styles its tooltip with inline objects, so these
 * are built from the resolved theme rather than from classes.
 */
export function tooltipStyles(t: ChartTheme) {
    return {
        contentStyle: {
            background: t.surface,
            border: `1px solid ${t.grid}`,
            borderRadius: 12,
            boxShadow: "0 4px 16px -4px rgb(15 23 42 / 0.18)",
            padding: "10px 12px",
            fontSize: 12,
        },
        labelStyle: { color: t.axis, fontSize: 11, fontWeight: 600, marginBottom: 4 },
        itemStyle: { color: t.ink, fontSize: 12, fontWeight: 600, padding: 0 },
        cursor: { stroke: t.cursor, strokeWidth: 1, strokeDasharray: "4 4" } as const,
        /** Bar and pie charts highlight the band rather than drawing a line through it. */
        bandCursor: { fill: t.cursor, fillOpacity: 0.12 } as const,
    };
}
