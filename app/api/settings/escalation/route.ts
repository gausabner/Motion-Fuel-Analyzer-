import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getEscalationRecipient } from "@/lib/escalation";

export async function GET() {
    const user = await requireSession();
    if (user instanceof NextResponse) return user;
    const r = await getEscalationRecipient();
    return NextResponse.json({ recipient: r ? { id: r.id, name: r.name } : null });
}

/** Choose who escalated exceptions go to, or pass null to clear it. */
export async function POST(req: Request) {
    const user = await requireRole();
    if (user instanceof NextResponse) return user;
    const parsed = z.object({ userId: z.string().min(1).nullable() }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Choose a person, or no one." }, { status: 400 });

    const before = await getEscalationRecipient();
    let name = "no one";
    if (parsed.data.userId) {
        const target = await prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { name: true, email: true, status: true } });
        if (!target || target.status !== "ACTIVE") return NextResponse.json({ error: "That person does not have an active account." }, { status: 400 });
        name = target.name || target.email;
    }
    await prisma.systemSettings.upsert({
        where: { id: "global" },
        update: { escalationUserId: parsed.data.userId },
        create: { id: "global", escalationUserId: parsed.data.userId },
    });
    if ((before?.id ?? null) !== parsed.data.userId) {
        await audit(user, "Settings", `Escalated exceptions now go to ${name}${before ? ` (was ${before.name})` : ""}`);
    }
    const r = await getEscalationRecipient();
    return NextResponse.json({ recipient: r ? { id: r.id, name: r.name } : null });
}
