import { prisma } from "@/lib/prisma";

export type EscalationRecipient = { id: string; name: string; email: string };

/**
 * The person escalated exceptions are handed to. Returns null when nobody is
 * set, or when the chosen account has since been disabled or deleted — an
 * escalation must never be addressed to someone who cannot sign in.
 */
export async function getEscalationRecipient(): Promise<EscalationRecipient | null> {
    try {
        const settings = await prisma.systemSettings.findFirst({ where: { id: "global" }, select: { escalationUserId: true } });
        if (!settings?.escalationUserId) return null;
        const user = await prisma.user.findUnique({ where: { id: settings.escalationUserId }, select: { id: true, name: true, email: true, status: true } });
        if (!user || user.status !== "ACTIVE") return null;
        return { id: user.id, name: user.name || user.email, email: user.email };
    } catch {
        return null;
    }
}
