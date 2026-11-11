import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

const Body = z.object({
    key: z.string().min(3).max(200),
    status: z.enum(["Open", "Explained", "Escalated"]),
});

/**
 * Record (or undo) a human review of a computed exception. "Open" deletes the
 * review, which is what Undo sends — the exception itself is recomputed from
 * the fills and never stored.
 */
export async function POST(req: Request) {
    const user = await requireSession();
    if (user instanceof NextResponse) return user;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid review" }, { status: 400 });
    const { key, status } = parsed.data;

    if (status === "Open") {
        await (prisma as any).exceptionReview.deleteMany({ where: { key } });
    } else {
        const data = { status: status.toUpperCase(), reviewedBy: user.email, reviewedAt: new Date() };
        await (prisma as any).exceptionReview.upsert({ where: { key }, update: data, create: { key, ...data } });
    }
    return NextResponse.json({ ok: true });
}
