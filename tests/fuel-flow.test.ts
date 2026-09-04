import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { getFlowSeries, getReplenishmentForecast, getOrderToTankLeadTime } from "@/lib/fuel-flow";
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
