import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import {
    getFleetPerformance, getDepartmentBreakdown, getFREData, getFISData,
    getConsumptionSummary, getTopFleet,
} from "@/lib/analytics";
import { getVehicleAttribution } from "@/lib/vehicle-attribution";

/**
 * Integration checks against the local dev database. These assert *invariants*
 * rather than exact totals, so they keep working as the data changes — the
 * point is to catch a filter that stops filtering, not to freeze a number.
 */

const hasDb = fs.existsSync(path.resolve(process.cwd(), "prisma/dev.db"));
const describeDb = hasDb ? describe : describe.skip;

describeDb("analytics against the dev database", () => {
    let allFleet: Awaited<ReturnType<typeof getFleetPerformance>>;

    beforeAll(async () => {
        allFleet = await getFleetPerformance();
    });

    it("has data to test against", () => {
        expect(allFleet.length).toBeGreaterThan(0);
    });

    describe("getFleetPerformance", () => {
        it("returns no petrol volume when filtered to diesel", async () => {
            const diesel = await getFleetPerformance({ fuelType: "Diesel" });
            expect(diesel.length).toBeGreaterThan(0);
            expect(diesel.every(u => u.petrolVolume === 0)).toBe(true);
        });

        it("narrows to a subset when a vehicle filter is applied", async () => {
            const one = await getFleetPerformance({ vehicleId: allFleet[0].id });
            expect(one.length).toBeGreaterThan(0);
            expect(one.length).toBeLessThanOrEqual(allFleet.length);
            expect(one.every(u => u.id.includes(allFleet[0].id))).toBe(true);
        });

        it("is sorted by total volume, highest first", () => {
            const totals = allFleet.map(u => u.petrolVolume + u.dieselVolume);
            expect([...totals].sort((a, b) => b - a)).toEqual(totals);
        });

        it("returns an empty list rather than throwing for an unmatched filter", async () => {
            expect(await getFleetPerformance({ vehicleId: "___no_such_unit___" })).toEqual([]);
        });
    });

    describe("getDepartmentBreakdown", () => {
        it("narrows to the requested department", async () => {
            const all = await getDepartmentBreakdown();
            expect(all.length).toBeGreaterThan(0);
            const target = all.find(d => d.id.startsWith("DEPARTMENT"));
            if (!target) return;
            const filtered = await getDepartmentBreakdown({ department: target.id });
            expect(filtered.length).toBeLessThanOrEqual(all.length);
            expect(filtered.every(d => d.id === target.id)).toBe(true);
        });

        it("never fans out rows via the CostCentre join", async () => {
            const rows = await getDepartmentBreakdown();
            expect(new Set(rows.map(r => r.id)).size).toBe(rows.length);
        });

        it("is sorted by spend, highest first", async () => {
            const costs = (await getDepartmentBreakdown()).map(d => d.totalCost);
            expect([...costs].sort((a, b) => b - a)).toEqual(costs);
        });
    });

    describe("FRE carve-out", () => {
        // Receipts carry no vote and a placeholder vehicle. This is *why* the
        // Fuel Report scopes FRE by date/fuel only — if this ever changes, the
        // carve-out should be revisited.
        it("returns nothing when receipts are filtered by department", async () => {
            const byDate = await getFREData(1000, {});
            expect(byDate.length).toBeGreaterThan(0);
            const byDept = await getFREData(1000, { department: "ELECTRICITY" });
            expect(byDept.length).toBe(0);
        });

        it("still filters receipts by fuel type", async () => {
            const all = await getFREData(1000, {});
            const diesel = await getFREData(1000, { fuelType: "Diesel" });
            expect(diesel.length).toBeGreaterThan(0);
            expect(diesel.length).toBeLessThanOrEqual(all.length);
            expect(diesel.every(r => String(r.fuelType).toLowerCase().includes("diesel"))).toBe(true);
        });

        it("does filter issues by department, unlike receipts", async () => {
            const fis = await getFISData(10, { department: "ELECTRICITY" });
            expect(fis.length).toBeGreaterThan(0);
        });
    });

    describe("getConsumptionSummary", () => {
        it("a department slice never exceeds the unfiltered total", async () => {
            const all = await getConsumptionSummary();
            const dept = await getConsumptionSummary({ department: "ELECTRICITY" });
            expect(dept.petrolVolume).toBeLessThanOrEqual(all.petrolVolume);
            expect(dept.dieselVolume).toBeLessThanOrEqual(all.dieselVolume);
            expect(dept.petrolCount).toBeLessThanOrEqual(all.petrolCount);
        });

        it("reports zero for the fuel type excluded by the filter", async () => {
            const diesel = await getConsumptionSummary({ fuelType: "Diesel" });
            expect(diesel.petrolVolume).toBe(0);
            expect(diesel.dieselVolume).toBeGreaterThan(0);
        });
    });

    describe("getTopFleet", () => {
        it("caps at the requested limit and pins the fuel type", async () => {
            const top = await getTopFleet("Diesel", {}, 5);
            expect(top.length).toBeLessThanOrEqual(5);
            expect([...top].sort((a, b) => b.volume - a.volume)).toEqual(top);
        });

        it("lets the pinned fuel win over a conflicting opts fuelType", async () => {
            // The report's petrol tables must stay petrol even if the URL says diesel.
            const pinned = await getTopFleet("Petrol", { fuelType: "Diesel" }, 5);
            const plain = await getTopFleet("Petrol", {}, 5);
            expect(pinned).toEqual(plain);
        });
    });
});

describeDb("getVehicleAttribution", () => {
    it("returns null for an empty query", async () => {
        expect(await getVehicleAttribution("")).toBeNull();
    });

    it("reports no match without throwing", async () => {
        const r = await getVehicleAttribution("___no_such_unit___");
        expect(r).toMatchObject({ matchedCount: 0, unit: null });
    });

    it("gives full detail for a single matched unit", async () => {
        const fleet = await getFleetPerformance();
        const r = await getVehicleAttribution(fleet[0].id);
        expect(r?.matchedCount).toBe(1);
        expect(r?.unit).not.toBeNull();
        expect(r!.unit!.votes.length).toBeGreaterThan(0);
    });

    it("summarises instead of detailing when the search matches many units", async () => {
        const r = await getVehicleAttribution("WM");
        if ((r?.matchedCount ?? 0) > 1) {
            expect(r!.unit).toBeNull();
            expect(r!.summary.units).toBe(r!.matchedCount);
        }
    });

    it("keeps status consistent with the unresolved vote list", async () => {
        const fleet = await getFleetPerformance();
        for (const u of fleet.slice(0, 25)) {
            const r = await getVehicleAttribution(u.id);
            const unit = r?.unit;
            if (!unit) continue;
            const resolved = unit.votes.filter(v => v.department);
            if (unit.unresolved.length === 0) expect(unit.status).toBe("assigned");
            else if (resolved.length === 0) expect(unit.status).toBe("unassigned");
            else expect(unit.status).toBe("partial");
            // An assigned unit must expose a primary cost centre, and vice versa.
            expect(unit.primary === null).toBe(resolved.length === 0);
        }
    });

    it("sorts votes by litres so 'primary' is the highest-volume centre", async () => {
        const fleet = await getFleetPerformance();
        const r = await getVehicleAttribution(fleet[0].id);
        const litres = r!.unit!.votes.map(v => v.litres);
        expect([...litres].sort((a, b) => b - a)).toEqual(litres);
    });

    it("ignores a department filter, which would hide unregistered votes", async () => {
        const fleet = await getFleetPerformance();
        const plain = await getVehicleAttribution(fleet[0].id);
        const scoped = await getVehicleAttribution(fleet[0].id, { department: "___nope___" });
        expect(scoped).toEqual(plain);
    });
});
