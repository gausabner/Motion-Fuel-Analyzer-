import fs from "fs/promises";
import path from "path";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { normaliseSheet } from "@/lib/pipe-sheet";

/**
 * Stock on hand from the stores report (HR440).
 *
 * Every HR440 row carries "Tot on Hand Qty": the stores system's running
 * balance for that item in that store after the transaction. The closing
 * balance of a day is the balance after that day's last row. Only fuel items
 * held in litres count; the same report lists oils, paraffin drums, pipe
 * fittings and rags in other stores.
 *
 * It is a book figure: what the stores system believes is in the tank once
 * postings are in. Postings run a few days behind the pump issues, and the
 * figure has never been checked against a dip, so pages call it "stock on the
 * stores report", never "litres in the tank".
 */

/** HR440 item categories that are fuel. 1049 is oil and is never stock in a fuel tank. */
export const FUEL_ITEM_CATEGORIES: Record<string, "Diesel" | "Petrol"> = { "1047": "Diesel", "90001": "Petrol" };

export type StockReading = { tankNo: string; day: string; litres: number; reportMax: number | null };
export type StoredStockReading = StockReading & { uploadId: string | null };

const text = (v: unknown) => (v == null ? "" : String(v).trim());
const number = (v: unknown) => { const t = text(v); if (t === "") return NaN; return Number(t.replace(/,/g, "")); };

/** "20260527", 20260527 or an Excel date serial, to "2026-05-27"; null when it is none of those. */
export function stockDay(v: unknown): string | null {
    const t = text(v);
    if (/^\d{8}$/.test(t)) {
        const y = +t.slice(0, 4), m = +t.slice(4, 6), d = +t.slice(6, 8);
        return m >= 1 && m <= 12 && d >= 1 && d <= 31 && y > 1990 ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : null;
    }
    if (/^\d{5}(\.\d+)?$/.test(t)) {
        const ms = Math.round((Number(t) - 25569) * 86400 * 1000);
        return new Date(ms).toISOString().slice(0, 10);
    }
    return null;
}

/** True when a sheet's rows carry the stores report's running balance. */
export function hasStockOnHand(rows: Record<string, unknown>[]): boolean {
    return rows.length > 0 && Object.keys(rows[0]).some(k => k.trim() === "Tot on Hand Qty");
}

/** Pure: the closing fuel stock per store and day in one stores-report sheet. */
export function extractStockReadings(rows: Record<string, unknown>[]): StockReading[] {
    const balances = new Map<string, Map<string, { litres: number; max: number | null }>>();
    const out = new Map<string, StockReading>();
    for (const raw of rows) {
        const row: Record<string, unknown> = {};
        for (const k of Object.keys(raw)) row[k.trim()] = raw[k];
        if (!FUEL_ITEM_CATEGORIES[text(row["Item Cat"])]) continue;
        // Category 1047 also holds paraffin in 5-litre drums in the general stores; a tank is counted in litres.
        const unit = text(row["UOM Code"]).toUpperCase();
        if (unit && unit !== "LITRE") continue;
        const store = text(row["Store No"]);
        const day = stockDay(row["Trans Date"]);
        const onHand = number(row["Tot on Hand Qty"]);
        if (!store || !day || !Number.isFinite(onHand)) continue;
        const max = number(row["Qty Max"]);
        const items = balances.get(store) ?? new Map();
        items.set(text(row["Item No"]), { litres: onHand, max: Number.isFinite(max) && max > 0 ? max : null });
        balances.set(store, items);
        // Rows are in posting order, so the last one written for a day is that day's closing balance.
        const all = [...items.values()];
        const maxes = all.map(i => i.max).filter((m): m is number => m != null);
        out.set(`${store}|${day}`, {
            tankNo: store, day,
            litres: all.reduce((s, i) => s + i.litres, 0),
            reportMax: maxes.length ? maxes.reduce((s, m) => s + m, 0) : null,
        });
    }
    return [...out.values()];
}

/** Read every stores-report sheet in a workbook. Other sheets are ignored. */
export function stockReadingsFromWorkbook(workbook: XLSX.WorkBook): StockReading[] {
    const found: StockReading[] = [];
    for (const name of workbook.SheetNames) {
        const ws = workbook.Sheets[name];
        if (!ws) continue;
        const rows = XLSX.utils.sheet_to_json(normaliseSheet(ws).sheet) as Record<string, unknown>[];
        if (hasStockOnHand(rows)) found.push(...extractStockReadings(rows));
    }
    return found;
}

/** Store readings; a later upload covering the same tank and day replaces the earlier figure. */
export async function saveStockReadings(readings: StockReading[], uploadId: string | null): Promise<number> {
    for (const r of readings) {
        await (prisma as any).stockReading.upsert({
            where: { tankNo_day: { tankNo: r.tankNo, day: r.day } },
            update: { litres: r.litres, reportMax: r.reportMax, uploadId },
            create: { ...r, uploadId },
        });
    }
    return readings.length;
}

export async function getStockReadings(): Promise<StoredStockReading[]> {
    try {
        const rows = await (prisma as any).stockReading.findMany({ orderBy: [{ tankNo: "asc" }, { day: "desc" }] });
        return rows.map((r: any) => ({ tankNo: r.tankNo, day: r.day, litres: r.litres, reportMax: r.reportMax ?? null, uploadId: r.uploadId ?? null }));
    } catch { return []; }
}

/**
 * Rebuild every reading from the stored files of uploads that are still in
 * effect, oldest first, so the newest upload wins a shared day. Used once to
 * read the reports uploaded before this existed, and after a rollback.
 */
export async function rebuildStockReadings(): Promise<{ files: number; readings: number }> {
    const uploads = await (prisma as any).uploadedFile.findMany({ where: { rolledBackAt: null }, orderBy: { uploadedAt: "asc" } });
    const byKey = new Map<string, StockReading & { uploadId: string }>();
    let files = 0;
    for (const u of uploads) {
        let buffer: Buffer;
        try { buffer = await fs.readFile(path.join(process.cwd(), u.filePath)); } catch { continue; }
        let readings: StockReading[];
        try { readings = stockReadingsFromWorkbook(XLSX.read(buffer, { type: "buffer" })); } catch { continue; }
        if (!readings.length) continue;
        files++;
        for (const r of readings) byKey.set(`${r.tankNo}|${r.day}`, { ...r, uploadId: u.id });
    }
    await prisma.$transaction(async tx => {
        await (tx as any).stockReading.deleteMany({});
        for (const r of byKey.values()) await (tx as any).stockReading.create({ data: r });
    }, { timeout: 60_000 });
    return { files, readings: byKey.size };
}
