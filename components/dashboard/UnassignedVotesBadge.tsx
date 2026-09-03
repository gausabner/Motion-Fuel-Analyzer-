import Link from "next/link";
import { FileWarning } from "lucide-react";
import { getUnassignedSummary } from "@/lib/vote-resolution";

/**
 * Standing indicator for the unresolved-vote backlog. Renders nothing when the
 * backlog is clear; otherwise an amber chip linking to the Registry review queue.
 */
export async function UnassignedVotesBadge() {
    const { codes, litres } = await getUnassignedSummary();
    if (codes === 0) return null;

    return (
        <Link
            href="/dashboard/registry?tab=unassigned"
            className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 h-9 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400"
            title="Some fuel is not yet attributed to a department"
        >
            <FileWarning className="h-4 w-4" />
            {codes} unassigned {codes === 1 ? "code" : "codes"} · {litres.toLocaleString()} L
        </Link>
    );
}
