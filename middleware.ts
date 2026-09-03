import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Defense-in-depth gate. API routes ALSO check the session themselves
 * (lib/auth.ts) — this is a second layer, not the only one.
 *
 *  - /api/auth/*        → always allowed (login flow)
 *  - /api/*  (else)     → 401 JSON when unauthenticated
 *  - /dashboard/*       → redirect to /auth/signin when unauthenticated
 */
export async function middleware(req: NextRequest) {
    const { pathname, search } = req.nextUrl;

    // NextAuth's own endpoints must stay open.
    if (pathname.startsWith("/api/auth")) return NextResponse.next();

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (token) return NextResponse.next();

    if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const signin = new URL("/auth/signin", req.url);
    signin.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(signin);
}

export const config = {
    matcher: ["/dashboard/:path*", "/api/:path*"],
};
