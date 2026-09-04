import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

/**
 * HR640 — the fuel procurement report: purchase orders and their goods-received
 * notes. One row is an ORDER, not a tank receipt.
 *
 * Deliberately kept out of FuelTransaction. HR640 and the HR580 FRE receipts
 * describe the SAME physical deliveries at two stages (order raised, then fuel
 * lands in a tank a median of 10 days later), so they overlap wherever both
 * exist and must never be summed.
 *
 * Real-world quirks this parser handles, all present in the sample workbook:
 *   - "O Date" is an INTEGER yyyymmdd (20250701) — not a date, and not an Excel
 *     serial. Read as a serial it lands somewhere around the year 57,000.
 *   - Every numeric arrives space-padded ("       25033.000").
 *   - Header names carry trailing spaces ("Order No  ").
 *   - The sheet is named "hr640" in a file named Hr440, so nothing keys off the
 *     sheet name — detection is by header signature only.
 */

export type DeliveryFormat = "hr640" | "hr940";

export type Hr640Row = {
    orderNo: string;
    orderDate: Date;
    suppRef: string | null;
    suppName: string;
    itemCode: string;
    itemDesc: string;
    fuelType: string;
    orderQty: number;
    orderCost: number;
    grnQty: number;
    grnCost: number;
    /** HR940 only; null when the column is absent. */
    canOrd: string | null;
    canItem: string | null;
    invQty: number | null;
    returnQty: number | null;
};

const norm = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => {
    const n = Number(norm(v).replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
};

/** yyyymmdd, as an integer or a string. Returns null if it isn't a real date. */
export function parseYmdInt(value: unknown): Date | null {
    const s = norm(value);
    if (!/^\d{8}$/.test(s)) return null;
    const y = Number(s.slice(0, 4)), m = Number(s.slice(4, 6)), d = Number(s.slice(6, 8));
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    // Round-trip guard: rejects 20250231 and friends.
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return dt;
}

export function normaliseFuelType(itemDesc: string, itemCode: string): string {
    const s = `${itemDesc} ${itemCode}`.toLowerCase();
    if (s.includes("diesel")) return "Diesel";
    if (s.includes("petrol") || s.includes("unleaded")) return "Petrol";
    return "Unknown";
}

/**
 * Which delivery report a sheet is, or null when it is neither.
 *
 * HR940 is a superset of HR640 — the same order and goods-received columns plus
 * cancellation, invoiced and returned quantities — so it is identified by those
 * extra columns and read by the same parser. Routing is header-driven: a sheet
 * matching neither falls through to the HR580 transaction parser.
 */
export function detectDeliveryFormat(headers: unknown[]): DeliveryFormat | null {
    const h = headers.map(x => norm(x).toLowerCase());
    const has = (name: string) => h.some(v => v === name);
    if (!(has("order no") && has("grn qty") && (has("supp name") || has("supp ref")))) return null;
    return ["can ord", "can item", "inv qty", "return qty"].some(has) ? "hr940" : "hr640";
}

/** Either delivery report is HR640-shaped as far as parsing is concerned. */
export function isHr640Sheet(headers: unknown[]): boolean {
    return detectDeliveryFormat(headers) !== null;
}

export function parseHr640Sheet(sheet: XLSX.WorkSheet): { rows: Hr640Row[]; errors: string[] } {
    const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }) as unknown[][];
    const rows: Hr640Row[] = [];
    const errors: string[] = [];
    if (raw.length < 2) return { rows, errors };

    const headers = raw[0].map(x => norm(x).toLowerCase());
    const col = (name: string) => headers.indexOf(name);
    const iOrder = col("order no"), iDate = col("o date"), iSuppRef = col("supp ref"),
        iSupp = col("supp name"), iItem = col("item"), iDesc = col("item desc"),
        iOQty = col("order qty"), iOCost = col("ord cost"),
        iGQty = col("grn qty"), iGCost = col("grn cost");
    // HR940 extras; -1 when the column is absent, which is the HR640 case.
    const iCanOrd = col("can ord"), iCanItem = col("can item"),
        iInvQty = col("inv qty"), iReturnQty = col("return qty");
    const optText = (row: unknown[], i: number) => (i < 0 ? null : (norm(row[i]) || null));
    const optNum = (row: unknown[], i: number) => (i < 0 || norm(row[i]) === "" ? null : num(row[i]));

    for (let r = 1; r < raw.length; r++) {
        const row = raw[r];
        if (!row || row.every(c => c === null || norm(c) === "")) continue;

        const orderNo = norm(row[iOrder]);
        if (!orderNo) continue;

        const orderDate = parseYmdInt(row[iDate]);
        if (!orderDate) {
            errors.push(`Row ${r + 1}: unreadable order date "${norm(row[iDate])}"`);
            continue;
        }

        const itemCode = norm(row[iItem]);
        const itemDesc = norm(row[iDesc]);
        rows.push({
            orderNo,
            orderDate,
            suppRef: norm(row[iSuppRef]) || null,
            suppName: norm(row[iSupp]),
            itemCode,
            itemDesc,
            fuelType: normaliseFuelType(itemDesc, itemCode),
            orderQty: num(row[iOQty]),
            orderCost: num(row[iOCost]),
            grnQty: num(row[iGQty]),
            grnCost: num(row[iGCost]),
            canOrd: optText(row, iCanOrd),
            canItem: optText(row, iCanItem),
            invQty: optNum(row, iInvQty),
            returnQty: optNum(row, iReturnQty),
        });
    }
    return { rows, errors };
}

export type Hr640Result = {
    format: DeliveryFormat;
    created: number;
    updated: number;
    totalProcessed: number;
    outstandingOrders: number;
    receivedLitres: number;
    errors: string[];
};

/**
 * Upserts on (orderNo, itemCode) so re-importing a report that now shows a
 * delivered quantity updates the order in place rather than duplicating it —
 * an order legitimately changes from outstanding to received between reports.
 */
export async function importHr640Rows(
    rows: Hr640Row[],
    errors: string[] = [],
    format: DeliveryFormat = "hr640"
): Promise<Hr640Result> {
    let created = 0, updated = 0;
    for (const row of rows) {
        const existing = await prisma.fuelDelivery.findUnique({
            where: { orderNo_itemCode: { orderNo: row.orderNo, itemCode: row.itemCode } },
            select: { id: true },
        });
        await prisma.fuelDelivery.upsert({
            where: { orderNo_itemCode: { orderNo: row.orderNo, itemCode: row.itemCode } },
            update: {
                orderDate: row.orderDate, suppRef: row.suppRef, suppName: row.suppName,
                itemDesc: row.itemDesc, fuelType: row.fuelType,
                orderQty: row.orderQty, orderCost: row.orderCost,
                grnQty: row.grnQty, grnCost: row.grnCost,
                canOrd: row.canOrd, canItem: row.canItem,
                invQty: row.invQty, returnQty: row.returnQty,
            },
            create: row,
        });
        existing ? updated++ : created++;
    }
    return {
        format,
        created,
        updated,
        totalProcessed: rows.length,
        // Ordered but not yet delivered — real commitments, kept out of received totals.
        outstandingOrders: rows.filter(r => r.grnQty === 0).length,
        receivedLitres: rows.reduce((sum, r) => sum + r.grnQty, 0),
        errors,
    };
}
