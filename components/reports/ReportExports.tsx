"use client";

import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export type ReportSection = {
    title: string;
    headers: string[];
    rows: (string | number)[][];
    note?: string;
};

function csvEscape(value: string | number): string {
    const s = String(value ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export function buildCsv(headers: string[], rows: (string | number)[][]): string {
    return [headers.map(csvEscape).join(","), ...rows.map(r => r.map(csvEscape).join(","))].join("\n");
}

/** Small per-table CSV download button. If `serverUrl` is set, downloads the
 * complete dataset from the API instead of the rows rendered on screen. */
export function TableCsvButton({ filename, headers, rows, serverUrl }: {
    filename: string;
    headers?: string[];
    rows?: (string | number)[][];
    serverUrl?: string;
}) {
    const handleClick = () => {
        if (serverUrl) {
            window.location.href = serverUrl;
            return;
        }
        if (!headers || !rows) return;
        downloadBlob(new Blob([buildCsv(headers, rows)], { type: "text/csv;charset=utf-8" }), filename);
    };
    return (
        <Button
            variant="outline" size="sm" onClick={handleClick}
            className="h-8 font-bold uppercase text-[10px] tracking-wider"
        >
            <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
        </Button>
    );
}

/** Generates the complete styled PDF fuel report from all sections. */
export function FullReportPdfButton({ title, subtitle, sections }: {
    title: string;
    subtitle: string;
    sections: ReportSection[];
}) {
    const [generating, setGenerating] = useState(false);

    const handleExport = async () => {
        setGenerating(true);
        try {
            const { jsPDF } = await import("jspdf");
            const autoTable = (await import("jspdf-autotable")).default;

            const doc = new jsPDF({ unit: "pt", format: "a4" });
            const pageWidth = doc.internal.pageSize.getWidth();

            // Cover header — Municipal Blue theme (ink + blue accent)
            doc.setFillColor(15, 23, 42);          // ink #0F172A
            doc.rect(0, 0, pageWidth, 90, "F");
            doc.setFillColor(37, 99, 235);          // blue #2563EB accent
            doc.rect(0, 90, pageWidth, 5, "F");
            doc.setTextColor(255, 255, 255);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(20);
            doc.text(title, 40, 42);
            doc.setFontSize(10);
            doc.setTextColor(147, 197, 253);        // blue-300 #93C5FD
            doc.text(subtitle, 40, 62);
            doc.setTextColor(148, 163, 184);        // slate-400
            doc.setFont("helvetica", "normal");
            doc.text(`Generated ${new Date().toLocaleString()}`, 40, 78);

            let y = 120;
            for (const section of sections) {
                if (section.rows.length === 0) continue;

                doc.setFont("helvetica", "bold");
                doc.setFontSize(12);
                doc.setTextColor(15, 23, 42);        // ink
                doc.text(section.title.toUpperCase(), 40, y);
                if (section.note) {
                    doc.setFont("helvetica", "normal");
                    doc.setFontSize(8);
                    doc.setTextColor(100, 116, 139);  // slate-500
                    doc.text(section.note, 40, y + 12);
                    y += 12;
                }

                autoTable(doc, {
                    startY: y + 8,
                    head: [section.headers],
                    body: section.rows.map(r => r.map(String)),
                    margin: { left: 40, right: 40 },
                    styles: { fontSize: 7, cellPadding: 3 },
                    headStyles: { fillColor: [15, 23, 42], textColor: [147, 197, 253], fontStyle: "bold" },
                    alternateRowStyles: { fillColor: [248, 250, 252] },
                });

                y = (doc as any).lastAutoTable.finalY + 30;
                if (y > doc.internal.pageSize.getHeight() - 120) {
                    doc.addPage();
                    y = 50;
                }
            }

            // Page numbers
            const pageCount = doc.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(7);
                doc.setTextColor(150, 150, 150);
                doc.text(
                    `Motion Fuel Analyzer — page ${i} of ${pageCount}`,
                    pageWidth - 40,
                    doc.internal.pageSize.getHeight() - 20,
                    { align: "right" }
                );
            }

            doc.save(`fuel_report_${new Date().toISOString().split("T")[0]}.pdf`);
            toast.success("PDF report downloaded");
        } catch (e) {
            console.error("PDF generation failed:", e);
            toast.error("PDF generation failed");
        } finally {
            setGenerating(false);
        }
    };

    return (
        <Button
            onClick={handleExport}
            disabled={generating}
            className="h-11 px-6 font-semibold"
        >
            <FileText className="h-4 w-4 mr-2" />
            {generating ? "Generating…" : "Export PDF report"}
        </Button>
    );
}
