import type { NextConfig } from "next";
import path from "path";

// Content-Security-Policy is shipped in REPORT-ONLY mode first, so it surfaces
// violations in the console without breaking the app (Next's hydration inline
// scripts, framer-motion / recharts inline styles, next/font). Tighten to an
// enforced policy with nonces once the reports are clean.
const cspReportOnly = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
    // Force HTTPS once served over TLS (ignored on plain http, so safe to always send).
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
    { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
];

const nextConfig: NextConfig = {
    // Pin the workspace root so a stray lockfile in a parent folder can't
    // mislead Next's root inference (avoids the SWC/WASM fallback warning).
    turbopack: { root: path.join(__dirname) },
    async headers() {
        return [{ source: "/:path*", headers: securityHeaders }];
    },
};

export default nextConfig;
