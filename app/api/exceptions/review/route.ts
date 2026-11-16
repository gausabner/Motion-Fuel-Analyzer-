import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { getEscalationRecipient } from "@/lib/escalation";

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

    let escalatedTo: string | null = null;
    if (status === "Open") {
        await (prisma as any).exceptionReview.deleteMany({ where: { key } });
    } else {
        // An escalation is addressed to whoever is set to receive them at that moment.
        if (status === "Escalated") escalatedTo = (await getEscalationRecipient())?.name ?? null;
        const data = { status: status.toUpperCase(), reviewedBy: user.email, reviewedAt: new Date(), escalatedTo };
        await (prisma as any).exceptionReview.upsert({ where: { key }, update: data, create: { key, ...data } });
    }
    // The key reads rule:unit:day:reference, which is enough to find the fill again.
    const [rule, unit, day] = key.split(":");
    await audit(user, "Exceptions", `${unit} ${rule.replace(/-/g, " ")}${/^\d{4}-/.test(day ?? "") ? ` on ${day}` : ""} ${status === "Open" ? "reopened" : status === "Escalated" ? `escalated${escalatedTo ? ` to ${escalatedTo}` : ""}` : `marked ${status.toLowerCase()}`}`);
    return NextResponse.json({ ok: true, escalatedTo });
}
