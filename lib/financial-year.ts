/** Financial-year arithmetic. No database access, so it is safe on the client. */

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** First day of the financial year that contains `d`, for a year starting in `startMonth` (1–12). */
export function financialYearStart(d: Date, startMonth: number): Date {
    const m = Math.min(12, Math.max(1, startMonth)) - 1;
    return new Date(d.getMonth() >= m ? d.getFullYear() : d.getFullYear() - 1, m, 1);
}

/** Last day of the financial year that starts on `start`. */
export function financialYearEnd(start: Date): Date {
    return new Date(start.getFullYear() + 1, start.getMonth(), 0);
}

/** "Year to date" for a calendar year, "Financial year to date" otherwise. */
export function yearToDateLabel(startMonth: number): string {
    return startMonth === 1 ? "Year to date" : "Financial year to date";
}

/** "2025/26" for a year that straddles two calendar years, "2026" for a calendar year. */
export function financialYearLabel(start: Date): string {
    if (start.getMonth() === 0) return String(start.getFullYear());
    return `${start.getFullYear()}/${String((start.getFullYear() + 1) % 100).padStart(2, "0")}`;
}
