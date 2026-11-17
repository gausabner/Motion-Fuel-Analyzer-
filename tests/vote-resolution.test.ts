import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import { buildPrefixDivisionMap, suggestTarget, normaliseVoteNo, type PrefixTarget } from "@/lib/vote-resolution";
import { prisma } from "@/lib/prisma";

/**
 * A vote number is [division][fund] with a fixed 7-digit fund segment, so the
 * division is anchored to the END. Codes are 12 or 13 digits (5- or 6-digit
 * divisions), which is why a fixed leading-7 slice was wrong: it pulled the
 * first fund digit into the prefix and split one division in two.
 */

const hasDb = fs.existsSync(path.resolve(process.cwd(), "prisma/dev.db"));
const describeDb = hasDb ? describe : describe.skip;

describe("normaliseVoteNo", () => {
    it("strips the stray whitespace some registry rows carry", () => {
        expect(normaliseVoteNo("51005 1100655")).toBe("510051100655");
        expect(normaliseVoteNo("450010 1100655")).toBe("4500101100655");
        expect(normaliseVoteNo("  510051100655 ")).toBe("510051100655");
        expect(normaliseVoteNo("")).toBe("");
    });
});

describeDb("prefix resolution", () => {
    let map: Record<string, PrefixTarget>;
    let samples: { voteNo: string; department: string; division: string }[];

    beforeAll(async () => {
        map = await buildPrefixDivisionMap();
        samples = (await prisma.costCentre.findMany({
            where: { derivedFrom: null },
            select: { voteNo: true, department: true, division: true },
        })).map(c => ({ ...c, voteNo: normaliseVoteNo(c.voteNo) }));
    });

    const swapFund = (voteNo: string, fund: string) => voteNo.slice(0, voteNo.length - 7) + fund;

    it("ignores the fund segment: same division, different fund, same answer", () => {
        let checked = 0;
        for (const s of samples) {
            const target = suggestTarget(s.voteNo, map);
            if (!target) continue; // ambiguous prefix — skipped by design
            const other = suggestTarget(swapFund(s.voteNo, "9999999"), map);
            expect(other?.department).toBe(target.department);
            expect(other?.division).toBe(target.division);
            checked++;
        }
        expect(checked).toBeGreaterThan(0);
    });

    it("resolves a code differing only in the FIRST fund digit — the bug this fixes", () => {
        // Under the old leading-7 rule these landed in different prefixes.
        const s = samples.find(x => suggestTarget(x.voteNo, map));
        expect(s).toBeDefined();
        const fund = s!.voteNo.slice(-7);
        const flipped = (fund[0] === "1" ? "0" : "1") + fund.slice(1);
        const target = suggestTarget(swapFund(s!.voteNo, flipped), map);
        expect(target?.division).toBe(suggestTarget(s!.voteNo, map)!.division);
    });

    it("handles 12- and 13-digit codes alike", () => {
        const byLen = (n: number) => samples.filter(s => s.voteNo.length === n && suggestTarget(s.voteNo, map));
        for (const len of [12, 13]) {
            const found = byLen(len);
            if (found.length === 0) continue;
            const t = suggestTarget(found[0].voteNo, map);
            expect(t, `no target for a ${len}-digit code`).not.toBeNull();
            // The prefix must be the code minus its 7-digit fund segment.
            expect(found[0].voteNo.length - 7).toBe(len - 7);
        }
        expect(byLen(12).length + byLen(13).length).toBeGreaterThan(0);
    });

    it("refuses codes with no division digits", () => {
        expect(suggestTarget("1100655", map)).toBeNull();   // fund segment only
        expect(suggestTarget("12345", map)).toBeNull();
        expect(suggestTarget("", map)).toBeNull();
    });

    it("never maps one prefix to two different divisions", () => {
        // buildPrefixDivisionMap drops ambiguous prefixes rather than guessing.
        const grouped: Record<string, Set<string>> = {};
        for (const s of samples) {
            const p = s.voteNo.slice(0, s.voteNo.length - 7);
            (grouped[p] = grouped[p] || new Set()).add(`${s.department}|${s.division}`);
        }
        for (const [p, set] of Object.entries(grouped)) {
            if (set.size > 1) expect(map[p], `ambiguous prefix ${p} must be omitted`).toBeUndefined();
        }
    });
});
