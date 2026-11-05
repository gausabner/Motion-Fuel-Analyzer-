import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, getSessionUser } from "@/lib/auth";
import { z } from "zod";
import bcrypt from "bcryptjs";

const ROLES = ["SUPER_ADMIN", "SYSTEM_ADMIN", "SYSTEM_HEAD", "EMPLOYEE"] as const;

const patchSchema = z.object({
    status: z.enum(["ACTIVE", "PENDING", "DISABLED"]).optional(),
    role: z.enum(ROLES).optional(),
    password: z.string().min(8).max(200).optional(),
}).refine(d => d.status || d.role || d.password, { message: "Nothing to update" });

// PATCH — approve/disable, change role, or reset password (admin only).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireRole(); if (auth instanceof NextResponse) return auth;
    const { id } = await params;

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const data: any = {};
    if (parsed.data.status) data.status = parsed.data.status;
    if (parsed.data.role) data.role = parsed.data.role;
    if (parsed.data.password) data.password = await bcrypt.hash(parsed.data.password, 10);

    const user = await prisma.user.update({
        where: { id },
        data,
        select: { id: true, email: true, name: true, role: true, status: true },
    });
    return NextResponse.json({ success: true, user });
}

// DELETE — remove a user (admin only; cannot delete yourself).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireRole(); if (auth instanceof NextResponse) return auth;
    const { id } = await params;

    const me = await getSessionUser();
    if (me?.id === id) {
        return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
    }
    await prisma.user.delete({ where: { id } }).catch(() => null);
    return NextResponse.json({ success: true });
}
