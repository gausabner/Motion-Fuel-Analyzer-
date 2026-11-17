import { prisma } from "@/lib/prisma";

/**
 * Oil is not fuel.
 *
 * The pump report (HR580) records oil dispensed from the oil stores as issues,
 * exactly like diesel, and the stores report (HR440) lists oil under item
 * category 1049. Counted as fuel, a top-up of a litre of 15W40 becomes a
 * "fill", and its cost lands in the fuel bill.
 *
 * Rows from a store registered as an oil store, and any issue or receipt with
 * the oil category, are kept in OilTransaction instead: the same columns, so
 * nothing is lost and a row can move back if a store was registered wrongly.
 * Every fuel query reads FuelTransaction, so none of them needs a filter.
 */

export const OIL = "Oil";
export const OIL_ITEM_CATEGORY = "1049";

const COLS = ["id", "storeNo", "pumpNo", "transDate", "transRefNo", "issueTime", "transVoteNo", "transQty", "transAmt",
    "vehicleId", "fleetUnit", "fleetEI", "fleetReading", "jobNo", "activity", "itemCat", "transType", "isIssue", "createdAt", "uploadId"].join(", ");

/** True for a row that belongs with oil: from an oil store, or carrying the oil item category. */
export function isOilRow(storeFuelType: string | undefined, itemCat: string | null | undefined): boolean {
    return storeFuelType === OIL || String(itemCat ?? "").trim() === OIL_ITEM_CATEGORY;
}

export type MoveResult = { rows: number; litres: number };

async function move(fromTable: "FuelTransaction" | "OilTransaction", toTable: "FuelTransaction" | "OilTransaction", where: string, params: unknown[], fuelType: string): Promise<MoveResult> {
    return prisma.$transaction(async tx => {
        const picked = (await tx.$queryRawUnsafe(`SELECT id, transQty FROM ${fromTable} WHERE ${where}`, ...params)) as { id: string; transQty: number }[];
        if (!picked.length) return { rows: 0, litres: 0 };
        await tx.$executeRawUnsafe(`CREATE TEMP TABLE IF NOT EXISTS _moving (id TEXT PRIMARY KEY)`);
        await tx.$executeRawUnsafe(`DELETE FROM _moving`);
        for (let i = 0; i < picked.length; i += 400) {
            const chunk = picked.slice(i, i + 400);
            await tx.$executeRawUnsafe(`INSERT INTO _moving (id) VALUES ${chunk.map(() => "(?)").join(", ")}`, ...chunk.map(r => r.id));
        }
        // INSERT OR IGNORE: a row already present on the other side (same duplicate key) stays where it is.
        await tx.$executeRawUnsafe(`INSERT OR IGNORE INTO ${toTable} (${COLS}, fuelType) SELECT ${COLS}, ? FROM ${fromTable} WHERE id IN (SELECT id FROM _moving)`, fuelType);
        const moved = (await tx.$queryRawUnsafe(`SELECT COUNT(*) AS n, SUM(transQty) AS l FROM ${toTable} WHERE id IN (SELECT id FROM _moving)`)) as { n: number | bigint; l: number | null }[];
        await tx.$executeRawUnsafe(`DELETE FROM ${fromTable} WHERE id IN (SELECT id FROM _moving) AND id IN (SELECT id FROM ${toTable})`);
        await tx.$executeRawUnsafe(`DELETE FROM _moving`);
        return { rows: Number(moved[0]?.n || 0), litres: Number(moved[0]?.l || 0) };
    }, { timeout: 60_000 });
}

/** Move every row from a store out of fuel, into oil. */
export function moveStoreToOil(tankNo: string): Promise<MoveResult> {
    return move("FuelTransaction", "OilTransaction", `trim(storeNo) = ?`, [tankNo], OIL);
}

/** A store registered as oil by mistake: bring its rows back as fuel, except rows that carry the oil category. */
export function moveStoreFromOil(tankNo: string, fuelType: string): Promise<MoveResult> {
    return move("OilTransaction", "FuelTransaction", `trim(storeNo) = ? AND IFNULL(trim(itemCat), '') != '${OIL_ITEM_CATEGORY}'`, [tankNo], fuelType);
}

export type OilSummary = { issues: number; issuedLitres: number; issuedCost: number; receipts: number; receivedLitres: number; stores: string[] };

export async function getOilSummary(): Promise<OilSummary> {
    try {
        const rows = (await prisma.$queryRawUnsafe(`
            SELECT transType AS type, COUNT(*) AS n, SUM(transQty) AS l, SUM(transAmt) AS amt, GROUP_CONCAT(DISTINCT trim(storeNo)) AS stores
            FROM OilTransaction GROUP BY transType`)) as { type: string; n: number | bigint; l: number | null; amt: number | null; stores: string | null }[];
        const fis = rows.find(r => r.type === "FIS"), fre = rows.find(r => r.type === "FRE");
        const stores = [...new Set(rows.flatMap(r => (r.stores ?? "").split(",").filter(Boolean)))].sort();
        return { issues: Number(fis?.n || 0), issuedLitres: Number(fis?.l || 0), issuedCost: Number(fis?.amt || 0), receipts: Number(fre?.n || 0), receivedLitres: Number(fre?.l || 0), stores };
    } catch {
        return { issues: 0, issuedLitres: 0, issuedCost: 0, receipts: 0, receivedLitres: 0, stores: [] };
    }
}
