import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { removeDuplicates, restoreDuplicates } from "@/lib/duplicates";

const schema = z.object({
    keys: z.array(z.string().regex(/^no-vehicle:.+$/)).min(1).max(2000),
    /** true puts removed copies back (Undo). */
    restore: z.boolean().optional(),
});

const L = (n: number) => `${Math.round(n).toLocaleString("en-GB")} L`;

/**
 * Remove stores-report copies of issues the pump report already has, or put
 * them back. Changes totals, so it is for administrators; every call is in
 * the change history.
 */
export async function POST(req: Request) {
    const user = await requireRole();
    if (user instanceof NextResponse) return user;
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Choose at least one duplicate." }, { status: 400 });
    const { keys, restore } = parsed.data;
    try {
        const result = restore ? await restoreDuplicates(keys) : await removeDuplicates(keys, user.name || user.email || null);
        if (result.rows > 0) {
            await audit(user, "Exceptions", restore
                ? `${result.rows} ${result.rows === 1 ? "duplicate" : "duplicates"} put back into fuel totals (${L(result.litres)})`
                : `${result.rows} ${result.rows === 1 ? "duplicate issue" : "duplicate issues"} removed from fuel totals (${L(result.litres)}); the pump-report ${result.rows === 1 ? "issue stays" : "issues stay"}`);
        }
        return NextResponse.json(result);
    } catch {
        return NextResponse.json({ error: "The duplicates could not be changed." }, { status: 500 });
    }
}
