/**
 * Display formatting for money and volume.
 *
 * These figures end up in council reports, so they have to read the same on
 * every screen. Before this existed each page formatted inline: the dashboard
 * printed "N$3,325,884" while Cost centres and Fleet printed a bare "$", and
 * litres appeared as "19,735", "729485.5 L" and "528483.60" — two of those in a
 * single table. One wrong currency symbol costs the reader's trust in every
 * other number on the page.
 *
 * The symbol comes from SystemSettings.currencySymbol (Settings → currency),
 * never from a literal. Pass it in from the server component that already loads
 * settings; DEFAULT_CURRENCY is the fallback that matches the seeded value.
 */

export const DEFAULT_CURRENCY = "N$";

/** Non-breaking space: keeps the figure and its unit together without closing the gap. */
const NBSP = "\u00A0";

type MoneyOptions = {
    /** Decimal places. Default 2 — use 0 for headline KPIs where cents are noise. */
    decimals?: number;
    /** Currency symbol; defaults to the Namibian dollar the app is seeded with. */
    currency?: string;
};

/**
 * Money, with the sign outside the symbol: -N$1,234.56, never N$-1,234.56.
 */
export function fmtMoney(value: number | null | undefined, options: MoneyOptions = {}): string {
    const { decimals = 2, currency = DEFAULT_CURRENCY } = options;
    if (value === null || value === undefined || !Number.isFinite(value)) return "—";
    const sign = value < 0 ? "-" : "";
    const body = Math.abs(value).toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
    return `${sign}${currency}${body}`;
}

/** Money for headline KPIs: no decimals, because cents are noise at that size. */
export function fmtMoneyCompact(value: number | null | undefined, currency = DEFAULT_CURRENCY): string {
    return fmtMoney(value, { decimals: 0, currency });
}

/**
 * Litres. Whole litres by default — the source data is whole-litre dispensing,
 * and a trailing ".0" on every row is noise in a dense table.
 */
export function fmtLitres(value: number | null | undefined, decimals = 0): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return "—";
    const body = value.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
    return `${body}${NBSP}L`;
}

/** Price per litre, where cents genuinely matter: N$23.38/L. */
export function fmtPricePerLitre(value: number | null | undefined, currency = DEFAULT_CURRENCY): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return "—";
    return `${fmtMoney(value, { decimals: 2, currency })}/L`;
}

/** Percentage to one decimal: 43.3%. Returns "—" rather than NaN% on a zero base. */
export function fmtPercent(value: number | null | undefined, decimals = 1): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return "—";
    return `${value.toFixed(decimals)}%`;
}

/** Share of a total, guarding the divide-by-zero that an empty filter produces. */
export function fmtShare(part: number, total: number, decimals = 1): string {
    if (!Number.isFinite(part) || !Number.isFinite(total) || total === 0) return "—";
    return fmtPercent((part / total) * 100, decimals);
}

/**
 * A plain count (transactions, units, rows). Grouped, because an ungrouped
 * "27419" sitting beside a grouped "1,851,214 L" in the same table row reads
 * as a different kind of number than it is.
 */
export function fmtCount(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return "—";
    return Math.round(value).toLocaleString();
}

/**
 * A department name as people say it. The source data shouts
 * ("DEPARTMENT OF INFRASTRUCTURE WATER & TECHNICAL SERVICES"); the prefix is
 * the same on every row, so it is dropped and the rest set in title case.
 */
export function fmtDept(name: string | null | undefined): string {
    if (!name) return "No cost centre";
    const small = new Set(["and", "of", "the", "for", "&"]);
    return name
        .replace(/^\s*department\s+of\s+/i, "")
        .toLowerCase()
        .split(/\s+/)
        .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
        .join(" ");
}

/** How a multiple of the median is written on screen: "twice", "three times", "2.5 times". */
export function multipleLabel(m: number): string {
    return m === 2 ? "twice" : m === 3 ? "three times" : `${Number.isInteger(m) ? m : m.toFixed(1)} times`;
}
