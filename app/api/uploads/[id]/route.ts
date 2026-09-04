import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";

// Admin-only re-download of an original uploaded spreadsheet, streamed from the
// non-public storage directory. The raw files are NOT statically served.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireRole(); if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const rec = await (prisma as any).uploadedFile.findUnique({ where: { id } });
    if (!rec) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Resolve and confirm the path stays inside storage/uploads (traversal guard).
    const baseDir = path.join(process.cwd(), "storage", "uploads");
    const abs = path.resolve(process.cwd(), rec.filePath);
    if (!abs.startsWith(baseDir + path.sep)) {
        return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }

    const data = await fs.readFile(abs).catch(() => null);
    if (!data) {
        return NextResponse.json({ error: "File is no longer on disk" }, { status: 404 });
    }

    const safeName = (rec.fileName || `upload-${id}`).replace(/[^\w.\- ]/g, "_");
    return new NextResponse(new Uint8Array(data), {
        headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename="${safeName}"`,
            "Content-Length": String(data.length),
        },
    });
}
