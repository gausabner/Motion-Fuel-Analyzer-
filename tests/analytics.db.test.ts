import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import {
    getFleetPerformance, getDepartmentBreakdown, getFREData, getFISData,
    getConsumptionSummary, getTopFleet, isUnattributedUnit, unitLabel,
} from "@/lib/analytics";
import { getVehicleAttribution } from "@/lib/vehicle-attribution";
import { prisma } from "@/lib/prisma";

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

describeDb("getVehicleAttribution — multi-unit matches", () => {
    it("exposes every matched unit, not just the single-match case", async () => {
        const r = await getVehicleAttribution("WM");
        expect(r!.units.length).toBe(r!.matchedCount);
        expect(r!.units.length).toBeGreaterThan(1);
        // The single-unit convenience field stays null for an ambiguous search.
        expect(r!.unit).toBeNull();
    });

    it("ranks units needing attention first, then by volume", async () => {
        const r = await getVehicleAttribution("WM");
        const rank = (s: string) => (s === "assigned" ? 1 : 0);
        const ranks = r!.units.map(u => rank(u.status));
        expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
        // Within the unresolved block, volume descends.
        const unresolved = r!.units.filter(u => u.status !== "assigned").map(u => u.litres);
        expect([...unresolved].sort((a, b) => b - a)).toEqual(unresolved);
    });

    it("reports each unit's total litres as the sum of its votes", async () => {
        const r = await getVehicleAttribution("WM");
        for (const u of r!.units.slice(0, 20)) {
            expect(u.litres).toBeCloseTo(u.votes.reduce((s, v) => s + v.litres, 0), 6);
        }
    });
});

describeDb("the unattributed-unit placeholder", () => {
    it("recognises the placeholder and gives it a display label", () => {
        expect(isUnattributedUnit("UNKNOWN")).toBe(true);
        expect(isUnattributedUnit("unknown")).toBe(true);
        expect(isUnattributedUnit("")).toBe(true);
        expect(isUnattributedUnit(null)).toBe(true);
        expect(isUnattributedUnit("WM0303")).toBe(false);
        expect(unitLabel("UNKNOWN")).toBe("Unattributed");
        expect(unitLabel("WM0303")).toBe("WM0303");
    });

    it("keeps it out of top-consumer rankings", async () => {
        for (const fuel of ["Petrol", "Diesel"]) {
            const top = await getTopFleet(fuel, {}, 50);
            expect(top.some(u => isUnattributedUnit(u.vehicleId))).toBe(false);
        }
    });

    it("still counts it in the fleet table, so litres reconcile", async () => {
        const fleet = await getFleetPerformance();
        // Present in the raw performance data (it is real fuel), just not ranked.
        expect(fleet.some(u => isUnattributedUnit(u.id))).toBe(true);
    });
});

describeDb("transDate storage format", () => {
    it("stores every transDate as ISO text, never epoch milliseconds", async () => {
        // Analytics filter transDate by STRING comparison, and SQLite sorts every
        // INTEGER below every TEXT — so a Prisma-native DateTime write lands as
        // epoch ms and matches no date filter anywhere. Such rows import, report a
        // success count, and are invisible across the entire app. This exact
        // regression hid a month of uploaded data.
        const rows = await prisma.$queryRawUnsafe(
            `SELECT typeof(transDate) AS t, COUNT(*) AS c FROM FuelTransaction GROUP BY t`
        ) as { t: string; c: number | bigint }[];
        const offenders = rows.filter(r => r.t !== "text");
        expect(
            offenders.map(o => `${o.t}=${Number(o.c)}`).join(", ") || "none",
        ).toBe("none");
    });

    it("finds the newest month through a plain string filter", async () => {
        // Guards the symptom rather than the mechanism: if the newest data cannot
        // be reached this way, the dashboard cannot show it either.
        const [{ latest }] = await prisma.$queryRawUnsafe(
            `SELECT MAX(transDate) AS latest FROM FuelTransaction`
        ) as { latest: string }[];
        const month = String(latest).slice(0, 7);
        const [{ c }] = await prisma.$queryRawUnsafe(
            `SELECT COUNT(*) AS c FROM FuelTransaction WHERE transDate >= '${month}-01'`
        ) as { c: number | bigint }[];
        expect(Number(c)).toBeGreaterThan(0);
    });
});
