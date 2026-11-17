import { prisma } from "@/lib/prisma";
import { getOilSummary, type OilSummary } from "@/lib/oil";

/**
 * What is on record, by source, and how far each source reaches. Every figure
 * in the app is only as current as the report behind it, so this is the page
 * that says which report is behind.
 */
export type SourceCoverage = {
    key: "issues" | "tankReceipts" | "deliveries";
    label: string;
    report: string;
    rows: number;
    firstDay: string | null;
    lastDay: string | null;
    /** Whole days this source ends before the latest fuel issue; 0 when it is level or ahead. */
    daysBehind: number;
};

export type DataCoverage = {
    sources: SourceCoverage[];
    /** Rows in the fuel table that are stores movements, not fuel issues or receipts. */
    otherRows: { type: string; rows: number }[];
    uploads: { count: number; lastAt: string | null; lastName: string | null; emptyUploads: number };
    unknownFuelIssues: { rows: number; litres: number };
    /** Oil kept out of every fuel total. */
    oil: OilSummary;
};

const q = (sql: string) => prisma.$queryRawUnsafe(sql) as Promise<Record<string, unknown>[]>;
const gap = (a: string | null, b: string | null) => (!a || !b || a >= b ? 0 : Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000));

export async function getDataCoverage(): Promise<DataCoverage> {
    const [types, deliveries, uploads, unknown, oil] = await Promise.all([
        q(`SELECT transType AS type, COUNT(*) AS n, date(MIN(transDate), 'localtime') AS a, date(MAX(transDate), 'localtime') AS b FROM FuelTransaction GROUP BY transType`),
        q(`SELECT COUNT(*) AS n, date(MIN(orderDate) / 1000, 'unixepoch', 'localtime') AS a, date(MAX(orderDate) / 1000, 'unixepoch', 'localtime') AS b FROM FuelDelivery`),
        (prisma as any).uploadedFile.findMany({ orderBy: { uploadedAt: "desc" }, select: { fileName: true, rowCount: true, uploadedAt: true } }) as Promise<{ fileName: string; rowCount: number; uploadedAt: Date }[]>,
        q(`SELECT COUNT(*) AS n, SUM(transQty) AS litres FROM FuelTransaction WHERE transType = 'FIS' AND fuelType = 'Unknown'`),
        getOilSummary(),
    ]);
    const of = (t: string) => types.find(r => r.type === t);
    const fis = of("FIS"), fre = of("FRE"), del = deliveries[0];
    const issuesTo = (fis?.b as string | null) ?? null;

    const sources: SourceCoverage[] = [
        { key: "issues", label: "Fuel issues", report: "HR580 tank report", rows: Number(fis?.n || 0), firstDay: (fis?.a as string) ?? null, lastDay: issuesTo, daysBehind: 0 },
        { key: "tankReceipts", label: "Tank receipts", report: "HR440 stores report", rows: Number(fre?.n || 0), firstDay: (fre?.a as string) ?? null, lastDay: (fre?.b as string) ?? null, daysBehind: gap((fre?.b as string) ?? null, issuesTo) },
        { key: "deliveries", label: "Supplier deliveries", report: "HR640 delivery register", rows: Number(del?.n || 0), firstDay: (del?.a as string) ?? null, lastDay: (del?.b as string) ?? null, daysBehind: gap((del?.b as string) ?? null, issuesTo) },
    ];

    return {
        sources,
        otherRows: types.filter(r => r.type !== "FIS" && r.type !== "FRE").map(r => ({ type: String(r.type ?? "Unlabelled"), rows: Number(r.n) })).sort((a, b) => b.rows - a.rows),
        uploads: {
            count: uploads.length,
            lastAt: uploads[0] ? new Date(uploads[0].uploadedAt).toISOString() : null,
            lastName: uploads[0]?.fileName ?? null,
            emptyUploads: uploads.filter(u => u.rowCount === 0).length,
        },
        unknownFuelIssues: { rows: Number(unknown[0]?.n || 0), litres: Number(unknown[0]?.litres || 0) },
        oil,
    };
}
