import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { normaliseSheet, repairSplitHeadings } from "@/lib/pipe-sheet";

const sheet = (rows: unknown[][]) => XLSX.utils.aoa_to_sheet(rows);
const read = (ws: XLSX.WorkSheet) => XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];

// As found in "February Hr580.xlsx": headings split word by word, data shifted past four empty columns.
const SPLIT_HEAD = ["Tank", "Pump", "Issue", "Date", "Reference", "No", "Issue2", "Time", "Issue3", "Vote", "Issue Qty", "Cost",
    "Fleet", "Unit", "Fleet4", "EI", "Fleet5", "Reading", "Job", "No6", "Activity", "Category"];
const SPLIT_ROW = (ref: number) => [911, 1, 20260226, ref, null, null, null, null, 100100, 5000110000000, 5, 240, "WM2511", 43, 3817800, "  ", " ", " ", null, null, null, null];

describe("repairSplitHeadings", () => {
    it("rebuilds the HR580 headings and maps them onto the columns that carry data", () => {
        const fixed = repairSplitHeadings([SPLIT_HEAD, SPLIT_ROW(18873), SPLIT_ROW(18874)]);
        expect(fixed).not.toBeNull();
        expect(fixed![0]).toEqual(["Tank", "Pump", "Issue Date", "Reference No", "Issue Time", "Issue Vote", "Issue Qty", "Issue Cost",
            "Fleet Unit", "Fleet EI", "Fleet Reading", "Job No", "Activity", "Category"]);
        expect(fixed![1].slice(0, 9)).toEqual([911, 1, 20260226, 18873, 100100, 5000110000000, 5, 240, "WM2511"]);
    });

    it("leaves whole headings alone", () => {
        expect(repairSplitHeadings([["Tank", "Pump", "Issue Date", "Issue Qty"], [937, 7, 20260128, 150]])).toBeNull();
    });

    it("refuses when the data columns do not match the rebuilt headings one for one", () => {
        const short = SPLIT_ROW(1).slice(0, 12);   // Fleet Unit onwards missing
        expect(repairSplitHeadings([SPLIT_HEAD, short])).toBeNull();
    });

    it("refuses when the column read as the date does not hold dates", () => {
        const bad = SPLIT_ROW(1); bad[2] = "WM2511";
        expect(repairSplitHeadings([SPLIT_HEAD, bad, bad])).toBeNull();
    });
});

describe("normaliseSheet", () => {
    it("finds headings below a blank first row", () => {
        const { sheet: ws, layout } = normaliseSheet(sheet([
            ["\n"],
            ["Store No", "Item No", "Item Cat", "Trans Date", "Trans Type", "Trans Qty", "Tot on Hand Qty"],
            [937, 90001, 1047, 20231003, "FIS", -55, 985],
        ]));
        expect(layout).toBe("headings-lower-down");
        expect(read(ws)[0]).toMatchObject({ "Store No": 937, "Trans Date": 20231003, "Tot on Hand Qty": 985 });
    });

    it("repairs split headings", () => {
        const { sheet: ws, layout } = normaliseSheet(sheet([SPLIT_HEAD, SPLIT_ROW(18873)]));
        expect(layout).toBe("split-headings");
        expect(read(ws)[0]).toMatchObject({ Tank: 911, "Issue Date": 20260226, "Issue Qty": 5, "Fleet Unit": "WM2511" });
    });

    it("leaves an ordinary or unrecognised sheet as it is", () => {
        const plain = sheet([["Tank", "Pump", "Issue Date", "Issue Qty"], [937, 7, 20260128, 150]]);
        expect(normaliseSheet(plain)).toEqual({ sheet: plain, layout: null });
        const summary = sheet([["Daily totals"], ["Date", "Petrol Qty"], [46082, 590]]);
        expect(normaliseSheet(summary).layout).toBeNull();
    });
});
