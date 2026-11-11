# Motion Fuel Analyzer — Security Hardening Plan

Prepared 2026-09-01. Scope: map the 20 requested security checks onto this specific codebase (Next.js 16 App Router, NextAuth v4 credentials login, Prisma 5 + SQLite, no edge middleware, no security-header config), with exact files and line-level findings, and sequence the work so nothing gets fixed in an order that leaves a bigger hole open in between.

## Read this first: the app currently has no real authentication

`app/api/auth/[...nextauth]/route.ts` (lines 14–25) parses the submitted password, has a comment admitting *"For MVP: Password check is skipped or hardcoded"*, and the `if (credentials.password !== "admin")` branch does nothing — no `return null`, no `throw` — so the code falls straight through to `prisma.user.findUnique({ where: { email } })` and logs the caller in if that email merely exists, regardless of what password was typed. There is also no `password` field anywhere on the `User` model in `prisma/schema.prisma`, so there is nothing to check even if the branch were wired up.

On top of that, `.env` defines only `DATABASE_URL` — there is no `NEXTAUTH_SECRET` — and every API route reviewed (`/api/ingest`, `/api/registry/departments`, `/api/registry/unassigned-votes`, `/api/reports/export`, `/api/settings`) calls Prisma directly with zero session or role check. There's no `middleware.ts` at the project root either, so `/dashboard/*` pages aren't gated at the routing layer.

Net effect: right now, anyone who can reach the app can read and write all fuel/vote/department data without logging in at all (hit the API routes directly), and anyone who knows *any* seeded email can fully "sign in" as that user with any password. This is the item to fix before any of the other 19 matter much — items 6, 7, 9, 10, and 11 below all sit on top of it.

## Phased order of work

### Phase 0 — Close the open door (do this before anything else)

**1. Add real password storage and checking (checklist #10, #6)**
Add a `password` (hash) column to `User` in `prisma/schema.prisma`, write a migration, add `bcryptjs` (or `argon2`), update `prisma/seed.ts` to hash seed passwords, and rewrite `authorize()` in `app/api/auth/[...nextauth]/route.ts` to `bcrypt.compare()` the submitted password against the stored hash and `return null` on any mismatch — including when the user isn't found (don't let a missing-user vs. wrong-password branch leak which emails exist).

**2. Set `NEXTAUTH_SECRET` and `NEXTAUTH_URL` (#9)**
Generate a strong secret (`openssl rand -base64 32`), put it in `.env` (already gitignored) and in whatever secrets store the production host uses. Set `NEXTAUTH_URL` to the real HTTPS origin in production so NextAuth issues cookies with `Secure` set — right now that's undefined, which is exactly the failure mode item 9 asks about.

**3. Gate every API route on a session (#6, #7)**
Add a small `requireSession()` / `requireRole()` helper in `lib/auth.ts` that calls NextAuth's `getServerSession(authOptions)` and returns 401/403 early. Apply it to every handler under `app/api/**/route.ts` — `ingest`, all of `registry/*`, all of `reports/*`, and `settings`. None of them currently have it. Where an action should be admin-only (deleting a department, changing fuel prices in `settings`, running `ingest`), also check `session.user.role === 'ADMIN'`.

**4. Add `middleware.ts`**
A root `middleware.ts` matching `/dashboard/:path*` and `/api/:path*` (excluding `/api/auth/*`) that redirects unauthenticated requests to `/auth/signin`. This is defense-in-depth on top of #3, not a replacement for it — API routes must still check the session themselves since middleware can be bypassed by calling the route directly in some edge configurations.

### Phase 1 — Data handling correctness

**5. Field-level tampering / mass-assignment guard (#8)**
Several routes take `await req.json()` and pass fields straight into Prisma (`app/api/settings/route.ts` lines 21–24 and 29–32; the department/cost-centre/fleet-unit POST handlers). None of these can currently be used to escalate privilege since `User.role` isn't writable through any endpoint — keep it that way. Going forward, whitelist fields explicitly (don't spread `body` into `data:`) so a future endpoint can't accidentally accept `{ role: "ADMIN" }` in a payload.

**6. Input validation (#14)**
Add `zod` and a schema per route. Concrete gaps found: `app/api/settings/route.ts` does `parseFloat(body.petrolPrice)` with no `NaN`/range/negative check; `app/api/registry/departments/route.ts` only trims/uppercases the name with no length or character limit; `app/api/reports/export/route.ts` builds a Prisma `where` clause directly from raw query-string values (`vehicleId`, `fuelType`, `department`, `division`) with no shape validation before hitting the DB.

**7. Parameterized queries — mostly already fine, one spot to fix (#13)**
Everything reviewed uses the Prisma query builder (`findMany`/`findUnique`/`create`/`upsert`/`groupBy`), which parameterizes automatically — no SQL injection found. The one exception is `lib/ingestion.ts` lines 180–202, which uses `prisma.$executeRawUnsafe` with `?` placeholders and bound arguments for `INSERT OR IGNORE`. As written, the values *are* passed as bound parameters, not string-concatenated, so it isn't currently exploitable — but `$executeRawUnsafe` doesn't stop a future edit from interpolating a value into the string by mistake. Replace it with `prisma.fuelTransaction.createMany({ data, skipDuplicates: true })` (Prisma 5 supports `skipDuplicates` on SQLite) or, if the raw SQL stays, switch to the tagged-template `prisma.$executeRaw` which can't be called with a plain interpolated string. Add an eslint rule or a grep-based CI check that fails on any new `$executeRawUnsafe` / `$queryRawUnsafe`.

**8. CSV injection in report exports (#15)**
`app/api/reports/export/route.ts`'s `csvEscape()` (lines 14–18) only escapes quotes, commas, and newlines. A cell value beginning with `=`, `+`, `-`, or `@` (e.g. a fleet-unit or vote description imported from an uploaded spreadsheet) will be treated as a formula by Excel/Sheets when the exported CSV is reopened — classic CSV/formula injection. Prefix such values with a leading `'` (or a tab) before the existing escaping. No `dangerouslySetInnerHTML` was found anywhere in the reviewed React code, so standard XSS-via-render isn't a live issue today — React's default escaping is doing its job; just don't introduce `dangerouslySetInnerHTML` later without sanitizing.

### Phase 2 — File upload path

**9. Restrict and relocate uploads (#16)** — this is the other high-severity finding.
`lib/ingestion.ts` (`processExcelFile`, lines 53–58) writes every uploaded file to `public/uploads/`, which Next.js serves statically to anyone, unauthenticated, at `/uploads/<name>` — so raw fuel/vote spreadsheets are downloadable by URL with no login at all, independent of the API auth work above. Filename sanitization is also incomplete: `originalFileName.replace(/\s+/g, '_')` only strips whitespace, not `/`, `\`, or `..` segments, so a crafted filename can attempt to write outside `storageDir` via `path.join`. There's also no size cap or MIME/extension check in `app/api/ingest/route.ts` before the buffer is handed to the XLSX parser.
Fix: move the storage directory outside `public/` (e.g. a non-served `storage/uploads/` or an object store); sanitize the filename by stripping to `[a-zA-Z0-9._-]` (or just discard the original name entirely and store it only in the DB `fileName` field, using the UUID as the on-disk name); enforce a max upload size (e.g. `formData` size check plus a hard cap like 25MB) and validate the extension/MIME is `.xlsx`/`.xls`/`.csv` before parsing; if the raw file must be downloadable later, serve it through an authenticated API route that streams from the non-public directory rather than a static path.

**10. Bot protection on the one public form (#12)**
The only unauthenticated public surface is `/auth/signin`. Once rate limiting (Phase 3, #12 below) is in place, add a lightweight bot check — Cloudflare Turnstile or hCaptcha on the sign-in form — since this is a small internal tool and a full enterprise WAF is overkill.

### Phase 3 — Platform hardening

**11. Rate limit login (#11)**
Add throttling on `/api/auth/callback/credentials` — either at the hosting/reverse-proxy layer (Vercel's built-in, or nginx `limit_req` if self-hosted) or in-app via `@upstash/ratelimit` (works well with SQLite/serverless deploys) keyed on IP + attempted email, with exponential backoff and a temporary lockout after ~5 failures.

**12. Security headers (#18) and HTTPS (#19)**
`next.config.ts` currently has no `headers()` at all (it's the default scaffolded file). Add a `headers()` block (or `middleware.ts`) setting `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (or a CSP `frame-ancestors 'none'`), `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and a `Content-Security-Policy` scoped to the app's own origin plus whatever font/CDN it actually uses. HTTPS itself is normally terminated at the host (Vercel does this automatically); if self-hosted, add an HTTP→HTTPS redirect at the reverse proxy and confirm `NEXTAUTH_URL` (Phase 0 #2) is the `https://` origin so NextAuth's `Secure` cookie flag actually applies.

**13. Response shape / data minimization (#17)**
Once auth (#3) is in place, revisit what each route returns — several currently return full Prisma rows (`app/api/registry/departments/route.ts` GET, the raw-transaction branch of `reports/export`) which is fine for an admin-only internal tool but should be revisited if a lower-privilege "EMPLOYEE" role is meant to see less than "ADMIN". Add `select:` clauses per role rather than relying on "we just don't have an endpoint for that yet."

**14. Secrets hygiene (#1) and DB-key equivalent (#3)**
No hardcoded API keys were found in the reviewed source — `.env` (git-ignored) currently holds only `DATABASE_URL`, and `NEXTAUTH_SECRET` needs adding per Phase 0. This app has no Supabase/Firebase "public vs. service key" split (checklist item #3) — it's a server-only SQLite file reached exclusively through Prisma from server code, so there is no key that should ever reach the browser. The equivalent check here is narrower but still worth doing once: confirm nothing in `app/` or `components/` reads `process.env.*` without a `NEXT_PUBLIC_` prefix in a way that would get inlined into client bundles, and that `prisma/dev.db` / `.env` are never served from `public/` (they aren't today).

**15. Purge Git secrets (#2)**
`.gitignore` correctly excludes `.env*` and `*.db` today, but that doesn't prove nothing was committed before those lines were added (the repo has migrations dating back to January 2026). From a machine with `git` access to this repo, run `git log --all --full-history -- .env dev.db prisma/dev.db` to check for historical commits, and run `gitleaks detect` (or `trufflehog filesystem .`) across the full history. If anything turns up, rotate whatever secret was exposed (rewriting history with `git filter-repo` or BFG only removes it going forward — a real secret must still be rotated) — I don't have a working shell on your machine in this session to run this directly, so this one needs to be run locally.

**16. Dependency scanning (#20)**
`package.json` pins `xlsx: ^0.18.5` (SheetJS) — this package has had real CVEs (prototype pollution, ReDoS) in versions prior to 0.19.x/0.20.x fixes distributed via SheetJS's own CDN rather than npm; worth checking the installed version against SheetJS's advisory page specifically, since `npm audit` doesn't reliably catch it. Otherwise: run `npm audit` now, wire up Dependabot or Renovate for ongoing PRs, and add an `npm audit --audit-level=high` (or `pnpm audit`) step to CI so new high/critical CVEs block merges rather than being discovered later.

## Items that don't map 1:1 onto this stack

**Row-level security (#4)** is a Postgres/Supabase/Firestore concept — SQLite has no RLS engine, and Prisma talks to it only from trusted server code, so there's no analogous DB-level policy to turn on. The equivalent protection here is entirely the app-layer authorization work in Phase 0 (#3) and the role checks in Phase 1 — if this app is ever migrated to Postgres (e.g. for multi-tenant use across departments with department-scoped users), RLS policies keyed on `department`/`role` would become directly relevant and should be revisited then.

**Public DB key (#3)** likewise doesn't apply as stated — there's no Supabase-style anon/service key pair. See Phase 3 item 14 above for the closest equivalent check.

## Suggested new dependencies

`bcryptjs` (password hashing), `zod` (input validation), `@upstash/ratelimit` + `@upstash/redis` or a simpler IP-bucket alternative if avoiding an external Redis (login rate limiting), `gitleaks` or `trufflehog` (one-time + CI git-history secret scan, run locally), Cloudflare Turnstile or hCaptcha (sign-in bot protection).

## Suggested order to actually execute

Phase 0 (items 1–4) fixes the auth bypass and is the only part that's genuinely urgent — everything downloadable/writable today stays that way until it's done. Phase 1 (5–8) and Phase 2 (9–10) can happen in the same pass since they touch the same routes/files as Phase 0. Phase 3 (11–16) is hardening and hygiene that matters before this goes anywhere multi-user or internet-facing, but doesn't block Phase 0/1/2 landing first.
