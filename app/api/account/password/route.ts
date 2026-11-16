import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

const schema = z.object({ current: z.string().min(1).max(200), next: z.string().min(8).max(200) });

/** Change your own password. The current one is required, so an unattended session cannot be used to take the account over. */
export async function POST(req: Request) {
    const me = await requireSession();
    if (me instanceof NextResponse) return me;
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Enter your current password and a new one of at least 8 characters." }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { id: me.id }, select: { password: true } });
    if (!user?.password || !(await bcrypt.compare(parsed.data.current, user.password))) {
        return NextResponse.json({ error: "The current password is not right.", field: "current" }, { status: 400 });
    }
    if (parsed.data.current === parsed.data.next) {
        return NextResponse.json({ error: "The new password is the same as the current one.", field: "next" }, { status: 400 });
    }
    await prisma.user.update({ where: { id: me.id }, data: { password: await bcrypt.hash(parsed.data.next, 10) } });
    await audit(me, "Users", `${me.email} changed their own password`);
    return NextResponse.json({ ok: true });
}
