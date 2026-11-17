import { prisma } from "@/lib/prisma";
import { getStockReadings, type StockReading } from "@/lib/stock-readings";

/**
 * The tank register and the level in each tank.
 *
 * A level starts from a known stock at the end of a day: a physical dip
 * reading, or the closing stock on the stores report (HR440), whichever is
 * later (the dip wins a tie, being physical). From there it is that stock,
 * plus receipts booked into the tank, less issues drawn from it. If that sum
 * goes below zero or above the tank's capacity, the records cannot be right —
 * usually a receipt that was never uploaded — and the page says so instead of
 * drawing a level.
 */

export type Tank = {
    tankNo: string;
    fuelType: string;
    name: string | null;
    capacityLitres: number | null;
    reorderLitres: number | null;
};

export type TankDip = { id: string; tankNo: string; day: string; litres: number; createdBy: string | null };

/** Where the starting stock came from. */
export type LevelBasis = { kind: "dip" | "stores-report"; day: string; litres: number };

export type TankLevel = Tank & {
    /** Latest dip on or before the as-of day. */
    dip: TankDip | null;
    /** Latest stores-report closing stock on or before the as-of day. */
    stock: StockReading | null;
    /** The stock the level is counted from: the later of the dip and the stores-report figure. */
    basis: LevelBasis | null;
    /** The stores system's maximum stock level for this tank, when the report gives one. */
    reportMax: number | null;
    receivedSince: number;
    issuedSince: number;
    /** Local day of the last receipt booked into this tank, if any. */
    lastReceiptDay: string | null;
    /** Average litres issued per day over the 30 days up to the as-of day. */
    dailyIssue: number;
    status: "no-capacity" | "no-dip" | "ok" | "short" | "over";
    /** Litres in the tank; set only when status is "ok". */
    litres: number | null;
    /** 0–1 of capacity; set only when status is "ok". */
    fill: number | null;
    daysOfCover: number | null;
    belowReorder: boolean;
    /** How far the sum falls below empty ("short") or above capacity ("over"). */
    gapLitres: number | null;
};

/** Pure: the later of a dip and a stores-report figure; the dip wins a tie because it was measured. */
export function chooseBasis(dip: { day: string; litres: number } | null, stock: { day: string; litres: number } | null): LevelBasis | null {
    if (dip && (!stock || dip.day >= stock.day)) return { kind: "dip", day: dip.day, litres: dip.litres };
    if (stock) return { kind: "stores-report", day: stock.day, litres: stock.litres };
    return null;
}

/** Pure: turn a starting stock and the movements since into a level, or say why it cannot be stated. */
export function computeLevel(tank: Tank, dip: { litres: number } | null, receivedSince: number, issuedSince: number, dailyIssue: number): Pick<TankLevel, "status" | "litres" | "fill" | "daysOfCover" | "belowReorder" | "gapLitres"> {
    const none = { litres: null, fill: null, daysOfCover: null, belowReorder: false, gapLitres: null };
    if (!tank.capacityLitres || tank.capacityLitres <= 0) return { status: "no-capacity", ...none };
    if (!dip) return { status: "no-dip", ...none };
    const litres = dip.litres + receivedSince - issuedSince;
    // A litre or two either way is rounding in the source reports, not a missing delivery.
    if (litres < -1) return { status: "short", ...none, gapLitres: -litres };
    if (litres > tank.capacityLitres * 1.02) return { status: "over", ...none, gapLitres: litres - tank.capacityLitres };
    const held = Math.max(0, Math.min(litres, tank.capacityLitres));
    return {
        status: "ok",
        litres: held,
        fill: held / tank.capacityLitres,
        daysOfCover: dailyIssue > 0 ? held / dailyIssue : null,
        belowReorder: tank.reorderLitres != null && held <= tank.reorderLitres,
        gapLitres: null,
    };
}

const q = (sql: string, ...params: unknown[]) => prisma.$queryRawUnsafe(sql, ...params) as Promise<Record<string, unknown>[]>;

export async function getTanks(): Promise<Tank[]> {
    const rows = await (prisma as any).tankDefinition.findMany({ orderBy: { tankNo: "asc" } });
    return rows.map((r: any) => ({ tankNo: r.tankNo, fuelType: r.fuelType, name: r.name ?? null, capacityLitres: r.capacityLitres ?? null, reorderLitres: r.reorderLitres ?? null }));
}

export async function getDips(): Promise<TankDip[]> {
    try {
        const rows = await (prisma as any).tankDip.findMany({ orderBy: [{ tankNo: "asc" }, { day: "desc" }] });
        return rows.map((r: any) => ({ id: r.id, tankNo: r.tankNo, day: r.day, litres: r.litres, createdBy: r.createdBy ?? null }));
    } catch { return []; }
}

/** Stores that appear on the fuel reports but are not in the tank register yet. */
export async function getUnregisteredStores(): Promise<{ storeNo: string; issues: number; litres: number }[]> {
    const rows = await q(`
        SELECT trim(t.storeNo) AS storeNo, COUNT(*) AS issues, SUM(t.transQty) AS litres
        FROM FuelTransaction t
        WHERE t.transType IN ('FIS','FRE') AND trim(t.storeNo) != ''
          AND NOT EXISTS (SELECT 1 FROM TankDefinition d WHERE d.tankNo = trim(t.storeNo))
        GROUP BY trim(t.storeNo) ORDER BY litres DESC`);
    return rows.map(r => ({ storeNo: String(r.storeNo), issues: Number(r.issues), litres: Number(r.litres || 0) }));
}

/** The level in every registered tank as of a local day (default: the latest day with any movement). */
export async function getTankLevels(asOfDay?: string): Promise<{ asOfDay: string; tanks: TankLevel[] }> {
    const [tanks, dips, stock] = await Promise.all([getTanks(), getDips(), getStockReadings()]);
    const asOf = asOfDay ?? String((await q(`SELECT date(MAX(transDate), 'localtime') AS d FROM FuelTransaction WHERE transType IN ('FIS','FRE')`))[0]?.d ?? new Date().toISOString().slice(0, 10));

    const out: TankLevel[] = [];
    for (const tank of tanks) {
        const dip = dips.find(d => d.tankNo === tank.tankNo && d.day <= asOf) ?? null;   // dips are newest first
        const mine = stock.filter(r => r.tankNo === tank.tankNo);                         // also newest first
        const reading = mine.find(r => r.day <= asOf) ?? null;
        const basis = chooseBasis(dip, reading);
        const since = basis?.day ?? "0000-00-00";
        const [moves, last, recent] = await Promise.all([
            q(`SELECT transType AS type, SUM(transQty) AS litres FROM FuelTransaction
               WHERE trim(storeNo) = ? AND transType IN ('FIS','FRE')
                 AND date(transDate, 'localtime') > ? AND date(transDate, 'localtime') <= ? GROUP BY transType`, tank.tankNo, since, asOf),
            q(`SELECT date(MAX(transDate), 'localtime') AS d FROM FuelTransaction WHERE trim(storeNo) = ? AND transType = 'FRE'`, tank.tankNo),
            q(`SELECT SUM(transQty) AS litres FROM FuelTransaction
               WHERE trim(storeNo) = ? AND transType = 'FIS'
                 AND date(transDate, 'localtime') > date(?, '-30 day') AND date(transDate, 'localtime') <= ?`, tank.tankNo, asOf, asOf),
        ]);
        const receivedSince = basis ? Number(moves.find(m => m.type === "FRE")?.litres || 0) : 0;
        const issuedSince = basis ? Number(moves.find(m => m.type === "FIS")?.litres || 0) : 0;
        const dailyIssue = Number(recent[0]?.litres || 0) / 30;
        out.push({
            ...tank, dip, stock: reading ? { tankNo: reading.tankNo, day: reading.day, litres: reading.litres, reportMax: reading.reportMax } : null,
            basis, reportMax: (reading ?? mine[0])?.reportMax ?? null,
            receivedSince, issuedSince,
            lastReceiptDay: (last[0]?.d as string | null) ?? null,
            dailyIssue,
            ...computeLevel(tank, basis, receivedSince, issuedSince, dailyIssue),
        });
    }
    return { asOfDay: asOf, tanks: out };
}

/**
 * Issues and receipts from a tank whose fuel type the report did not carry
 * take the tank's fuel type. Only rows marked "Unknown" are touched; a fuel
 * type that was recorded is never overwritten. Returns how many rows changed.
 */
export async function classifyUnknownFuel(tankNo: string, fuelType: string): Promise<number> {
    const n = await prisma.$executeRawUnsafe(
        `UPDATE FuelTransaction SET fuelType = ? WHERE trim(storeNo) = ? AND fuelType = 'Unknown'`, fuelType, tankNo);
    return Number(n);
}

/** Tank number to the name given in the register, for showing next to the number. */
export async function getTankNames(): Promise<Record<string, string>> {
    const names: Record<string, string> = {};
    for (const t of await getTanks()) if (t.name) names[t.tankNo] = t.name;
    return names;
}
