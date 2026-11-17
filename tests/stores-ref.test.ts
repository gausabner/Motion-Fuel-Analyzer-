import { describe, expect, it } from "vitest";
import { splitStoresRef } from "@/lib/fuel-insights";

describe("splitStoresRef", () => {
    it("reads the issue date and pump slip from a stores-report reference", () => {
        expect(splitStoresRef("20260210F01563", "2026-02-13T22:00:00.000Z")).toEqual({ day: "2026-02-10", slip: "F01563" });
        expect(splitStoresRef(" 20260408F00729 ", "2026-04-23T22:00:00.000Z")).toEqual({ day: "2026-04-08", slip: "F00729" });
    });
    it("falls back to the posting day when the reference has no date", () => {
        expect(splitStoresRef("F01563", new Date(2026, 1, 13))).toEqual({ day: "2026-02-13", slip: null });
        expect(splitStoresRef(null, new Date(2026, 1, 13))).toEqual({ day: "2026-02-13", slip: null });
    });
});
