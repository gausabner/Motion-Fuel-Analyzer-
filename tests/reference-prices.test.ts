import { describe, expect, it } from "vitest";
import { priceOn, type ReferencePrice } from "@/lib/reference-prices";

const p = (fuel: "Petrol" | "Diesel", price: number, effectiveFrom: string): ReferencePrice =>
    ({ id: `${fuel}-${effectiveFrom}`, fuel, price, effectiveFrom, createdBy: null });

describe("priceOn", () => {
    const history = [p("Petrol", 18, "2025-01-01"), p("Petrol", 21.5, "2026-03-01"), p("Diesel", 20, "2025-06-01")];

    it("returns null before the first entry for that fuel", () => {
        expect(priceOn(history, "Petrol", "2024-12-31")).toBeNull();
        expect(priceOn(history, "Diesel", "2025-05-31")).toBeNull();
    });

    it("applies a price from its own date", () => {
        expect(priceOn(history, "Petrol", "2025-01-01")).toBe(18);
        expect(priceOn(history, "Petrol", "2026-03-01")).toBe(21.5);
    });

    it("keeps the earlier price until the day before the next one", () => {
        expect(priceOn(history, "Petrol", "2026-02-28")).toBe(18);
    });

    it("does not let one fuel's price answer for another", () => {
        expect(priceOn(history, "Diesel", "2026-06-01")).toBe(20);
        expect(priceOn(history, "Paraffin", "2026-06-01")).toBeNull();
    });

    it("does not depend on the order of the history", () => {
        expect(priceOn([...history].reverse(), "Petrol", "2026-04-01")).toBe(21.5);
    });
});
