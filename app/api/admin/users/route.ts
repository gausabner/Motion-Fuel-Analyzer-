import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { z } from "zod";
import bcrypt from "bcryptjs";

const ROLES = ["SUPER_ADMIN", "SYSTEM_ADMIN", "SYSTEM_HEAD", "EMPLOYEE"] as const;

// GET — list all users (admin only). Never returns password hashes.
export async function GET() {
    const auth = await requireRole(); if (auth instanceof NextResponse) return auth;
    const users = await prisma.user.findMany({
        select: { id: true, email: true, name: true, role: true, status: true, createdAt: true },
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({ users });
}

const createSchema = z.object({
    email: z.string().email().max(200),
    name: z.string().trim().min(1).max(120),
    role: z.enum(ROLES),
    password: z.string().min(8).max(200),
});

// POST — admin creates an ACTIVE user directly.
export async function POST(req: NextRequest) {
    const auth = await requireRole(); if (auth instanceof NextResponse) return auth;

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }
    const email = parsed.data.email.trim().toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        return NextResponse.json({ error: "A user with that email already exists" }, { status: 409 });
    }

    const user = await prisma.user.create({
        data: {
            email,
            name: parsed.data.name,
            role: parsed.data.role,
            password: await bcrypt.hash(parsed.data.password, 10),
            status: "ACTIVE",
        },
        select: { id: true, email: true, name: true, role: true, status: true },
    });
    return NextResponse.json({ success: true, user });
}
