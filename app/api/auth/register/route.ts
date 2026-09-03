import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";

// Public self-registration. Creates a PENDING account that an admin must
// approve before it can sign in. Lives under /api/auth/* so it stays reachable
// without a session (middleware excludes /api/auth).
const schema = z.object({
    email: z.string().email().max(200),
    name: z.string().trim().min(1).max(120),
    password: z.string().min(8).max(200),
});

export async function POST(req: NextRequest) {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: "Please provide a valid name, email and a password of at least 8 characters." }, { status: 400 });
    }
    const email = parsed.data.email.trim().toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        // Don't reveal whether the email exists — respond the same either way.
        return NextResponse.json({ success: true, pending: true });
    }

    await prisma.user.create({
        data: {
            email,
            name: parsed.data.name,
            role: "EMPLOYEE",
            password: await bcrypt.hash(parsed.data.password, 10),
            status: "PENDING",
        },
    });
    return NextResponse.json({ success: true, pending: true });
}
