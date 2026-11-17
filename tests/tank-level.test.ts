import { describe, expect, it } from "vitest";
import { computeLevel, type Tank, type TankDip } from "@/lib/tanks";

const tank = (over: Partial<Tank> = {}): Tank => ({ tankNo: "937", fuelType: "Diesel", name: null, capacityLitres: 20000, reorderLitres: 5000, ...over });
const dip = (litres: number): TankDip => ({ id: "d", tankNo: "937", day: "2026-10-01", litres, createdBy: null });

describe("computeLevel", () => {
    it("states no level without a capacity", () => {
        expect(computeLevel(tank({ capacityLitres: null }), dip(1000), 0, 0, 0).status).toBe("no-capacity");
    });

    it("states no level without a dip reading", () => {
        const l = computeLevel(tank(), null, 0, 0, 100);
        expect(l.status).toBe("no-dip");
        expect(l.litres).toBeNull();
    });

    it("is the dip plus receipts less issues", () => {
        const l = computeLevel(tank(), dip(12000), 6000, 8000, 500);
        expect(l.status).toBe("ok");
        expect(l.litres).toBe(10000);
        expect(l.fill).toBe(0.5);
        expect(l.daysOfCover).toBe(20);
        expect(l.belowReorder).toBe(false);
    });

    it("flags stock at or below the reorder level", () => {
        expect(computeLevel(tank(), dip(9000), 0, 4000, 0).belowReorder).toBe(true);
        expect(computeLevel(tank({ reorderLitres: null }), dip(9000), 0, 4000, 0).belowReorder).toBe(false);
    });

    it("gives no days of cover when nothing was issued recently", () => {
        expect(computeLevel(tank(), dip(9000), 0, 0, 0).daysOfCover).toBeNull();
    });

    it("refuses to draw a level when issues outrun stock and receipts", () => {
        const l = computeLevel(tank(), dip(5000), 1000, 9000, 300);
        expect(l.status).toBe("short");
        expect(l.litres).toBeNull();
        expect(l.gapLitres).toBe(3000);
    });

    it("refuses to draw a level above what the tank holds", () => {
        const l = computeLevel(tank(), dip(18000), 6000, 1000, 300);
        expect(l.status).toBe("over");
        expect(l.gapLitres).toBe(3000);
    });

    it("tolerates rounding at empty and at full", () => {
        expect(computeLevel(tank(), dip(1000), 0, 1000.6, 10).status).toBe("ok");
        expect(computeLevel(tank(), dip(20000), 300, 0, 10).status).toBe("ok");
        expect(computeLevel(tank(), dip(20000), 300, 0, 10).fill).toBe(1);
    });
});
