import { describe, it, expect } from "vitest";
import { paginate, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/lib/pagination";

describe("paginate", () => {
    it("defaults to the standard page size on the first page", () => {
        const w = paginate(43);
        expect(w).toMatchObject({ page: 1, pageSize: DEFAULT_PAGE_SIZE, totalPages: 3, start: 0, end: 20 });
    });

    it("produces slice bounds for the requested page", () => {
        expect(paginate(43, 2)).toMatchObject({ start: 20, end: 40 });
        expect(paginate(43, 3)).toMatchObject({ start: 40, end: 60 });
    });

    it("clamps a page past the end back to the last page", () => {
        expect(paginate(43, 99).page).toBe(3);
        expect(paginate(43, "99").page).toBe(3);
    });

    it("clamps page 0 and negatives up to 1", () => {
        expect(paginate(43, 0).page).toBe(1);
        expect(paginate(43, -5).page).toBe(1);
    });

    it("caps page size and never allows 0", () => {
        expect(paginate(1000, 1, 999).pageSize).toBe(MAX_PAGE_SIZE);
        expect(paginate(1000, 1, 0).pageSize).toBe(DEFAULT_PAGE_SIZE); // 0 is falsy -> default
        expect(paginate(1000, 1, -3).pageSize).toBe(1);
    });

    it("falls back to the default for junk input", () => {
        expect(paginate(43, "abc", "xyz")).toMatchObject({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
    });

    it("always reports at least one page, even when empty", () => {
        expect(paginate(0)).toMatchObject({ page: 1, totalPages: 1, start: 0 });
    });

    it("honours a caller-supplied default size", () => {
        expect(paginate(100, 1, undefined, 25).pageSize).toBe(25);
    });

    it("never returns a window that can skip or duplicate rows", () => {
        const total = 43, size = 20;
        const seen: number[] = [];
        for (let p = 1; p <= paginate(total, 1, size).totalPages; p++) {
            const { start, end } = paginate(total, p, size);
            for (let i = start; i < Math.min(end, total); i++) seen.push(i);
        }
        expect(seen).toEqual([...Array(total).keys()]);
    });
});
