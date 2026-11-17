import { describe, expect, it } from "vitest";
import { financialYearEnd, financialYearLabel, financialYearStart, yearToDateLabel } from "@/lib/financial-year";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("financial year", () => {
    it("is the calendar year when it starts in January", () => {
        const s = financialYearStart(new Date(2026, 9, 15), 1);
        expect(ymd(s)).toBe("2026-01-01");
        expect(ymd(financialYearEnd(s))).toBe("2026-12-31");
        expect(financialYearLabel(s)).toBe("2026");
        expect(yearToDateLabel(1)).toBe("Year to date");
    });

    it("starts in the same calendar year once the start month has been reached", () => {
        const s = financialYearStart(new Date(2026, 9, 15), 7);
        expect(ymd(s)).toBe("2026-07-01");
        expect(ymd(financialYearEnd(s))).toBe("2027-06-30");
        expect(financialYearLabel(s)).toBe("2026/27");
    });

    it("starts in the previous calendar year before the start month", () => {
        const s = financialYearStart(new Date(2026, 2, 31), 7);
        expect(ymd(s)).toBe("2025-07-01");
        expect(ymd(financialYearEnd(s))).toBe("2026-06-30");
    });

    it("treats the first day of the start month as the new year", () => {
        expect(ymd(financialYearStart(new Date(2026, 3, 1), 4))).toBe("2026-04-01");
        expect(ymd(financialYearStart(new Date(2026, 2, 31), 4))).toBe("2025-04-01");
    });

    it("ends a year that starts in March on the last day of February, leap years included", () => {
        expect(ymd(financialYearEnd(new Date(2027, 2, 1)))).toBe("2028-02-29");
        expect(yearToDateLabel(3)).toBe("Financial year to date");
    });
});
