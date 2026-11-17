import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

/** The signed-in person's own account. Everyone can read and rename their own; nobody else's is reachable here. */
export async function GET() {
    const me = await requireSession();
    if (me instanceof NextResponse) return me;
    const user = await prisma.user.findUnique({ where: { id: me.id }, select: { name: true, email: true, role: true, createdAt: true } });
    if (!user) return NextResponse.json({ error: "Your account was not found." }, { status: 404 });
    return NextResponse.json({ account: user });
}

export async function POST(req: Request) {
    const me = await requireSession();
    if (me instanceof NextResponse) return me;
    const parsed = z.object({ name: z.string().trim().min(1, "Enter your name.").max(80) }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Enter your name, up to 80 characters." }, { status: 400 });
    const before = await prisma.user.findUnique({ where: { id: me.id }, select: { name: true } });
    await prisma.user.update({ where: { id: me.id }, data: { name: parsed.data.name } });
    if ((before?.name ?? "") !== parsed.data.name) await audit({ name: parsed.data.name, email: me.email }, "Users", `${me.email} changed their own name from ${before?.name || "empty"} to ${parsed.data.name}`);
    return NextResponse.json({ name: parsed.data.name });
}
