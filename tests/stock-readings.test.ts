import { describe, expect, it } from "vitest";
import { extractStockReadings, stockDay } from "@/lib/stock-readings";
import { chooseBasis } from "@/lib/tanks";

const row = (store: number, cat: number, day: number, qty: number, onHand: number, item = 90001, max = 30000) =>
    ({ "Store No": store, "Item No": item, "Item Cat": cat, "Qty Max": `${max}.000   `, "Trans Date": day, "Trans Type": qty < 0 ? "FIS" : "FRE", "Trans Qty": qty, "Tot on Hand Qty": `${onHand}.000    ` });

describe("stockDay", () => {
    it("reads the report's YYYYMMDD and Excel serials", () => {
        expect(stockDay(20260527)).toBe("2026-05-27");
        expect(stockDay("20260527")).toBe("2026-05-27");
        expect(stockDay(46169)).toBe("2026-05-27");
        expect(stockDay("27/05/2026")).toBeNull();
        expect(stockDay(20261340)).toBeNull();
    });
});

describe("extractStockReadings", () => {
    it("takes the balance after each day's last row, per store", () => {
        const r = extractStockReadings([
            row(943, 90001, 20260526, -40, 9000),
            row(943, 90001, 20260526, -35, 8965),
            row(940, 1047, 20260526, -60, 8300),
            row(943, 90001, 20260527, -40, 8925),
        ]);
        expect(r).toEqual([
            { tankNo: "943", day: "2026-05-26", litres: 8965, reportMax: 30000 },
            { tankNo: "940", day: "2026-05-26", litres: 8300, reportMax: 30000 },
            { tankNo: "943", day: "2026-05-27", litres: 8925, reportMax: 30000 },
        ]);
    });

    it("ignores oil, items not held in litres, and every other stores item", () => {
        expect(extractStockReadings([row(911, 1049, 20260507, -1, 240, 90111), row(9, 1072, 20260301, -2, 40, 357401)])).toEqual([]);
        expect(extractStockReadings([{ ...row(1, 1047, 20260330, -1, 5, 54700, 50), "UOM Code": "DRUM  " }])).toEqual([]);
        expect(extractStockReadings([{ ...row(937, 1047, 20260330, -1, 5), "UOM Code": "LITRE " }])).toHaveLength(1);
    });

    it("skips rows without a usable date or balance", () => {
        expect(extractStockReadings([{ ...row(937, 1047, 20260521, -10, 0), "Tot on Hand Qty": "" }, row(937, 1047, 0, -10, 5)])).toEqual([]);
    });
});

describe("chooseBasis", () => {
    const dip = (day: string, litres = 1000) => ({ day, litres });
    it("uses the later of the dip and the stores report, and the dip on a tie", () => {
        expect(chooseBasis(dip("2026-05-20"), dip("2026-05-27", 8925))).toEqual({ kind: "stores-report", day: "2026-05-27", litres: 8925 });
        expect(chooseBasis(dip("2026-05-28", 9000), dip("2026-05-27", 8925))).toEqual({ kind: "dip", day: "2026-05-28", litres: 9000 });
        expect(chooseBasis(dip("2026-05-27", 9000), dip("2026-05-27", 8925))?.kind).toBe("dip");
        expect(chooseBasis(null, null)).toBeNull();
    });
});
