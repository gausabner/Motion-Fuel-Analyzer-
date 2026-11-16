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
