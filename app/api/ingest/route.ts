import { NextRequest, NextResponse } from "next/server";
import { processExcelFile } from "@/lib/ingestion";

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        console.log("Processing file:", file.name, "Size:", file.size);

        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await processExcelFile(buffer, file.name);

        console.log("Upload successful:", result);

        return NextResponse.json({
            success: true,
            count: result.count,
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
