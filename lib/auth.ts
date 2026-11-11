import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth-options";

export type SessionUser = { id: string; email: string; name?: string | null; role: string };

// Roles allowed to perform administrative mutations (create/update/delete,
// ingest, settings, user management, original-file download).
export const ADMIN_ROLES = ["SUPER_ADMIN", "SYSTEM_ADMIN"];

export async function getSessionUser(): Promise<SessionUser | null> {
    const session = await getServerSession(authOptions);
    if (!session?.user) return null;
    return session.user as SessionUser;
}

/**
 * Require an authenticated session. Returns the user, or a 401 NextResponse to
 * return early:  `const u = await requireSession(); if (u instanceof NextResponse) return u;`
 */
export async function requireSession(): Promise<SessionUser | NextResponse> {
    const user = await getSessionUser();
    if (!user) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    return user;
}

/** Require an authenticated session whose role is in `roles` (default: admins). */
export async function requireRole(roles: string[] = ADMIN_ROLES): Promise<SessionUser | NextResponse> {
    const user = await getSessionUser();
    if (!user) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!roles.includes(user.role)) {
        return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }
    return user;
}

export function isAdmin(role: string | undefined): boolean {
    return !!role && ADMIN_ROLES.includes(role);
}
