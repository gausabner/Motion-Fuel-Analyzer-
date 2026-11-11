import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Two jobs, deliberately kept separate:
 *
 * 1. An ENFORCED Content-Security-Policy on every response.
 * 2. Auth gating, which applies only to /dashboard and /api. The matcher now
 *    covers every path so the CSP reaches public pages too, hence the explicit
 *    prefix check — gating everything would redirect the sign-in page to itself.
 *
 * API routes ALSO check the session themselves (lib/auth.ts); this is a second
 * layer, not the only one.
 *
 * On 'unsafe-inline':
 *   script — a nonce policy was built and measured against a production build.
 *     Next/Turbopack emits at least one inline bootstrap script without the
 *     nonce, and with 'strict-dynamic' host allowlisting is disabled so its
 *     chunks are blocked too; both left the app visibly broken (no charts, no
 *     client components). Revisit when Next stamps every inline script.
 *   style — recharts and framer-motion write inline style ATTRIBUTES, which
 *     neither a hash nor a nonce can ever cover.
 *
 * What this still buys over the previous report-only policy: scripts, styles,
 * images, fonts and XHR are restricted to this origin, plugins are banned,
 * <base> and form targets are pinned, framing is denied, and production drops
 * 'unsafe-eval' — all now actually enforced rather than merely reported.
 */

function buildCsp(): string {
    const dev = process.env.NODE_ENV !== "production";
    return [
        "default-src 'self'",
        // Dev needs eval for hot-module replacement; production was measured to need none.
        `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        // Dev needs the HMR websocket.
        `connect-src 'self'${dev ? " ws: wss:" : ""}`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "upgrade-insecure-requests",
    ].join("; ");
}

const PROTECTED = ["/dashboard", "/api"];

export async function middleware(req: NextRequest) {
    const { pathname, search } = req.nextUrl;
    const csp = buildCsp();

    const withCsp = <T extends NextResponse>(res: T): T => {
        res.headers.set("Content-Security-Policy", csp);
        return res;
    };

    // NextAuth's own endpoints must stay open.
    if (pathname.startsWith("/api/auth")) return withCsp(NextResponse.next());

    const needsAuth = PROTECTED.some(p => pathname === p || pathname.startsWith(p + "/"));
    if (!needsAuth) return withCsp(NextResponse.next());

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (token) return withCsp(NextResponse.next());

    if (pathname.startsWith("/api/")) {
        return withCsp(NextResponse.json({ error: "Authentication required" }, { status: 401 }));
    }

    const signin = new URL("/auth/signin", req.url);
    signin.searchParams.set("callbackUrl", pathname + search);
    return withCsp(NextResponse.redirect(signin));
}

export const config = {
    // Everything except build assets, so the CSP covers public pages too.
    matcher: ["/((?!_next/static|_next/image).*)"],
};
