/** The areas of the change history. No database access, so it is safe to import on the client. */
export const AUDIT_AREAS = ["Settings", "Registry", "Users", "Exceptions", "Uploads"] as const;
export type AuditArea = (typeof AUDIT_AREAS)[number];
export type AuditEvent = { id: string; at: string; actor: string; area: AuditArea; summary: string };
