import { describe, expect, it } from "vitest";
import { isOilRow } from "@/lib/oil";

describe("isOilRow", () => {
    it("is oil when the store is an oil store, whatever the row's category", () => {
        expect(isOilRow("Oil", "")).toBe(true);
        expect(isOilRow("Oil", null)).toBe(true);
    });
    it("is oil when the row carries the oil category, from any store", () => {
        expect(isOilRow("Diesel", "1049")).toBe(true);
        expect(isOilRow(undefined, " 1049 ")).toBe(true);
    });
    it("is fuel otherwise", () => {
        expect(isOilRow("Diesel", "1047")).toBe(false);
        expect(isOilRow("Petrol", "")).toBe(false);
        expect(isOilRow(undefined, undefined)).toBe(false);
    });
});
