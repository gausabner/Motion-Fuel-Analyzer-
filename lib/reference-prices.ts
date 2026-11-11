import { prisma } from "@/lib/prisma";
import { txFilters, type TxFilterOpts } from "@/lib/analytics";

/**
 * Reference prices with a history. A price applies from its effective date
 * until the next one for the same fuel, so an issue is always compared with
 * the price that was in force on the day it happened.
 */
export type ReferencePrice = { id: string; fuel: "Petrol" | "Diesel"; price: number; effectiveFrom: string; createdBy: string | null };

export const FUELS = ["Petrol", "Diesel"] as const;

export async function getPriceHistory(): Promise<ReferencePrice[]> {
    try {
        const rows = await (prisma as any).referencePrice.findMany({ orderBy: [{ fuel: "asc" }, { effectiveFrom: "desc" }] });
        return rows.map((r: any) => ({ id: r.id, fuel: r.fuel, price: r.price, effectiveFrom: r.effectiveFrom, createdBy: r.createdBy ?? null }));
    } catch {
        return [];
    }
}

/** The price in force for a fuel on a local day (YYYY-MM-DD), or null before the first entry. */
export function priceOn(history: ReferencePrice[], fuel: string, day: string): number | null {
    let best: ReferencePrice | null = null;
    for (const p of history) {
        if (p.fuel !== fuel || p.effectiveFrom > day) continue;
        if (!best || p.effectiveFrom > best.effectiveFrom) best = p;
    }
    return best ? best.price : null;
}

/** The latest price per fuel as of today, kept in SystemSettings for anything that reads the flat fields. */
export async function syncCurrentPrices(): Promise<void> {
    const history = await getPriceHistory();
    const today = new Date().toISOString().slice(0, 10);
    const petrolPrice = priceOn(history, "Petrol", today) ?? 0;
    const dieselPrice = priceOn(history, "Diesel", today) ?? 0;
    await prisma.systemSettings.upsert({
        where: { id: "global" },
        update: { petrolPrice, dieselPrice },
        create: { id: "global", petrolPrice, dieselPrice },
    });
}

export type ReferenceComparison = {
    /** Litres that had a reference price on their day. */
    coveredLitres: number;
    /** What those litres actually cost. */
    actualCost: number;
    /** What they would have cost at the reference prices in force. */
    referenceCost: number;
    /** Litres with no reference price to compare with (before the first entry, or fuel type not recorded). */
    uncoveredLitres: number;
};

/** Issued fuel in the selection, priced at the reference rate in force on each day. */
export async function getReferenceComparison(opts: TxFilterOpts = {}): Promise<ReferenceComparison> {
    const history = await getPriceHistory();
    const { clause, params } = txFilters(opts);
    const rows = (await prisma.$queryRawUnsafe(`
        SELECT date(transDate, 'localtime') AS day, fuelType, SUM(transQty) AS qty, SUM(transAmt) AS amt
        FROM FuelTransaction
        WHERE transType = 'FIS'${clause}
        GROUP BY day, fuelType
    `, ...params)) as { day: string; fuelType: string; qty: number; amt: number }[];

    const out: ReferenceComparison = { coveredLitres: 0, actualCost: 0, referenceCost: 0, uncoveredLitres: 0 };
    for (const r of rows) {
        const fuel = /petrol/i.test(r.fuelType) ? "Petrol" : /diesel/i.test(r.fuelType) ? "Diesel" : null;
        const ref = fuel ? priceOn(history, fuel, r.day) : null;
        const qty = Number(r.qty) || 0;
        if (ref == null) { out.uncoveredLitres += qty; continue; }
        out.coveredLitres += qty;
        out.actualCost += Number(r.amt) || 0;
        out.referenceCost += qty * ref;
    }
    return out;
}
