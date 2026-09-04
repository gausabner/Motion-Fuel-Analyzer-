import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { getFlowSeries, getReplenishmentForecast, getOrderToTankLeadTime, getCostSummary, analyseRecoveryTrend } from "@/lib/fuel-flow";
import { prisma } from "@/lib/prisma";

const hasDb = fs.existsSync(path.resolve(process.cwd(), "prisma/dev.db"));
const describeDb = hasDb ? describe : describe.skip;

describeDb("getFlowSeries", () => {
    it("buckets by day, month and year at the right key width", async () => {
        for (const [g, len] of [["daily", 10], ["monthly", 7], ["yearly", 4]] as const) {
            const rows = await getFlowSeries(g);
            expect(rows.length).toBeGreaterThan(0);
            expect(rows.every(r => r.key.length === len)).toBe(true);
        }
    });

    it("returns buckets in chronological order", async () => {
        const keys = (await getFlowSeries("monthly")).map(r => r.key);
        expect([...keys].sort()).toEqual(keys);
    });

    it("never merges issued and received into one figure", async () => {
        // The two are separate flows: a month can have deliveries and no issues
        // or vice versa, and summing them would be meaningless.
        const rows = await getFlowSeries("monthly");
        expect(rows.some(r => r.issuedLitres > 0 && r.receivedLitres === 0)).toBe(true);
        for (const r of rows) {
            expect(r.issuedLitres).toBeGreaterThanOrEqual(0);
            expect(r.receivedLitres).toBeGreaterThanOrEqual(0);
        }
    });

    it("counts only delivered orders, never outstanding ones", async () => {
        const received = (await getFlowSeries("yearly")).reduce((s, r) => s + r.receivedLitres, 0);
        const agg = await prisma.fuelDelivery.aggregate({ _sum: { grnQty: true } });
        expect(Math.round(received)).toBe(Math.round(agg._sum.grnQty ?? 0));
    });

    it("narrows when a date range is applied", async () => {
        const all = await getFlowSeries("monthly");
        const scoped = await getFlowSeries("monthly", { from: "2026-01-01", to: "2026-06-30" });
        expect(scoped.length).toBeLessThan(all.length);
        expect(scoped.every(r => r.key >= "2026-01" && r.key <= "2026-06")).toBe(true);
    });
});

describeDb("getReplenishmentForecast", () => {
    it("derives a cycle that corroborates the observed delivery gap", async () => {
        // The whole model rests on these two independent estimates agreeing.
        const { forecasts } = await getReplenishmentForecast();
        const usable = forecasts.filter(f => f.cycleDays && f.observedGapDays);
        expect(usable.length).toBeGreaterThan(0);
        for (const f of usable) {
            const ratio = f.cycleDays! / f.observedGapDays!;
            expect(ratio, `${f.fuelType} cycle ${f.cycleDays} vs observed ${f.observedGapDays}`)
                .toBeGreaterThan(0.5);
            expect(ratio).toBeLessThan(2);
        }
    });

    it("pauses rather than reporting overdue when deliveries lag the issue data", async () => {
        const { forecasts, latestIssueDate, latestDeliveryDate } = await getReplenishmentForecast();
        const lagDays = (new Date(latestIssueDate!).getTime() - latestDeliveryDate!.getTime()) / 86_400_000;
        for (const f of forecasts) {
            if (f.cycleDays && lagDays > f.cycleDays * 2) expect(f.status).toBe("stale");
        }
    });

    it("subtracts the lead time so 'order by' precedes 'next due'", async () => {
        const { forecasts, leadTimeDays } = await getReplenishmentForecast();
        if (leadTimeDays === null) return;
        for (const f of forecasts) {
            if (f.nextDue && f.orderBy) {
                expect(f.orderBy.getTime()).toBeLessThanOrEqual(f.nextDue.getTime());
            }
        }
    });

    it("never claims a forecast from too few deliveries", async () => {
        const { forecasts } = await getReplenishmentForecast();
        for (const f of forecasts) {
            if (f.deliveries < 3) expect(f.status).toBe("insufficient");
        }
    });
});

describeDb("getOrderToTankLeadTime", () => {
    it("measures a plausible order-to-tank lag", async () => {
        const lead = await getOrderToTankLeadTime();
        expect(lead).not.toBeNull();
        expect(lead!).toBeGreaterThanOrEqual(0);
        expect(lead!).toBeLessThanOrEqual(45);
    });
});

describeDb("tank identity", () => {
    it("stores tank numbers trimmed, so one tank is not counted as two", async () => {
        const rows = await prisma.$queryRawUnsafe(
            `SELECT COUNT(DISTINCT storeNo) AS raw, COUNT(DISTINCT trim(storeNo)) AS trimmed FROM FuelTransaction`
        ) as { raw: number | bigint; trimmed: number | bigint }[];
        expect(Number(rows[0].raw)).toBe(Number(rows[0].trimmed));
    });
});

describeDb("getCostSummary", () => {
    it("reports purchase spend that matches the delivery records", async () => {
        const series = await getFlowSeries("monthly");
        const cost = await getCostSummary(series);
        const agg = await prisma.fuelDelivery.aggregate({
            _sum: { grnCost: true }, where: { grnQty: { gt: 0 } },
        });
        expect(Math.round(cost.receivedCost)).toBe(Math.round(agg._sum.grnCost ?? 0));
    });

    it("derives purchase price as a weighted average, not a mean of means", async () => {
        const series = await getFlowSeries("monthly");
        const cost = await getCostSummary(series);
        expect(cost.purchasePerLitre).toBeCloseTo(cost.receivedCost / cost.receivedLitres, 6);
    });

    it("makes recovery the gap between what fuel is charged at and what it cost", async () => {
        const series = await getFlowSeries("monthly");
        const { purchasePerLitre, issuePerLitre, recoveryPerLitre } = await getCostSummary(series);
        expect(recoveryPerLitre).toBeCloseTo(issuePerLitre! - purchasePerLitre!, 6);
    });

    it("counts outstanding orders separately from received fuel", async () => {
        const series = await getFlowSeries("monthly");
        const cost = await getCostSummary(series);
        const outstanding = await prisma.fuelDelivery.count({ where: { grnQty: { lte: 0 } } });
        expect(cost.outstandingOrders).toBe(outstanding);
        // Their litres must never leak into the received total.
        const received = await prisma.fuelDelivery.aggregate({
            _sum: { grnQty: true }, where: { grnQty: { gt: 0 } },
        });
        expect(Math.round(cost.receivedLitres)).toBe(Math.round(received._sum.grnQty ?? 0));
    });

    it("measures the price move across the covered range", async () => {
        const series = await getFlowSeries("monthly");
        const c = await getCostSummary(series);
        if (c.firstPurchasePerLitre && c.lastPurchasePerLitre) {
            const expected = ((c.lastPurchasePerLitre - c.firstPurchasePerLitre) / c.firstPurchasePerLitre) * 100;
            expect(c.priceChangePct).toBeCloseTo(expected, 6);
        }
    });
});

describe("analyseRecoveryTrend", () => {
    const bucket = (key: string, recoveryPerLitre: number, litres = 1000) => ({
        key, issuedLitres: litres, receivedLitres: litres,
        issueCount: 1, deliveryCount: 1,
        receivedCost: litres * 10,
        issuedValue: litres * (10 + recoveryPerLitre),
    });

    it("flags a reversal when recent periods run against the average", () => {
        // Strongly positive early, negative lately — the average stays positive.
        const series = [
            bucket("2025-07", 2), bucket("2025-08", 2), bucket("2025-09", 2),
            bucket("2026-04", -0.5), bucket("2026-05", -0.7), bucket("2026-06", -1.1),
        ];
        const overall = 0.45;
        const t = analyseRecoveryTrend(series, overall)!;
        expect(t.reversal).toBe(true);
        expect(t.periods).toBe(3);
        expect(t.since).toBe("2026-04");
        expect(t.recentPerLitre).toBeLessThan(0);
        expect(t.direction).toBe("worsening");
    });

    it("does not cry reversal when the average already agrees with the trend", () => {
        const series = [bucket("a", -1), bucket("b", -1), bucket("c", -1)];
        expect(analyseRecoveryTrend(series, -1)!.reversal).toBe(false);
    });

    it("needs a run of at least two periods, so one odd month is not a reversal", () => {
        const series = [bucket("a", 1), bucket("b", 1), bucket("c", -0.2)];
        const t = analyseRecoveryTrend(series, 0.6)!;
        expect(t.periods).toBe(1);
        expect(t.reversal).toBe(false);
    });

    it("weights the run by litres rather than averaging the periods evenly", () => {
        const series = [
            bucket("a", 5, 100), bucket("b", -1, 100), bucket("c", -3, 900),
        ];
        const t = analyseRecoveryTrend(series, 0.5)!;
        // (-1*100 + -3*900) / 1000 = -2.8, not the -2 a plain mean would give.
        expect(t.recentPerLitre).toBeCloseTo(-2.8, 6);
    });

    it("returns nothing when there is too little to compare", () => {
        expect(analyseRecoveryTrend([bucket("a", 1)], 1)).toBeNull();
        expect(analyseRecoveryTrend([], 1)).toBeNull();
        expect(analyseRecoveryTrend([bucket("a", 1), bucket("b", 1)], null)).toBeNull();
    });

    it("ignores periods missing either side of the comparison", () => {
        const noDelivery = { ...bucket("x", 0), receivedLitres: 0, receivedCost: 0 };
        const series = [noDelivery, bucket("a", -1), bucket("b", -1)];
        const t = analyseRecoveryTrend(series, 0.5)!;
        expect(t.periods).toBe(2);
        expect(t.since).toBe("a");
    });
});

describeDb("recovery trend against the real data", () => {
    it("detects that the yearly average masks a negative recent run", async () => {
        const series = await getFlowSeries("monthly");
        const cost = await getCostSummary(series);
        expect(cost.recoveryPerLitre).toBeGreaterThan(0);
        expect(cost.recoveryTrend).not.toBeNull();
        expect(cost.recoveryTrend!.reversal).toBe(true);
        expect(cost.recoveryTrend!.recentPerLitre).toBeLessThan(0);
    });
});
