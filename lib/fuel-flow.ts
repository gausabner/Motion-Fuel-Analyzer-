import { prisma } from "@/lib/prisma";
import { txFilters, type TxFilterOpts } from "@/lib/analytics";

/**
 * Fuel in versus fuel out.
 *
 * OUT is FIS: fuel issued from tanks to vehicles (FuelTransaction, ISO-text
 * dates, filtered by raw string SQL like the rest of analytics).
 *
 * IN is HR640 deliveries (FuelDelivery, real DateTime, queried only through
 * Prisma). Deliveries are used rather than the HR580 FRE receipts because the
 * two describe the SAME physical deliveries — an order raised, then fuel landing
 * in a tank about ten days later — and HR640 covers every month FRE does plus
 * eight more. They are never summed. FRE keeps its own role: it is the only
 * source that says which TANK a delivery went into.
 */

export type Granularity = "daily" | "monthly" | "yearly";

const KEY_LEN: Record<Granularity, number> = { daily: 10, monthly: 7, yearly: 4 };

export type FlowBucket = {
    key: string;
    issuedLitres: number;
    receivedLitres: number;
    issueCount: number;
    deliveryCount: number;
    /** What the fuel was bought for (HR640 GRN cost). */
    receivedCost: number;
    /** What the fleet was charged for it (FIS transaction value). */
    issuedValue: number;
};

/** Issued vs received, bucketed by day, month or year. */
export async function getFlowSeries(
    granularity: Granularity = "monthly",
    opts: TxFilterOpts = {}
): Promise<FlowBucket[]> {
    const len = KEY_LEN[granularity];
    const { clause, params } = txFilters(opts);

    const issued = await prisma.$queryRawUnsafe(`
        SELECT substr(transDate, 1, ${len}) AS k,
               SUM(transQty) AS litres, SUM(transAmt) AS value, COUNT(id) AS n
        FROM FuelTransaction
        WHERE transType = 'FIS'${clause}
        GROUP BY k
    `, ...params) as { k: string; litres: number; value: number; n: number | bigint }[];

    const deliveries = await prisma.fuelDelivery.findMany({
        where: {
            grnQty: { gt: 0 },
            ...(opts.from || opts.to ? {
                orderDate: {
                    ...(opts.from ? { gte: new Date(opts.from) } : {}),
                    ...(opts.to ? { lte: endOfDay(opts.to) } : {}),
                },
            } : {}),
            ...(opts.fuelType && opts.fuelType !== "all"
                ? { fuelType: { contains: opts.fuelType } } : {}),
        },
        select: { orderDate: true, grnQty: true, grnCost: true },
    });

    const map = new Map<string, FlowBucket>();
    const bucket = (k: string) => {
        let b = map.get(k);
        if (!b) {
            b = { key: k, issuedLitres: 0, receivedLitres: 0, issueCount: 0, deliveryCount: 0, receivedCost: 0, issuedValue: 0 };
            map.set(k, b);
        }
        return b;
    };
    for (const r of issued) {
        const b = bucket(r.k);
        b.issuedLitres += r.litres || 0;
        b.issuedValue += r.value || 0;
        b.issueCount += Number(r.n);
    }
    for (const d of deliveries) {
        const b = bucket(d.orderDate.toISOString().slice(0, len));
        b.receivedLitres += d.grnQty;
        b.receivedCost += d.grnCost;
        b.deliveryCount += 1;
    }

    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function endOfDay(to: string): Date {
    const d = new Date(to);
    d.setHours(23, 59, 59, 999);
    return d;
}

const median = (xs: number[]): number | null => {
    if (xs.length === 0) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const DAY_MS = 86_400_000;

/**
 * Median days between raising an order (HR640) and the fuel landing in a tank
 * (HR580 FRE), matched on identical litres inside a sane window. Returns null
 * when the two sources do not overlap enough to measure it.
 */
export async function getOrderToTankLeadTime(): Promise<number | null> {
    const [orders, receipts] = await Promise.all([
        prisma.fuelDelivery.findMany({ where: { grnQty: { gt: 0 } }, select: { orderDate: true, grnQty: true } }),
        prisma.$queryRawUnsafe(`
            SELECT transDate, transQty FROM FuelTransaction WHERE transType = 'FRE'
        `) as Promise<{ transDate: string; transQty: number }[]>,
    ]);

    const lags: number[] = [];
    for (const o of orders) {
        const t0 = o.orderDate.getTime();
        const hit = receipts
            .filter(r => Math.abs(r.transQty - o.grnQty) < 0.5)
            .map(r => (new Date(r.transDate).getTime() - t0) / DAY_MS)
            .filter(lag => lag >= 0 && lag <= 45)
            .sort((a, b) => a - b)[0];
        if (hit !== undefined) lags.push(Math.round(hit));
    }
    return lags.length >= 5 ? median(lags) : null;
}

export type FuelForecast = {
    fuelType: string;
    deliveries: number;
    avgDeliveryLitres: number;
    observedGapDays: number | null;
    burnLitresPerDay: number;
    /** Delivery size divided by burn rate — a consumption-derived cadence. */
    cycleDays: number | null;
    lastDelivery: Date | null;
    nextDue: Date | null;
    orderBy: Date | null;
    /**
     * ok        — forecast is current.
     * stale     — delivery records stop well before the fuel-issue records, so
     *             "overdue" would be a reporting gap, not a dry tank.
     * insufficient — too few deliveries to say anything.
     */
    status: "ok" | "stale" | "insufficient";
    daysSinceLastDelivery: number | null;
};

const MIN_DELIVERIES = 3;

/**
 * Per-fuel replenishment forecast.
 *
 * Per fuel type rather than per tank: HR640 carries no tank, and FRE — which
 * does — only covers four of the twelve months, so a per-tank forecast would be
 * mostly blank.
 *
 * A true "days to empty" is not computable: recorded deliveries do not cover the
 * whole issue history, so every tank's net balance is deeply negative and the
 * actual stock level is unknown. This instead asks how long a typical delivery
 * lasts at the measured burn rate, which the data corroborates well — for diesel
 * the derived cycle and the observed gap agree to within a rounding error.
 */
export async function getReplenishmentForecast(
    opts: TxFilterOpts = {},
    now: Date = new Date()
): Promise<{
    forecasts: FuelForecast[];
    leadTimeDays: number | null;
    latestIssueDate: string | null;
    latestDeliveryDate: Date | null;
}> {
    // Burn is measured over the filtered range when there is one, and over a
    // trailing window otherwise — a rate has to come from somewhere, and the
    // whole history would understate today's consumption.
    const scoped = Boolean(opts.from || opts.to);
    const { clause, params } = txFilters(opts);
    const burnWhere = scoped ? clause : ` AND transDate >= date('now','-120 day')`;
    const burnParams = scoped ? params : [];

    const [deliveries, burnRows, latestIssueRow, leadTimeDays] = await Promise.all([
        prisma.fuelDelivery.findMany({
            where: {
                grnQty: { gt: 0 },
                ...(opts.from || opts.to ? {
                    orderDate: {
                        ...(opts.from ? { gte: new Date(opts.from) } : {}),
                        ...(opts.to ? { lte: endOfDay(opts.to) } : {}),
                    },
                } : {}),
                ...(opts.fuelType && opts.fuelType !== "all"
                    ? { fuelType: { contains: opts.fuelType } } : {}),
            },
            select: { orderDate: true, grnQty: true, fuelType: true },
            orderBy: { orderDate: "asc" },
        }),
        prisma.$queryRawUnsafe(`
            SELECT CASE WHEN lower(fuelType) LIKE '%petrol%' THEN 'Petrol' ELSE 'Diesel' END AS ft,
                   SUM(transQty) AS litres,
                   MIN(substr(transDate,1,10)) AS first_day,
                   MAX(substr(transDate,1,10)) AS last_day
            FROM FuelTransaction
            WHERE transType = 'FIS'${burnWhere}
            GROUP BY ft
        `, ...burnParams) as Promise<{ ft: string; litres: number; first_day: string; last_day: string }[]>,
        prisma.$queryRawUnsafe(`
            SELECT MAX(substr(transDate,1,10)) AS d FROM FuelTransaction
            WHERE transType = 'FIS'${clause}
        `, ...params) as Promise<{ d: string | null }[]>,
        getOrderToTankLeadTime(),
    ]);

    const latestIssueDate = latestIssueRow[0]?.d ?? null;

    // Burn rate over the window actually covered by the rows, not a nominal 120.
    const burn = new Map<string, number>();
    for (const r of burnRows) {
        const days = Math.max(1,
            (new Date(r.last_day).getTime() - new Date(r.first_day).getTime()) / DAY_MS + 1);
        burn.set(r.ft, (r.litres || 0) / days);
    }

    const byFuel = new Map<string, { orderDate: Date; grnQty: number }[]>();
    for (const d of deliveries) {
        const list = byFuel.get(d.fuelType) || [];
        list.push({ orderDate: d.orderDate, grnQty: d.grnQty });
        byFuel.set(d.fuelType, list);
    }

    const latestDeliveryDate = deliveries.length
        ? deliveries[deliveries.length - 1].orderDate : null;

    const forecasts: FuelForecast[] = [];
    for (const [fuelType, list] of byFuel) {
        const avgDeliveryLitres = list.reduce((s, d) => s + d.grnQty, 0) / list.length;
        const gaps: number[] = [];
        for (let i = 1; i < list.length; i++) {
            gaps.push((list[i].orderDate.getTime() - list[i - 1].orderDate.getTime()) / DAY_MS);
        }
        const burnLitresPerDay = burn.get(fuelType) ?? 0;
        const cycleDays = burnLitresPerDay > 0 ? avgDeliveryLitres / burnLitresPerDay : null;
        const lastDelivery = list[list.length - 1].orderDate;
        const nextDue = cycleDays
            ? new Date(lastDelivery.getTime() + cycleDays * DAY_MS) : null;
        const orderBy = nextDue && leadTimeDays !== null
            ? new Date(nextDue.getTime() - leadTimeDays * DAY_MS) : nextDue;

        const daysSinceLastDelivery = Math.floor((now.getTime() - lastDelivery.getTime()) / DAY_MS);

        // If deliveries stop long before the issue records do, the silence is a
        // reporting gap. Saying "overdue" there would cry wolf on every fuel.
        const issueLag = latestIssueDate
            ? (new Date(latestIssueDate).getTime() - lastDelivery.getTime()) / DAY_MS : 0;
        const status: FuelForecast["status"] =
            list.length < MIN_DELIVERIES ? "insufficient"
                : (cycleDays !== null && issueLag > cycleDays * 2) ? "stale"
                    : "ok";

        forecasts.push({
            fuelType, deliveries: list.length, avgDeliveryLitres,
            observedGapDays: median(gaps), burnLitresPerDay, cycleDays,
            lastDelivery, nextDue, orderBy, status, daysSinceLastDelivery,
        });
    }

    forecasts.sort((a, b) => b.burnLitresPerDay - a.burnLitresPerDay);
    return { forecasts, leadTimeDays, latestIssueDate, latestDeliveryDate };
}

export type CostSummary = {
    /** Spend on fuel actually received, from the HR640 GRN cost. */
    receivedCost: number;
    receivedLitres: number;
    /** Weighted purchase price. */
    purchasePerLitre: number | null;
    /** What the fleet was charged, per litre, over the same buckets. */
    issuePerLitre: number | null;
    /**
     * Issue price minus purchase price. Negative means fuel is being issued for
     * less than it cost to buy, so the difference is not being recovered.
     */
    recoveryPerLitre: number | null;
    /** Unrecovered (or surplus) value across the litres actually issued. */
    recoveryTotal: number | null;
    /** Purchase price at the start and end of the covered range. */
    firstPurchasePerLitre: number | null;
    lastPurchasePerLitre: number | null;
    priceChangePct: number | null;
    /** Orders raised with nothing received against them yet. */
    outstandingOrders: number;
    outstandingLitres: number;
    /**
     * Whether the headline figure is hiding a change of direction.
     *
     * A period average can read healthy while every recent period is negative:
     * across the full year recovery averages positive, yet the last quarter is
     * squarely negative. This reports the current unbroken run of same-signed
     * periods, and flags a reversal when that run's sign is opposite the average.
     */
    recoveryTrend: RecoveryTrend | null;
};

export type RecoveryTrend = {
    /** Length of the current unbroken run of same-signed periods. */
    periods: number;
    /** First period in that run. */
    since: string;
    /** Litre-weighted recovery across the run. */
    recentPerLitre: number;
    recentTotal: number;
    /** The run's sign is opposite the period average — the average hides it. */
    reversal: boolean;
    direction: "improving" | "worsening" | "flat";
};

/**
 * Finds the trailing run of periods that share a sign, so a recent, consistent
 * change of direction can be reported rather than averaged away.
 */
export function analyseRecoveryTrend(
    series: FlowBucket[],
    overallPerLitre: number | null
): RecoveryTrend | null {
    const usable = series
        .filter(b => b.receivedLitres > 0 && b.issuedLitres > 0)
        .map(b => ({
            key: b.key,
            perLitre: b.issuedValue / b.issuedLitres - b.receivedCost / b.receivedLitres,
            litres: b.issuedLitres,
        }));
    if (usable.length < 2 || overallPerLitre === null) return null;

    const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0);
    const lastSign = sign(usable[usable.length - 1].perLitre);
    if (lastSign === 0) return null;

    let start = usable.length - 1;
    while (start > 0 && sign(usable[start - 1].perLitre) === lastSign) start--;
    const run = usable.slice(start);

    const litres = run.reduce((s, r) => s + r.litres, 0);
    const recentTotal = run.reduce((s, r) => s + r.perLitre * r.litres, 0);
    const recentPerLitre = litres > 0 ? recentTotal / litres : 0;

    // Compare the run against everything before it, not against itself.
    const earlier = usable.slice(0, start);
    const earlierLitres = earlier.reduce((s, r) => s + r.litres, 0);
    const earlierPerLitre = earlierLitres > 0
        ? earlier.reduce((s, r) => s + r.perLitre * r.litres, 0) / earlierLitres
        : null;

    return {
        periods: run.length,
        since: run[0].key,
        recentPerLitre,
        recentTotal,
        // Only a reversal if the average genuinely points the other way.
        reversal: run.length >= 2 && sign(overallPerLitre) !== 0 && sign(overallPerLitre) !== lastSign,
        direction: earlierPerLitre === null || Math.abs(recentPerLitre - earlierPerLitre) < 0.005
            ? "flat"
            : recentPerLitre > earlierPerLitre ? "improving" : "worsening",
    };
}

/**
 * Cost view of the same buckets. Purchase price comes from the delivery report,
 * issue price from the transactions the fleet is charged for — the gap between
 * them is the part worth watching.
 */
export async function getCostSummary(
    series: FlowBucket[],
    opts: TxFilterOpts = {}
): Promise<CostSummary> {
    const receivedCost = series.reduce((s, b) => s + b.receivedCost, 0);
    const receivedLitres = series.reduce((s, b) => s + b.receivedLitres, 0);
    const issuedValue = series.reduce((s, b) => s + b.issuedValue, 0);
    const issuedLitres = series.reduce((s, b) => s + b.issuedLitres, 0);

    const purchasePerLitre = receivedLitres > 0 ? receivedCost / receivedLitres : null;
    const issuePerLitre = issuedLitres > 0 ? issuedValue / issuedLitres : null;
    const recoveryPerLitre =
        purchasePerLitre !== null && issuePerLitre !== null ? issuePerLitre - purchasePerLitre : null;

    // Price trend across buckets that actually had a delivery.
    const priced = series.filter(b => b.receivedLitres > 0)
        .map(b => b.receivedCost / b.receivedLitres);
    const firstPurchasePerLitre = priced.length ? priced[0] : null;
    const lastPurchasePerLitre = priced.length ? priced[priced.length - 1] : null;
    const priceChangePct =
        firstPurchasePerLitre && lastPurchasePerLitre
            ? ((lastPurchasePerLitre - firstPurchasePerLitre) / firstPurchasePerLitre) * 100
            : null;

    const outstanding = await prisma.fuelDelivery.findMany({
        where: {
            grnQty: { lte: 0 },
            ...(opts.from || opts.to ? {
                orderDate: {
                    ...(opts.from ? { gte: new Date(opts.from) } : {}),
                    ...(opts.to ? { lte: endOfDay(opts.to) } : {}),
                },
            } : {}),
        },
        select: { orderQty: true },
    });

    return {
        receivedCost, receivedLitres, purchasePerLitre, issuePerLitre,
        recoveryPerLitre,
        recoveryTrend: analyseRecoveryTrend(series, recoveryPerLitre),
        recoveryTotal: recoveryPerLitre !== null ? recoveryPerLitre * issuedLitres : null,
        firstPurchasePerLitre, lastPurchasePerLitre, priceChangePct,
        outstandingOrders: outstanding.length,
        outstandingLitres: outstanding.reduce((s, o) => s + o.orderQty, 0),
    };
}
