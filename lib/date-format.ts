/**
 * transDate values are stored as UTC instants that represent LOCAL-midnight of
 * the intended calendar day (ingestion builds dates with `new Date(y, m, d)` and
 * the pickers serialise local dates via `toISOString()`). Any display therefore
 * MUST format in local time — formatting in UTC (`toISOString().split('T')`)
 * shows the previous day in timezones ahead of UTC (e.g. UTC+2 turns Apr 1 into
 * Mar 31). Use these helpers everywhere a stored date is rendered or used as a
 * per-day grouping key so display matches the range the user actually picked.
 */

/** Local calendar date as YYYY-MM-DD (stable, sortable). */
export function toLocalYmd(d: string | number | Date): string {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}
