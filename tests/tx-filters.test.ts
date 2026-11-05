import { describe, it, expect } from "vitest";
import { txFilters } from "@/lib/analytics";

/**
 * txFilters builds the WHERE tail for every FIS/FRE query in the app. A wrong
 * clause is usually visible; a wrong *param order* is not — it silently binds
 * the department string to the date placeholder and quietly returns wrong
 * numbers. These tests pin both.
 */

const placeholders = (clause: string) => (clause.match(/\?/g) || []).length;

describe("txFilters", () => {
    it("returns an empty tail when nothing is filtered", () => {
        expect(txFilters()).toEqual({ clause: "", params: [] });
        expect(txFilters({})).toEqual({ clause: "", params: [] });
    });

    it("binds exactly one param per placeholder, in order, for every combination", () => {
        const combos = [
            { from: "2026-01-01" },
            { to: "2026-06-30" },
            { from: "2026-01-01", to: "2026-06-30" },
            { fuelType: "Diesel" },
            { vehicleId: "WM0303" },
            { department: "ELECTRICITY" },
            { division: "TRAFFIC LIGHTS" },
            { department: "ELECTRICITY", division: "TRAFFIC LIGHTS" },
            { from: "2026-01-01", to: "2026-06-30", fuelType: "Petrol", vehicleId: "WM", department: "D", division: "V" },
        ];
        for (const opts of combos) {
            const { clause, params } = txFilters(opts);
            expect(placeholders(clause), `placeholder/param mismatch for ${JSON.stringify(opts)}`)
                .toBe(params.length);
        }
    });

    it("orders params as date, fuel, vehicle, department, division", () => {
        const { clause, params } = txFilters({
            from: "2026-01-01", to: "2026-06-30",
            fuelType: "Petrol", vehicleId: "WM0303",
            department: "ELECTRICITY", division: "TRAFFIC LIGHTS",
        });
        // The clause mentions the columns in the same order as the bound params.
        const order = ["transDate >=", "transDate <=", "fuelType LIKE", "vehicleId LIKE", "department LIKE", "division LIKE"];
        let cursor = -1;
        for (const token of order) {
            const at = clause.indexOf(token);
            expect(at, `${token} missing from clause`).toBeGreaterThan(-1);
            expect(at, `${token} out of order`).toBeGreaterThan(cursor);
            cursor = at;
        }
        expect(params).toHaveLength(6);
        expect(params[2]).toBe("%Petrol%");
        expect(params[3]).toBe("%WM0303%");
        expect(params[4]).toBe("%ELECTRICITY%");
        expect(params[5]).toBe("%TRAFFIC LIGHTS%");
    });

    it("treats 'all' and empty fuel type as no filter", () => {
        expect(txFilters({ fuelType: "all" })).toEqual({ clause: "", params: [] });
        expect(txFilters({ fuelType: "" })).toEqual({ clause: "", params: [] });
    });

    it("wraps LIKE values in wildcards", () => {
        expect(txFilters({ vehicleId: "WM03" }).params).toEqual(["%WM03%"]);
        expect(txFilters({ fuelType: "Diesel" }).params).toEqual(["%Diesel%"]);
    });

    it("normalises dates to ISO instants and stretches 'to' to end of day", () => {
        const { params } = txFilters({ from: "2026-01-01", to: "2026-06-30" });
        expect(params[0]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(params[1]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        // 'to' must include the whole final day, or that day's rows drop out.
        expect(new Date(params[1] as string).getTime())
            .toBeGreaterThan(new Date("2026-06-30T00:00:00").getTime());
    });

    it("resolves department/division through a CostCentre subquery, not a join", () => {
        const { clause } = txFilters({ department: "ELECTRICITY" });
        expect(clause).toContain("transVoteNo IN (SELECT voteNo FROM CostCentre");
    });

    it("combines department and division with AND inside one subquery", () => {
        const { clause } = txFilters({ department: "D", division: "V" });
        expect(clause.match(/SELECT voteNo FROM CostCentre/g)).toHaveLength(1);
        expect(clause).toMatch(/department LIKE \? AND division LIKE \?/);
    });

    it("uses only unqualified FuelTransaction columns so it composes onto joins", () => {
        const { clause } = txFilters({
            from: "2026-01-01", fuelType: "Diesel", vehicleId: "WM", department: "D",
        });
        // A bare "t." / alias prefix would break getDepartmentBreakdown's LEFT JOIN.
        expect(clause).not.toMatch(/\bt\./);
    });

    it("starts every condition with AND so it appends to an existing WHERE", () => {
        for (const opts of [{ from: "2026-01-01" }, { fuelType: "Diesel" }, { department: "D" }]) {
            expect(txFilters(opts).clause.trimStart().startsWith("AND")).toBe(true);
        }
    });

    it("does not mutate the caller's opts", () => {
        const opts = { from: "2026-01-01", fuelType: "Diesel" };
        const copy = { ...opts };
        txFilters(opts);
        expect(opts).toEqual(copy);
    });
});
