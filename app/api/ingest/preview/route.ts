import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireRole } from "@/lib/auth";
import { validateUploadFile } from "@/lib/upload-validation";
import { isHr640Sheet } from "@/lib/ingestion-hr640";

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
            const sheet = workbook.Sheets[sheetName];
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

            // HR640 (procurement) is checked first; anything else is judged as
            // HR580, matching the router in lib/ingestion.ts.
            if (isHr640Sheet(headerRow)) {
                return {
                    name: sheetName,
                    isEligible: true,
                    format: "hr640",
                    formatLabel: "Fuel deliveries (HR640)",
                    missingColumns: [],
                };
            }

            const hasTank = headerRow.some(h => ["tank", "store no", "store"].includes(h));
            const hasDate = headerRow.some(h => ["issue date", "trans date", "date"].includes(h));
            const hasQty = headerRow.some(h => ["issue qty", "trans qty", "qty"].includes(h));

            const missingColumns = [];
            if (!hasTank) missingColumns.push("Tank/Store");
            if (!hasDate) missingColumns.push("Date");
            if (!hasQty) missingColumns.push("Quantity");

            return {
                name: sheetName,
                isEligible: missingColumns.length === 0,
                format: "hr580",
                formatLabel: "Fuel transactions (HR580)",
                missingColumns
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
