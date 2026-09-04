import { NextRequest, NextResponse } from "next/server";
import { processExcelFile } from "@/lib/ingestion";
import { requireRole } from "@/lib/auth";
import { validateUploadFile } from "@/lib/upload-validation";

export async function POST(req: NextRequest) {
    const _auth = await requireRole(); if (_auth instanceof NextResponse) return _auth;
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        const selectedSheetsStr = formData.get("selectedSheets") as string;
        
        let selectedSheets: string[] | undefined = undefined;
        if (selectedSheetsStr) {
            try {
                selectedSheets = JSON.parse(selectedSheetsStr);
            } catch (e) {
                console.warn("Invalid selectedSheets JSON:", selectedSheetsStr);
            }
        }

        const validationError = validateUploadFile(file);
        if (validationError) {
            return NextResponse.json({ error: validationError }, { status: 400 });
        }

        console.log("Processing file:", file.name, "Size:", file.size, "Sheets:", selectedSheets);

        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await processExcelFile(buffer, file.name, selectedSheets);

        console.log("Upload successful:", result);

        // HR640 (procurement) and HR580 (tank movements) return different
        // shapes; the format field tells the client which it got.
        if (result.format === "hr640") {
            return NextResponse.json({
                success: true,
                format: "hr640",
                count: result.created + result.updated,
                created: result.created,
                updated: result.updated,
                totalProcessed: result.totalProcessed,
                outstandingOrders: result.outstandingOrders,
                receivedLitres: result.receivedLitres,
                errors: result.errors.length,
                errorDetail: result.errors.slice(0, 10),
            });
        }

        return NextResponse.json({
            success: true,
            format: "hr580",
            count: result.count,
            duplicates: result.duplicates,
            totalProcessed: result.totalProcessed,
            errors: result.errors
        });

    } catch (error) {
        console.error("Upload error details:", error);
        console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace');
        console.error("Error message:", error instanceof Error ? error.message : String(error));

        return NextResponse.json({
            error: "Internal Server Error",
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}
