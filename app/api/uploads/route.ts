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
        select: { id: true, fileName: true, fileSize: true, rowCount: true, uploadedAt: true, rolledBackAt: true, rolledBackBy: true },
    });
    // How many rows are still on record from each upload: only those can be removed again.
    const linked = (await prisma.$queryRawUnsafe(`
        SELECT uploadId, COUNT(*) AS n FROM (
            SELECT uploadId FROM FuelTransaction WHERE uploadId IS NOT NULL
            UNION ALL SELECT uploadId FROM FuelDelivery WHERE uploadId IS NOT NULL
        ) GROUP BY uploadId`)) as { uploadId: string; n: number | bigint }[];
    const byId = new Map(linked.map(l => [l.uploadId, Number(l.n)]));
    return NextResponse.json({ uploads: uploads.map((u: any) => ({ ...u, linkedRows: byId.get(u.id) ?? 0 })) });
}
