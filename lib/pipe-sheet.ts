import * as XLSX from "xlsx";

/**
 * The fuel system's raw HR580 export is pipe-delimited text. Opened in Excel
 * without splitting, every row lands in one or two cells:
 *
 *   "Tank|Pump|Issue Date|Reference No|Issue Time|Issue " + "Vote|Issue Qty|…"
 *
 * so the sheet has no recognisable headings and used to import nothing. This
 * rebuilds such a sheet into ordinary columns. It returns null for any sheet
 * that is not in that layout, which is then read as it is.
 *
 * Values are converted the way Excel converts them when the columns are split
 * properly (digits become numbers, so reference "033895" becomes 33895).
 * That matters: the duplicate check compares reference numbers, and the same
 * report uploaded in both layouts must produce identical rows.
 */
export function unpipeSheet(sheet: XLSX.WorkSheet): XLSX.WorkSheet | null {
    const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false }) as unknown[][];
    const join = (row: unknown[] | undefined) => (row ?? []).map(c => (c == null ? "" : String(c))).join("");

    // The heading line is within the first few rows (Power Query adds a "Column1, Column2" row above it).
    let headerAt = -1;
    for (let i = 0; i < Math.min(raw.length, 6); i++) {
        const fields = join(raw[i]).split("|").map(f => f.trim().toLowerCase());
        if (fields.includes("tank") && fields.includes("issue date") && fields.includes("issue qty")) { headerAt = i; break; }
    }
    if (headerAt < 0) return null;

    const split = (row: unknown[]) => join(row).split("|").map(f => f.trim());
    const header = split(raw[headerAt]);
    while (header.length && header[header.length - 1] === "") header.pop();   // the line ends with a trailing "|"

    const value = (text: string): string | number | null => {
        if (text === "") return null;
        return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : text;
    };

    const out: (string | number | null)[][] = [header];
    for (const row of raw.slice(headerAt + 1)) {
        const fields = split(row).slice(0, header.length);
        if (fields.every(f => f === "")) continue;
        out.push(header.map((_, i) => value(fields[i] ?? "")));
    }
    return XLSX.utils.aoa_to_sheet(out);
}

/** The HR580 headings, in the order the fuel system writes them. */
export const HR580_HEADINGS = ["Tank", "Pump", "Issue Date", "Reference No", "Issue Time", "Issue Vote", "Issue Qty", "Issue Cost",
    "Fleet Unit", "Fleet EI", "Fleet Reading", "Job No", "Activity", "Category"];

/** Headings any of the importable reports use; three on one row mark it as the heading row. */
const KNOWN_HEADINGS = new Set([
    ...HR580_HEADINGS.map(h => h.toLowerCase()),
    "store no", "store", "trans date", "date", "trans qty", "qty", "trans type", "trans amt", "trans ref no", "trans vote no",
    "item no", "item desc", "item cat", "tot on hand qty", "bin no", "uom code",
    "order no", "o date", "supp ref", "supp name", "grn qty", "grn cost", "order qty", "ord cost",
]);

type Cell = string | number | boolean | Date | null;
const text = (c: unknown) => (c == null ? "" : String(c).trim());
const matches = (row: unknown[] | undefined) => (row ?? []).filter(c => KNOWN_HEADINGS.has(text(c).toLowerCase())).length;

/**
 * A heading row split word by word ("Issue", "Date", "Reference", "No", …,
 * with Excel adding digits to repeats: "Issue2", "Fleet4") while the data
 * underneath kept one value per column, shifted by some empty columns.
 *
 * Rebuilds the real headings by joining neighbouring words, then maps them in
 * order onto the columns that carry data. Returns null unless the words make
 * the HR580 headings exactly and the data columns match them one for one, so
 * a sheet is never read with its columns guessed.
 */
export function repairSplitHeadings(rows: Cell[][]): Cell[][] | null {
    if (!rows.length) return null;
    const head = rows[0].map(text);
    if (head.some(h => h.toLowerCase() === "issue date")) return null;   // headings are whole already
    const words = head.filter(Boolean).map(w => w.replace(/(?<=[A-Za-z])\d+$/, ""));
    const canon = HR580_HEADINGS.map(h => h.toLowerCase());

    const names: string[] = [];
    for (let i = 0; i < words.length;) {
        const pair = `${words[i]} ${words[i + 1] ?? ""}`.toLowerCase();
        const one = words[i].toLowerCase();
        let hit = canon.indexOf(pair);
        if (hit >= 0 && i + 1 < words.length) { names.push(HR580_HEADINGS[hit]); i += 2; continue; }
        hit = canon.indexOf(one);
        if (hit < 0) hit = canon.findIndex((c, k) => c.endsWith(` ${one}`) && !names.includes(HR580_HEADINGS[k]));
        if (hit < 0) return null;
        names.push(HR580_HEADINGS[hit]); i += 1;
    }
    // Must be the headings in their own order, and include the three the importer needs.
    const order = names.map(n => HR580_HEADINGS.indexOf(n));
    if (order.some((o, k) => k > 0 && o <= order[k - 1])) return null;
    if (!["Tank", "Issue Date", "Issue Qty"].every(n => names.includes(n))) return null;

    const body = rows.slice(1).filter(r => r.some(c => c != null && text(c) !== ""));
    if (!body.length) return null;
    const width = Math.max(...body.map(r => r.length));
    const used: number[] = [];
    for (let c = 0; c < width; c++) if (body.some(r => r[c] != null)) used.push(c);
    if (used.length !== names.length) return null;

    // The rebuilt date and quantity columns must hold dates and quantities.
    const col = (name: string) => used[names.indexOf(name)];
    const share = (c: number, ok: (v: string) => boolean) => body.filter(r => ok(text(r[c]))).length / body.length;
    if (share(col("Issue Date"), v => /^\d{8}$/.test(v) || /^\d{5}$/.test(v)) < 0.9) return null;
    if (share(col("Issue Qty"), v => v !== "" && Number.isFinite(Number(v))) < 0.9) return null;

    return [names, ...body.map(r => used.map(c => r[c] ?? null))];
}

export type SheetLayout = "pipe-delimited" | "split-headings" | "headings-lower-down";

/**
 * Bring any of the known report layouts into one shape: headings on the first
 * row, one column per field. Returns the sheet unchanged (layout null) when it
 * is already in that shape or is not recognised at all.
 */
export function normaliseSheet(sheet: XLSX.WorkSheet): { sheet: XLSX.WorkSheet; layout: SheetLayout | null } {
    const piped = unpipeSheet(sheet);
    if (piped) return { sheet: piped, layout: "pipe-delimited" };

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true, blankrows: true }) as Cell[][];
    let at = -1;
    for (let i = 0; i < Math.min(rows.length, 6); i++) if (matches(rows[i]) >= 3) { at = i; break; }
    if (at < 0) return { sheet, layout: null };

    // A split heading row still carries enough whole words ("Tank", "Pump", "Activity") to be found above.
    const fixed = repairSplitHeadings(rows.slice(at));
    if (fixed) return { sheet: XLSX.utils.aoa_to_sheet(fixed), layout: "split-headings" };
    if (at > 0) return { sheet: XLSX.utils.aoa_to_sheet(rows.slice(at)), layout: "headings-lower-down" };
    return { sheet, layout: null };
}
