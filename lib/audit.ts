import { prisma } from "@/lib/prisma";
import { AUDIT_AREAS, type AuditArea, type AuditEvent } from "@/lib/audit-areas";

export { AUDIT_AREAS, type AuditArea, type AuditEvent };

type Actor = { name?: string | null; email?: string | null } | null | undefined;

/**
 * Record a change. Call it after the change has succeeded, with a sentence a
 * person can read back: "Diesel reference price set to 23.50 from 1 Apr 2026".
 *
 * It never throws: a failure to write the log must not undo or block the
 * change it describes. Passwords and other secrets never go in the summary.
 */
export async function audit(actor: Actor, area: AuditArea, summary: string): Promise<void> {
    try {
        await (prisma as any).auditEvent.create({
            data: { actor: actor?.name || actor?.email || "Unknown user", area, summary: summary.slice(0, 500) },
        });
    } catch (e) {
        console.error("Audit log write failed:", e);
    }
}

export async function getAuditEvents(opts: { area?: string; limit?: number; before?: string } = {}): Promise<AuditEvent[]> {
    try {
        const rows = await (prisma as any).auditEvent.findMany({
            where: {
                ...(opts.area && (AUDIT_AREAS as readonly string[]).includes(opts.area) ? { area: opts.area } : {}),
                ...(opts.before ? { at: { lt: new Date(opts.before) } } : {}),
            },
            orderBy: { at: "desc" },
            take: Math.min(Math.max(opts.limit ?? 50, 1), 5000),
        });
        return rows.map((r: any) => ({ id: r.id, at: new Date(r.at).toISOString(), actor: r.actor, area: r.area, summary: r.summary }));
    } catch {
        return [];
    }
}

/** List what changed between two flat records, as "label: old → new" pieces. Used to make a settings save readable. */
export function describeChanges<T extends Record<string, unknown>>(before: T, after: T, labels: Partial<Record<keyof T, string>>): string[] {
    const out: string[] = [];
    for (const key of Object.keys(labels) as (keyof T)[]) {
        const a = before[key], b = after[key];
        if (a === b || (a == null && b == null) || (a == null && b === "") || (a === "" && b == null)) continue;
        const show = (v: unknown) => v === true ? "on" : v === false ? "off" : v == null || v === "" ? "empty" : String(v);
        out.push(`${labels[key]}: ${show(a)} to ${show(b)}`);
    }
    return out;
}
