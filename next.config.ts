import type { NextConfig } from "next";
import path from "path";

// Content-Security-Policy is NOT set here: it needs a per-request nonce, so it
// is built and enforced in middleware.ts. These are the static headers only.

const securityHeaders = [
    // Force HTTPS once served over TLS (ignored on plain http, so safe to always send).
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
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
