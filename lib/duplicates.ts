import { prisma } from "@/lib/prisma";
import { getBareIssues, invalidateFillCache } from "@/lib/fuel-insights";

/**
 * Removing a duplicate takes the stores-report copy of an issue out of every
 * total while the pump-report original stays. Nothing is deleted: the row
 * moves whole to SetAsideTransaction and can be put back.
 *
 * The server checks each row again before moving it: it must still be in the
 * fuel table, still have no vehicle, and still have its twin on the pump
 * report. A request can never remove a row that is not a duplicate.
 */

const COLS = ["id", "storeNo", "pumpNo", "transDate", "transRefNo", "issueTime", "transVoteNo", "transQty", "transAmt",
    "vehicleId", "fleetUnit", "fleetEI", "fleetReading", "jobNo", "activity", "itemCat", "transType", "fuelType", "isIssue", "createdAt", "uploadId"].join(", ");

export const DUPLICATE_KEY = /^no-vehicle:(.+)$/;
const idsOf = (keys: string[]) => [...new Set(keys.map(k => DUPLICATE_KEY.exec(k)?.[1]).filter((v): v is string => !!v))];

export type DuplicateResult = { rows: number; litres: number; skipped: number };

export async function removeDuplicates(keys: string[], by: string | null): Promise<DuplicateResult> {
    const ids = idsOf(keys);
    if (!ids.length) return { rows: 0, litres: 0, skipped: keys.length };
    const confirmed = (await getBareIssues(undefined, ids)).filter(r => r.twin);
    if (!confirmed.length) return { rows: 0, litres: 0, skipped: ids.length };

    await prisma.$transaction(async tx => {
        for (const r of confirmed) {
            await tx.$executeRawUnsafe(
                `INSERT OR IGNORE INTO SetAsideTransaction (${COLS}, reason, twinId, twinUnit, setAsideAt, setAsideBy)
                 SELECT ${COLS}, 'duplicate', ?, ?, ?, ? FROM FuelTransaction WHERE id = ?`,
                r.twin!.id, r.twin!.unit, new Date().toISOString(), by, r.id);
            await tx.$executeRawUnsafe(`DELETE FROM FuelTransaction WHERE id = ? AND id IN (SELECT id FROM SetAsideTransaction)`, r.id);
            // A review made before the removal would otherwise mask the "Resolved" state.
            await tx.$executeRawUnsafe(`DELETE FROM ExceptionReview WHERE key = ?`, `no-vehicle:${r.id}`);
        }
    }, { timeout: 60_000 });
    invalidateFillCache();
    return { rows: confirmed.length, litres: confirmed.reduce((s, r) => s + r.qty, 0), skipped: ids.length - confirmed.length };
}

/** Undo: move removed copies back into the fuel table, exactly as they were. */
export async function restoreDuplicates(keys: string[]): Promise<DuplicateResult> {
    const ids = idsOf(keys);
    if (!ids.length) return { rows: 0, litres: 0, skipped: keys.length };
    const marks = ids.map(() => "?").join(",");
    const rows = (await prisma.$queryRawUnsafe(`SELECT id, transQty FROM SetAsideTransaction WHERE reason = 'duplicate' AND id IN (${marks})`, ...ids)) as { id: string; transQty: number }[];
    if (!rows.length) return { rows: 0, litres: 0, skipped: ids.length };
    await prisma.$transaction(async tx => {
        for (const r of rows) {
            await tx.$executeRawUnsafe(`INSERT OR IGNORE INTO FuelTransaction (${COLS}) SELECT ${COLS} FROM SetAsideTransaction WHERE id = ?`, r.id);
            await tx.$executeRawUnsafe(`DELETE FROM SetAsideTransaction WHERE id = ? AND id IN (SELECT id FROM FuelTransaction)`, r.id);
        }
    }, { timeout: 60_000 });
    invalidateFillCache();
    return { rows: rows.length, litres: rows.reduce((s, r) => s + (Number(r.transQty) || 0), 0), skipped: ids.length - rows.length };
}

export async function getSetAsideSummary(): Promise<{ rows: number; litres: number }> {
    try {
        const r = (await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS n, SUM(transQty) AS l FROM SetAsideTransaction WHERE reason = 'duplicate'`)) as { n: number | bigint; l: number | null }[];
        return { rows: Number(r[0]?.n || 0), litres: Number(r[0]?.l || 0) };
    } catch { return { rows: 0, litres: 0 }; }
}
