"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Section } from "./parts";
import type { DataCoverage } from "@/lib/data-coverage";

const dayLabel = (ymd: string | null) => { if (!ymd) return "nothing yet"; const [y, m, d] = ymd.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); };
const TYPE_NAMES: Record<string, string> = { ISS: "Stores issues", GRN: "Goods received notes", RET: "Returns", TRN: "Transfers" };

/** Which report each figure rests on, and how far each one reaches. Read-only. */
export function DataSection() {
    const [data, setData] = useState<DataCoverage | null>(null);

    useEffect(() => {
        fetch("/api/settings/data").then(r => r.json()).then(d => { if (d.sources) setData(d); })
            .catch(() => toast.error("The data summary could not be loaded. Reload the page to try again."));
    }, []);

    if (!data) return <div className="skel h-64" aria-busy="true" aria-label="Loading the data summary" />;

    const behind = data.sources.filter(s => s.daysBehind > 31);
    const otherTotal = data.otherRows.reduce((n, r) => n + r.rows, 0);

    return (
        <Section id="data" title="Data on record"
            sub="Every figure is only as current as the report behind it. This shows how far each uploaded report reaches.">
            <div className="mt-3 overflow-x-auto">
                <table className="w-full border-separate border-spacing-0 text-[13px]">
                    <thead><tr>
                        {["Source", "Report", "Rows", "From", "To", "Against fuel issues"].map((h, i) => (
                            <th key={h} className={`relative whitespace-nowrap bg-surface-2 px-2.5 py-2 text-[11.5px] font-medium text-muted-foreground first:rounded-l-[10px] last:rounded-r-[10px] ${i === 2 ? "text-right" : "text-left"}`}>{h}</th>
                        ))}
                    </tr></thead>
                    <tbody>
                        {data.sources.map(s => (
                            <tr key={s.key}>
                                <td className="border-b border-grid px-2.5 py-2.5 font-medium">{s.label}</td>
                                <td className="border-b border-grid px-2.5 py-2.5 text-muted-foreground">{s.report}</td>
                                <td className="mono border-b border-grid px-2.5 py-2.5 text-right">{s.rows.toLocaleString("en-GB")}</td>
                                <td className="mono whitespace-nowrap border-b border-grid px-2.5 py-2.5">{dayLabel(s.firstDay)}</td>
                                <td className="mono whitespace-nowrap border-b border-grid px-2.5 py-2.5">{dayLabel(s.lastDay)}</td>
                                <td className="border-b border-grid px-2.5 py-2.5">
                                    {s.key === "issues" ? <span className="text-muted-foreground">The reference</span>
                                        : s.rows === 0 ? <span className="sev hi">Nothing uploaded</span>
                                            : s.daysBehind > 31 ? <span className="sev md">{s.daysBehind} days behind</span>
                                                : <span className="sev ok">Up to date</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <ul className="mt-4 flex flex-col gap-2.5 text-[13px] leading-normal">
                {behind.map(s => (
                    <li key={s.key} className="max-w-[80ch]">
                        <strong className="font-medium">{s.label} stop on {dayLabel(s.lastDay)}.</strong>{" "}
                        <span className="text-muted-foreground">
                            {s.key === "tankReceipts"
                                ? "Tank levels and the book position cannot be worked out past that date, and Issues vs receipts will show issues with nothing against them."
                                : "Fuel bought after that date is missing from Issues vs receipts and from the cost of fuel received."}
                        </span>
                    </li>
                ))}
                {data.unknownFuelIssues.rows > 0 && (
                    <li className="max-w-[80ch]">
                        <strong className="font-medium">{data.unknownFuelIssues.rows.toLocaleString("en-GB")} fuel issues have no fuel type</strong>{" "}
                        <span className="text-muted-foreground">({Math.round(data.unknownFuelIssues.litres).toLocaleString("en-GB")} L). They come from stores that are not in the tank register. <Link href="#tanks" className="lnk">Add those stores as tanks</Link> to classify them.</span>
                    </li>
                )}
                {otherTotal > 0 && (
                    <li className="max-w-[80ch]">
                        <strong className="font-medium">{otherTotal.toLocaleString("en-GB")} rows are stores movements, not fuel.</strong>{" "}
                        <span className="text-muted-foreground">
                            {data.otherRows.map(r => `${r.rows.toLocaleString("en-GB")} ${(TYPE_NAMES[r.type] ?? r.type).toLowerCase()}`).join(", ")}.
                            They appear on Fuel logs only and are left out of every fuel total.
                        </span>
                    </li>
                )}
                {data.uploads.emptyUploads > 0 && (
                    <li className="max-w-[80ch]">
                        <strong className="font-medium">{data.uploads.emptyUploads} of {data.uploads.count} uploads added no rows.</strong>{" "}
                        <span className="text-muted-foreground">Usually a file uploaded twice, which is harmless, or a report in a layout that was not recognised. <Link href="/dashboard/upload" className="lnk">Review the uploads</Link></span>
                    </li>
                )}
            </ul>

            <p className="mt-4 text-[13px] text-muted-foreground">
                {data.uploads.lastAt
                    ? `Last upload: ${data.uploads.lastName} on ${new Date(data.uploads.lastAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.`
                    : "Nothing has been uploaded yet."}
            </p>
        </Section>
    );
}
