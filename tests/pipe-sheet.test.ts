import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { unpipeSheet } from "@/lib/pipe-sheet";

const HEAD_A = "Tank|Pump|Issue Date|Reference No|Issue Time|Issue ";
const HEAD_B = "Vote|Issue Qty|Issue Cost|Fleet Unit|Fleet EI|Fleet Reading|Job No|Activity|Category|";

const piped = (rows: unknown[][]) => XLSX.utils.aoa_to_sheet(rows);
const read = (sheet: XLSX.WorkSheet) => XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];

describe("unpipeSheet", () => {
    it("leaves an ordinary sheet alone", () => {
        expect(unpipeSheet(piped([["Tank", "Pump", "Issue Date", "Issue Qty"], [937, 7, 20260128, 150]]))).toBeNull();
        expect(unpipeSheet(piped([["Date", "Petrol Qty"], [46082, 590]]))).toBeNull();
        expect(unpipeSheet(piped([]))).toBeNull();
    });

    it("rebuilds the columns of a pipe-delimited export, skipping the Column1/Column2 line above the headings", () => {
        const sheet = unpipeSheet(piped([
            ["Column1", "Column2"],
            [HEAD_A, HEAD_B],
            ["911       |1         |20260129|033895              ", "|100100|       3020501150275|         5.000  |         276.00 |WM2337|43|2546837|       |  |    "],
            ["937       |7         |20260128|F01875              ", "|100100|       5000111100655|       150.000  |        2758.65 |WM2815|2|2575510|       |  |    "],
        ]));
        expect(sheet).not.toBeNull();
        const rows = read(sheet!);
        expect(rows).toHaveLength(2);
        expect(Object.keys(rows[0])).toEqual(["Tank", "Pump", "Issue Date", "Reference No", "Issue Time", "Issue Vote", "Issue Qty", "Issue Cost", "Fleet Unit", "Fleet EI", "Fleet Reading"]);
        expect(rows[0]).toMatchObject({ Tank: 911, Pump: 1, "Issue Date": 20260129, "Issue Time": 100100, "Issue Vote": 3020501150275, "Issue Qty": 5, "Issue Cost": 276, "Fleet Unit": "WM2337", "Fleet EI": 43, "Fleet Reading": 2546837 });
    });

    it("turns a digits-only reference into a number, as Excel does, so both layouts give the same duplicate key", () => {
        const rows = read(unpipeSheet(piped([[HEAD_A, HEAD_B],
            ["911|1|20260129|033895", "|100100|3020501150275|5.000|276.00|WM2337|43|2546837||||"],
            ["937|7|20260128|F01875", "|100100|5000111100655|150.000|2758.65|WM2815|2|2575510||||"]]))!);
        expect(String(rows[0]["Reference No"])).toBe("33895");
        expect(rows[1]["Reference No"]).toBe("F01875");
    });

    it("drops blank lines and copes with a whole row in a single cell", () => {
        const rows = read(unpipeSheet(piped([[HEAD_A + HEAD_B], ["   |  |  "], ["940|3|20260829|F00812|100200|1500151100655|128|3118.21|WM2811|2|2356170|||"]]))!);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ Tank: 940, "Issue Qty": 128, "Fleet Unit": "WM2811" });
    });
});
