import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireRole } from "@/lib/auth";
import { validateUploadFile } from "@/lib/upload-validation";
import { detectDeliveryFormat } from "@/lib/ingestion-hr640";
import { normaliseSheet, type SheetLayout } from "@/lib/pipe-sheet";

const LAYOUT_NOTE: Record<SheetLayout, string> = {
    "pipe-delimited": "Raw export, split into columns",
    "split-headings": "Headings split across cells, rebuilt",
    "headings-lower-down": "Headings found below the first row",
};

export async function POST(req: NextRequest) {
    const _auth = await requireRole(); if (_auth instanceof NextResponse) return _auth;
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;

        const validationError = validateUploadFile(file);
        if (validationError) {
            return NextResponse.json({ error: validationError }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const workbook = XLSX.read(buffer, { type: "buffer" });
        
        const sheetsPreview = workbook.SheetNames.map(sheetName => {
            // Same rebuild the importer applies, so every known layout is judged by its real headings.
            const { sheet, layout } = normaliseSheet(workbook.Sheets[sheetName]);
            const note = layout ? LAYOUT_NOTE[layout] : null;
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
            
            if (!jsonData || jsonData.length === 0) {
                return { name: sheetName, isEligible: false, format: null, formatLabel: "Empty", missingColumns: ["Empty Sheet"] };
            }
            
            let headerRow: string[] = [];
            // Find the first row that seems to be a header row
            for (const row of jsonData) {
                if (row && row.length > 0) {
                    headerRow = row.map(cell => String(cell || "").trim().toLowerCase());
                    break;
                }
            }

            // Delivery reports are checked first; anything else is judged as
            // HR580, matching the router in lib/ingestion.ts.
            const delivery = detectDeliveryFormat(headerRow);
            if (delivery) {
                return {
                    name: sheetName,
                    isEligible: true,
                    format: delivery,
                    formatLabel: delivery === "hr940"
                        ? "Fuel deliveries, extended (HR940)"
                        : "Fuel deliveries (HR640)",
                    missingColumns: [],
                    note,
                };
            }

            const hasTank = headerRow.some(h => ["tank", "store no", "store"].includes(h));
            const hasDate = headerRow.some(h => ["issue date", "trans date", "date"].includes(h));
            const hasQty = headerRow.some(h => ["issue qty", "trans qty", "qty"].includes(h));

            const missingColumns = [];
            if (!hasTank) missingColumns.push("Tank/Store");
            if (!hasDate) missingColumns.push("Date");
            if (!hasQty) missingColumns.push("Quantity");

            const stores = headerRow.includes("tot on hand qty");
            return {
                name: sheetName,
                isEligible: missingColumns.length === 0,
                format: stores ? "hr440" : "hr580",
                formatLabel: stores ? "Stores report (HR440), with stock on hand" : "Fuel transactions (HR580)",
                missingColumns,
                note,
            };
        });

        return NextResponse.json({
            success: true,
            sheets: sheetsPreview
        });

    } catch (error) {
        console.error("Preview error details:", error);
        return NextResponse.json({
            error: "Internal Server Error",
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}
