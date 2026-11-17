// Lightweight in-memory login throttle — no external Redis. Keyed by IP+email.
// Effective on a single Node instance (state resets on restart and is not shared
// across serverless instances); for a multi-instance deploy, swap the Map for a
// shared store (e.g. @upstash/ratelimit). Good enough to blunt credential
// stuffing / brute force on this internal tool.

type Bucket = { fails: number; firstFailAt: number; lockedUntil: number };

const buckets = new Map<string, Bucket>();

const MAX_FAILS = 5;              // failures before lockout
const WINDOW_MS = 15 * 60 * 1000; // failures counted within a rolling 15-minute window
const LOCKOUT_MS = 15 * 60 * 1000; // lockout duration once tripped

// Opportunistic cleanup so the Map can't grow unbounded.
function sweep(now: number) {
    if (buckets.size < 5000) return;
    for (const [k, b] of buckets) {
        if (b.lockedUntil < now && now - b.firstFailAt > WINDOW_MS) buckets.delete(k);
    }
}

/** Returns true if this key is currently allowed to attempt a login. */
export function loginAllowed(key: string): boolean {
    const now = Date.now();
    const b = buckets.get(key);
    if (!b) return true;
    if (b.lockedUntil > now) return false;
    // Reset a stale window.
    if (now - b.firstFailAt > WINDOW_MS) {
        buckets.delete(key);
        return true;
    }
    return true;
}

/** Record a failed attempt; locks the key once MAX_FAILS is reached. */
export function recordLoginFailure(key: string): void {
    const now = Date.now();
    sweep(now);
    const b = buckets.get(key);
    if (!b || now - b.firstFailAt > WINDOW_MS) {
        buckets.set(key, { fails: 1, firstFailAt: now, lockedUntil: 0 });
        return;
    }
    b.fails += 1;
    if (b.fails >= MAX_FAILS) {
        b.lockedUntil = now + LOCKOUT_MS;
    }
}

/** Clear the bucket after a successful login. */
export function recordLoginSuccess(key: string): void {
    buckets.delete(key);
}

/** Derive a client IP from forwarded headers (best-effort). */
export function clientIpFromHeaders(headers: Record<string, string | string[] | undefined> | Headers | undefined): string {
    if (!headers) return "unknown";
    const get = (name: string): string | undefined => {
        if (headers instanceof Headers) return headers.get(name) ?? undefined;
        const v = headers[name] ?? headers[name.toLowerCase()];
        return Array.isArray(v) ? v[0] : v;
    };
    const xff = get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
    return get("x-real-ip") || "unknown";
}
