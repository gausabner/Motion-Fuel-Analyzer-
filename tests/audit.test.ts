import { describe, expect, it } from "vitest";
import { describeChanges } from "@/lib/audit";

describe("describeChanges", () => {
    const labels = { a: "Alpha", b: "Beta", on: "Switch" };

    it("lists only the fields that changed, with their labels", () => {
        expect(describeChanges({ a: 1, b: "x", on: true }, { a: 2, b: "x", on: true }, labels)).toEqual(["Alpha: 1 to 2"]);
    });

    it("writes booleans as on and off", () => {
        expect(describeChanges({ a: 1, b: "x", on: true }, { a: 1, b: "x", on: false }, labels)).toEqual(["Switch: on to off"]);
    });

    it("treats null and empty text as the same nothing", () => {
        expect(describeChanges({ a: null, b: "", on: true }, { a: "", b: null, on: true }, labels)).toEqual([]);
        expect(describeChanges({ a: null, b: "", on: true }, { a: "set", b: "", on: true }, labels)).toEqual(["Alpha: empty to set"]);
    });

    it("ignores fields that have no label", () => {
        expect(describeChanges({ a: 1, secret: "old" }, { a: 1, secret: "new" }, { a: "Alpha" })).toEqual([]);
    });
});
