import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireRole } from "@/lib/auth";
import { UPLOAD_TEMPLATES, isTemplateKey } from "@/lib/upload-templates";

/**
 * Blank upload templates, admin only. Generated from the same header lists the
 * parsers route on, so a template can never drift from what the ingester accepts.
 */
export async function GET(req: NextRequest) {
    const _auth = await requireRole(); if (_auth instanceof NextResponse) return _auth;

    const format = req.nextUrl.searchParams.get("format");
    if (!isTemplateKey(format)) {
        return NextResponse.json(
            { error: `Unknown template. Expected one of: ${Object.keys(UPLOAD_TEMPLATES).join(", ")}` },
            { status: 400 },
        );
    }

    const t = UPLOAD_TEMPLATES[format];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([t.headers, ...t.sampleRows]),
        t.sheetName,
    );

    // Guidance travels with the file, so whoever fills it in has the rules to
    // hand: what the report is, what each column means, and the format traps.
    const guidance: (string | undefined)[][] = [
        [t.label],
        [t.description],
        [],
        ["What this data is"],
        ...t.briefing.map(line => [line]),
    ];
    if (t.glossary?.length) {
        guidance.push([], ["Column", "Meaning"], ...t.glossary.map(([c, m]) => [c, m]));
    }
    guidance.push(
        [],
        ["Notes"],
        ...t.notes.map(n => [n]),
        [],
        ["The example rows on the data sheet are illustrative — delete them before uploading."],
    );

    const guideSheet = XLSX.utils.aoa_to_sheet(guidance);
    guideSheet["!cols"] = [{ wch: 18 }, { wch: 86 }];
    XLSX.utils.book_append_sheet(wb, guideSheet, "How to use");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new NextResponse(new Uint8Array(buf), {
        headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="${t.fileName}"`,
            "Cache-Control": "no-store",
        },
    });
}
