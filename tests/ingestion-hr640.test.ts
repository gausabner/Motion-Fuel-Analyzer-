import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { isHr640Sheet, detectDeliveryFormat, parseHr640Sheet, parseYmdInt, normaliseFuelType } from "@/lib/ingestion-hr640";

/** Builds a sheet with the workbook's real quirks: padded headers and values. */
function sheetFrom(rows: unknown[][]) {
    return XLSX.utils.aoa_to_sheet(rows);
}
const HR640_HEADERS = [
    "Order No  ", "O Date  ", "Supp ref", "Supp name                     ",
    "Item      ", "Item Desc                     ", "Order Qty       ",
    "Ord Cost          ", "GRN Qty         ", "GRN Cost          ",
];
const sampleRow = [
    1274152, 20250704, 2353, "VIVO ENERGY NAMIBIA LTD(SHELL)     ",
    90001, "diesel                        ", "       25033.000",
    "      455132.48290", "       25033.000", "      455132.48290",
];

describe("parseYmdInt", () => {
    it("reads yyyymmdd as an integer or string", () => {
        expect(parseYmdInt(20250701)?.toISOString().slice(0, 10)).toBe("2025-07-01");
        expect(parseYmdInt("20260622")?.toISOString().slice(0, 10)).toBe("2026-06-22");
    });

    it("rejects impossible dates instead of rolling them over", () => {
        // Date() would silently turn 31 Feb into 3 March.
        expect(parseYmdInt(20250231)).toBeNull();
        expect(parseYmdInt(20251301)).toBeNull();
        expect(parseYmdInt(20250700)).toBeNull();
    });

    it("rejects anything that is not 8 digits", () => {
        for (const bad of ["", null, undefined, "2025-07-01", 45000, "abc", 202507011]) {
            expect(parseYmdInt(bad)).toBeNull();
        }
    });

    it("never reads a yyyymmdd value as an Excel serial", () => {
        // The bug this guards: 20250701 as a serial lands around the year 57,000.
        expect(parseYmdInt(20250701)!.getUTCFullYear()).toBe(2025);
    });
});

describe("normaliseFuelType", () => {
    it("maps the report's item descriptions", () => {
        expect(normaliseFuelType("diesel                  ", "90001")).toBe("Diesel");
        expect(normaliseFuelType("petrol unleaded         ", "90003")).toBe("Petrol");
        expect(normaliseFuelType("something else", "90009")).toBe("Unknown");
    });
});

describe("isHr640Sheet", () => {
    it("recognises HR640 headers despite trailing spaces", () => {
        expect(isHr640Sheet(HR640_HEADERS)).toBe(true);
    });

    it("does not claim an HR580 transaction sheet", () => {
        expect(isHr640Sheet(["Tank", "Issue Date", "Issue Qty", "Vehicle"])).toBe(false);
        expect(isHr640Sheet(["Store No", "Trans Date", "Trans Qty"])).toBe(false);
        expect(isHr640Sheet([])).toBe(false);
    });
});

describe("parseHr640Sheet", () => {
    it("parses padded numbers and the yyyymmdd date", () => {
        const { rows, errors } = parseHr640Sheet(sheetFrom([HR640_HEADERS, sampleRow]));
        expect(errors).toEqual([]);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            orderNo: "1274152",
            suppRef: "2353",
            suppName: "VIVO ENERGY NAMIBIA LTD(SHELL)",
            itemCode: "90001",
            itemDesc: "diesel",
            fuelType: "Diesel",
            orderQty: 25033,
            grnQty: 25033,
        });
        expect(rows[0].orderCost).toBeCloseTo(455132.4829, 3);
        expect(rows[0].orderDate.toISOString().slice(0, 10)).toBe("2025-07-04");
    });

    it("keeps orders that have not been delivered yet", () => {
        const undelivered = [...sampleRow];
        undelivered[8] = "           0.000";
        undelivered[9] = "           0.00000";
        const { rows } = parseHr640Sheet(sheetFrom([HR640_HEADERS, undelivered]));
        expect(rows[0].grnQty).toBe(0);
        expect(rows[0].orderQty).toBe(25033);
    });

    it("reports a bad date as an error rather than dropping it silently", () => {
        const bad = [...sampleRow];
        bad[1] = "not-a-date";
        const { rows, errors } = parseHr640Sheet(sheetFrom([HR640_HEADERS, bad]));
        expect(rows).toHaveLength(0);
        expect(errors[0]).toMatch(/unreadable order date/);
    });

    it("skips blank rows and rows with no order number", () => {
        const { rows } = parseHr640Sheet(sheetFrom([
            HR640_HEADERS, sampleRow, [null, null, null, null, null, null, null, null, null, null],
        ]));
        expect(rows).toHaveLength(1);
    });
});

const HR940_HEADERS = [
    "Order No  ", "O Date  ", "Supp ref", "Supp name              ", "Can ord", "Can Item",
    "Item      ", "Item Desc              ", "Order Qty       ", "Ord Cost          ",
    "GRN Qty         ", "GRN Cost          ", "Inv Qty        ", "Return Qty       ", "Column1",
];
const hr940Row = [
    1274152, 20250704, 2353, "VIVO ENERGY NAMIBIA LTD(SHELL)   ", "", "",
    90001, "diesel                    ", "       25033.000", "      455132.48290",
    "       25033.000", "      455132.48290", "       25033.000", "           0.000", "",
];

describe("detectDeliveryFormat", () => {
    it("tells HR940 apart from HR640 by its extra columns", () => {
        expect(detectDeliveryFormat(HR640_HEADERS)).toBe("hr640");
        expect(detectDeliveryFormat(HR940_HEADERS)).toBe("hr940");
    });

    it("claims neither for an HR580 transaction sheet", () => {
        expect(detectDeliveryFormat(["Tank", "Issue Date", "Issue Qty", "Fleet Unit"])).toBeNull();
        expect(detectDeliveryFormat([])).toBeNull();
    });

    it("treats both delivery reports as parseable", () => {
        expect(isHr640Sheet(HR640_HEADERS)).toBe(true);
        expect(isHr640Sheet(HR940_HEADERS)).toBe(true);
    });
});

describe("parseHr640Sheet with HR940 columns", () => {
    it("reads the extra HR940 fields", () => {
        const { rows, errors } = parseHr640Sheet(sheetFrom([HR940_HEADERS, hr940Row]));
        expect(errors).toEqual([]);
        expect(rows[0]).toMatchObject({
            orderNo: "1274152", itemCode: "90001", fuelType: "Diesel",
            grnQty: 25033, invQty: 25033, returnQty: 0,
            canOrd: null, canItem: null,
        });
    });

    it("leaves the HR940 fields null for an HR640 sheet", () => {
        const { rows } = parseHr640Sheet(sheetFrom([HR640_HEADERS, sampleRow]));
        expect(rows[0]).toMatchObject({ canOrd: null, canItem: null, invQty: null, returnQty: null });
    });

    it("keeps a cancellation flag when one is present", () => {
        const cancelled = [...hr940Row];
        cancelled[4] = "Y";
        cancelled[5] = "25033";
        const { rows } = parseHr640Sheet(sheetFrom([HR940_HEADERS, cancelled]));
        expect(rows[0].canOrd).toBe("Y");
        expect(rows[0].canItem).toBe("25033");
    });

    it("ignores the unused Column1 artifact", () => {
        const withJunk = [...hr940Row];
        withJunk[14] = "leftover";
        const { rows, errors } = parseHr640Sheet(sheetFrom([HR940_HEADERS, withJunk]));
        expect(errors).toEqual([]);
        expect(rows).toHaveLength(1);
        expect(Object.values(rows[0])).not.toContain("leftover");
    });
});
