"use client";

import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { drawFooters, drawLetterhead, drawSignatory, type PdfOrganisation } from "@/lib/pdf-brand";
import type { CompareRow } from "@/lib/analytics";

type Totals = {
    aVolume: number; bVolume: number; aCost: number; bCost: number;
    aTxns: number; bTxns: number; deltaVolume: number; deltaPct: number | null;
};

type FuelStat = { aVolume: number; aCost: number; bVolume: number; bCost: number };

export function ComparePdfButton({
    dimensionLabel, aLabel, bLabel, activeFilters, currency, rows, totals, petrol, diesel, organisation,
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
    organisation?: PdfOrganisation;
}) {
    const [generating, setGenerating] = useState(false);

    const handleExport = async () => {
        setGenerating(true);
        try {
            const { jsPDF } = await import("jspdf");
            const autoTable = (await import("jspdf-autotable")).default;

            const doc = new jsPDF({ unit: "pt", format: "a4" });
            const pageWidth = doc.internal.pageSize.getWidth();

            const headerEnd = drawLetterhead(doc, organisation, "Period comparison", [
                `By ${dimensionLabel.toLowerCase()} · Period A: ${aLabel} · Period B: ${bLabel}`,
                `${activeFilters ? "Filters: " + activeFilters + " · " : ""}Fuel issues only · Generated ${new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`,
            ]);

            // Summary line
            const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
            const deltaStr = `${totals.deltaVolume >= 0 ? "+" : ""}${fmt(totals.deltaVolume)} L` +
                (totals.deltaPct === null ? "" : ` (${totals.deltaPct >= 0 ? "+" : ""}${totals.deltaPct.toFixed(1)}%)`);
            doc.setTextColor(11, 19, 36);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(11);
            doc.text(
                `Total: ${fmt(totals.aVolume)} L to ${fmt(totals.bVolume)} L. Change: ${deltaStr}`,
                40, headerEnd,
            );

            let cursorY = headerEnd + 14;

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
                doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(11, 19, 36);
                doc.text("Petrol and diesel: consumption and cost", 40, cursorY);
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
                    headStyles: { fillColor: [244, 247, 251], textColor: [91, 107, 130], fontStyle: "normal", lineColor: [226, 232, 241], lineWidth: { bottom: 0.2 } },
                    alternateRowStyles: { fillColor: [255, 255, 255] },
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
            doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(11, 19, 36);
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
                headStyles: { fillColor: [244, 247, 251], textColor: [91, 107, 130], fontStyle: "normal", lineColor: [226, 232, 241], lineWidth: { bottom: 0.2 } },
                alternateRowStyles: { fillColor: [255, 255, 255] },
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

            drawSignatory(doc, organisation, (doc as any).lastAutoTable?.finalY ?? headerEnd);
            drawFooters(doc, organisation);

            doc.save(`period_comparison_${new Date().toISOString().split("T")[0]}.pdf`);
            toast("Comparison PDF downloaded");
        } catch (e) {
            console.error("PDF generation failed:", e);
            toast.error("The PDF could not be created. Try again.");
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
