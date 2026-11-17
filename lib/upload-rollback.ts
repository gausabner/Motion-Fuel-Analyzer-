import { prisma } from "@/lib/prisma";
import { invalidateFillCache } from "@/lib/fuel-insights";
import { rebuildStockReadings } from "@/lib/stock-readings";

/**
 * Undo an upload: remove exactly the rows it added.
 *
 * Only rows stamped with the upload's id are touched, so this cannot reach
 * data that came from another file. Uploads made before rows were stamped
 * have nothing linked and cannot be rolled back this way.
 *
 * What is NOT undone, and the caller says so: supplier orders this upload only
 * updated (their earlier values are not kept), and cost centres that were
 * registered automatically from its vote numbers.
 */
export type RollbackCount = { transactions: number; deliveries: number };

export async function countLinkedRows(uploadId: string): Promise<RollbackCount> {
    const [t, d] = await Promise.all([
        prisma.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM FuelTransaction WHERE uploadId = ?`, uploadId) as Promise<{ n: number | bigint }[]>,
        prisma.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM FuelDelivery WHERE uploadId = ?`, uploadId) as Promise<{ n: number | bigint }[]>,
    ]);
    return { transactions: Number(t[0]?.n || 0), deliveries: Number(d[0]?.n || 0) };
}

export async function rollbackUpload(uploadId: string, by: string | null): Promise<RollbackCount> {
    const before = await countLinkedRows(uploadId);
    await prisma.$transaction(async tx => {
        // The daily consumption aggregates were incremented when these issues went in; take the same amounts back out.
        const daily = (await tx.$queryRawUnsafe(`
            SELECT substr(transDate, 1, 10) AS day, fuelType, SUM(transQty) AS vol, SUM(transAmt) AS cost, COUNT(*) AS n
            FROM FuelTransaction WHERE uploadId = ? AND isIssue = 1 GROUP BY day, fuelType`, uploadId)) as { day: string; fuelType: string; vol: number; cost: number; n: number | bigint }[];
        for (const r of daily) {
            await tx.$executeRawUnsafe(`
                UPDATE DailyFuelStats
                SET totalVolume = MAX(0, totalVolume - ?), totalCost = MAX(0, totalCost - ?), transactionCount = MAX(0, transactionCount - ?)
                WHERE (CASE WHEN typeof(date) = 'integer' THEN date(date / 1000, 'unixepoch') ELSE substr(date, 1, 10) END) = ? AND fuelType = ?`, Number(r.vol || 0), Number(r.cost || 0), Number(r.n), r.day, r.fuelType);
        }
        await tx.$executeRawUnsafe(`DELETE FROM FuelTransaction WHERE uploadId = ?`, uploadId);
        await tx.$executeRawUnsafe(`DELETE FROM FuelDelivery WHERE uploadId = ?`, uploadId);
        await (tx as any).uploadedFile.update({ where: { id: uploadId }, data: { rolledBackAt: new Date(), rolledBackBy: by } });
    });
    invalidateFillCache();
    // A day's stock may also be on an earlier upload of the same report, so rebuild rather than only delete.
    const stock = await (prisma as any).stockReading.count({ where: { uploadId } }).catch(() => 0);
    if (stock > 0) await rebuildStockReadings().catch(e => console.warn(`[Rollback] Stock readings not rebuilt: ${e.message}`));
    return before;
}
