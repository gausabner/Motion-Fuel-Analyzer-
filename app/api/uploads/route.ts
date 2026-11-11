import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

// List recent uploads (admin only) so their original files can be re-downloaded
// via /api/uploads/[id].
export async function GET() {
    const auth = await requireRole(); if (auth instanceof NextResponse) return auth;
    const uploads = await (prisma as any).uploadedFile.findMany({
        orderBy: { uploadedAt: "desc" },
        take: 100,
        select: { id: true, fileName: true, fileSize: true, rowCount: true, uploadedAt: true },
    });
    return NextResponse.json({ uploads });
}
