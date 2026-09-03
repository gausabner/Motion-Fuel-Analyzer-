"use client";

import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { CompareRow } from "@/lib/analytics";

type Totals = {
    aVolume: number; bVolume: number; aCost: number; bCost: number;
    aTxns: number; bTxns: number; deltaVolume: number; deltaPct: number | null;
};

type FuelStat = { aVolume: number; aCost: number; bVolume: number; bCost: number };

export function ComparePdfButton({
    dimensionLabel, aLabel, bLabel, activeFilters, currency, rows, totals, petrol, diesel,
}: {
    dimensionLabel: string;
    aLabel: string;
    bLabel: string;
    activeFilters: string;
    currency: string;
    rows: CompareRow[];
    totals: Totals;
    petrol?: FuelStat;
    diesel?: FuelStat;
}) {
    const [generating, setGenerating] = useState(false);

    const handleExport = async () => {
        setGenerating(true);
        try {
            const { jsPDF } = await import("jspdf");
            const autoTable = (await import("jspdf-autotable")).default;

            const doc = new jsPDF({ unit: "pt", format: "a4" });
            const pageWidth = doc.internal.pageSize.getWidth();

            // Header — Municipal Blue theme (ink + blue accent)
            doc.setFillColor(15, 23, 42);          // ink #0F172A
            doc.rect(0, 0, pageWidth, 92, "F");
            doc.setFillColor(37, 99, 235);          // blue #2563EB
            doc.rect(0, 92, pageWidth, 5, "F");
            doc.setTextColor(255, 255, 255);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(19);
            doc.text("Period comparison report", 40, 40);
            doc.setFontSize(10);
            doc.setTextColor(147, 197, 253);        // blue-300
            doc.text(`${dimensionLabel}  ·  Period A: ${aLabel}   vs   Period B: ${bLabel}`, 40, 60);
            doc.setTextColor(148, 163, 184);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.text(`${activeFilters ? "Filters: " + activeFilters + "   ·   " : ""}Generated ${new Date().toLocaleString()}  ·  FIS consumption only`, 40, 78);

            // Summary line
            const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
            const deltaStr = `${totals.deltaVolume >= 0 ? "+" : ""}${fmt(totals.deltaVolume)} L` +
                (totals.deltaPct === null ? "" : ` (${totals.deltaPct >= 0 ? "+" : ""}${totals.deltaPct.toFixed(1)}%)`);
            doc.setTextColor(15, 23, 42);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(11);
            doc.text(
                `Total: ${fmt(totals.aVolume)} L  →  ${fmt(totals.bVolume)} L    Change: ${deltaStr}`,
                40, 122,
            );

            let cursorY = 136;

            // Petrol vs diesel section (volume + cost) — always included when provided.
            if (petrol && diesel) {
                const tot = {
                    aVol: petrol.aVolume + diesel.aVolume, aCost: petrol.aCost + diesel.aCost,
                    bVol: petrol.bVolume + diesel.bVolume, bCost: petrol.bCost + diesel.bCost,
                };
                const fuelRow = (name: string, s: FuelStat) => {
                    const dVol = s.bVolume - s.aVolume, dCost = s.bCost - s.aCost;
                    return [
                        name, fmt(s.aVolume), `${currency}${fmt(s.aCost)}`, fmt(s.bVolume), `${currency}${fmt(s.bCost)}`,
                        `${dVol >= 0 ? "+" : ""}${fmt(dVol)}`, `${dCost >= 0 ? "+" : ""}${currency}${fmt(dCost)}`,
                    ];
                };
                doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(15, 23, 42);
                doc.text("Petrol vs diesel — consumption & cost", 40, cursorY);
                autoTable(doc, {
                    startY: cursorY + 8,
                    head: [["Fuel", "A · Volume (L)", "A · Cost", "B · Volume (L)", "B · Cost", "Δ Volume (L)", "Δ Cost"]],
                    body: [
                        fuelRow("Petrol", petrol),
                        fuelRow("Diesel", diesel),
                        ["TOTAL", fmt(tot.aVol), `${currency}${fmt(tot.aCost)}`, fmt(tot.bVol), `${currency}${fmt(tot.bCost)}`,
                            `${tot.bVol - tot.aVol >= 0 ? "+" : ""}${fmt(tot.bVol - tot.aVol)}`,
                            `${tot.bCost - tot.aCost >= 0 ? "+" : ""}${currency}${fmt(tot.bCost - tot.aCost)}`],
                    ],
                    margin: { left: 40, right: 40 },
                    styles: { fontSize: 8, cellPadding: 4 },
                    headStyles: { fillColor: [15, 23, 42], textColor: [147, 197, 253], fontStyle: "bold" },
                    alternateRowStyles: { fillColor: [248, 250, 252] },
                    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
                    didParseCell: (d: any) => {
                        if (d.section === "body" && (d.column.index === 5 || d.column.index === 6)) {
                            const raw = String(d.cell.raw).replace(currency, "");
                            if (raw.startsWith("-")) d.cell.styles.textColor = [5, 150, 105];
                            else if (raw.startsWith("+")) d.cell.styles.textColor = [220, 38, 38];
                        }
                        if (d.section === "body" && d.row.index === 2) d.cell.styles.fontStyle = "bold";
                    },
                });
                cursorY = (doc as any).lastAutoTable.finalY + 28;
            }

            // Main dimension table
            doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(15, 23, 42);
            doc.text(`Comparison by ${dimensionLabel.toLowerCase()}`, 40, cursorY);
            cursorY += 8;
            const head = [[dimensionLabel, "A · Volume (L)", "A · Cost", "B · Volume (L)", "B · Cost", "Change (L)", "Change (%)"]];
            const body = rows.map(r => [
                r.key,
                fmt(r.aVolume), `${currency}${fmt(r.aCost)}`,
                fmt(r.bVolume), `${currency}${fmt(r.bCost)}`,
                `${r.deltaVolume >= 0 ? "+" : ""}${fmt(r.deltaVolume)}`,
                r.deltaPct === null ? "n/a" : `${r.deltaPct >= 0 ? "+" : ""}${r.deltaPct.toFixed(1)}%`,
            ]);
            body.push([
                "TOTAL",
                fmt(totals.aVolume), `${currency}${fmt(totals.aCost)}`,
                fmt(totals.bVolume), `${currency}${fmt(totals.bCost)}`,
                `${totals.deltaVolume >= 0 ? "+" : ""}${fmt(totals.deltaVolume)}`,
                totals.deltaPct === null ? "n/a" : `${totals.deltaPct >= 0 ? "+" : ""}${totals.deltaPct.toFixed(1)}%`,
            ]);

            autoTable(doc, {
                startY: cursorY + 8,
                head,
                body,
                margin: { left: 40, right: 40 },
                styles: { fontSize: 8, cellPadding: 4 },
                headStyles: { fillColor: [15, 23, 42], textColor: [147, 197, 253], fontStyle: "bold" },
                alternateRowStyles: { fillColor: [248, 250, 252] },
                columnStyles: {
                    1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" },
                    4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" },
                },
                // Colour the change columns green (down) / red (up) per row.
                didParseCell: (d: any) => {
                    if (d.section === "body" && (d.column.index === 5 || d.column.index === 6)) {
                        const raw = String(d.cell.raw);
                        if (raw.startsWith("-")) d.cell.styles.textColor = [5, 150, 105];
                        else if (raw.startsWith("+")) d.cell.styles.textColor = [220, 38, 38];
                    }
                    if (d.section === "body" && d.row.index === body.length - 1) {
                        d.cell.styles.fontStyle = "bold";
                    }
                },
            });

            const pageCount = doc.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(7);
                doc.setTextColor(150, 150, 150);
                doc.text(`Motion Fuel Analyzer — page ${i} of ${pageCount}`, pageWidth - 40, doc.internal.pageSize.getHeight() - 20, { align: "right" });
            }

            doc.save(`period_comparison_${new Date().toISOString().split("T")[0]}.pdf`);
            toast.success("Comparison PDF downloaded");
        } catch (e) {
            console.error("PDF generation failed:", e);
            toast.error("PDF generation failed");
        } finally {
            setGenerating(false);
        }
    };

    return (
        <Button onClick={handleExport} disabled={generating} className="h-11 px-6 font-semibold">
            <FileText className="h-4 w-4 mr-2" />
            {generating ? "Generating…" : "Export PDF"}
        </Button>
    );
}
