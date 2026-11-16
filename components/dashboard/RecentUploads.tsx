"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavBadges } from "@/components/dashboard/NavBadges";

type Upload = {
    id: string; fileName: string; fileSize: number; rowCount: number; uploadedAt: string;
    rolledBackAt: string | null; rolledBackBy: string | null;
    /** Rows from this upload still on record; only these can be removed. */
    linkedRows: number;
};

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Past uploads, for administrators: download the original file, or roll an
 * upload back, which removes exactly the rows it added. Hidden for everyone
 * else (the list API returns 403).
 */
export function RecentUploads() {
    const router = useRouter();
    const { refresh } = useNavBadges();
    const [uploads, setUploads] = useState<Upload[] | null>(null);
    const [hidden, setHidden] = useState(false);
    const [target, setTarget] = useState<Upload | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => {
        fetch("/api/uploads")
            .then(r => { if (r.status === 403 || r.status === 401) { setHidden(true); return null; } return r.json(); })
            .then(d => d && setUploads(d.uploads || []))
            .catch(() => setHidden(true));
    }, []);
    useEffect(() => { load(); }, [load]);

    if (hidden || uploads === null) return null;

    const rollBack = async () => {
        if (!target) return;
        setBusy(true);
        try {
            const res = await fetch(`/api/uploads/${target.id}`, { method: "DELETE" });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { toast.error(d.error || "The upload could not be rolled back. Nothing was removed."); return; }
            const n = (d.removed?.transactions ?? 0) + (d.removed?.deliveries ?? 0);
            toast(`${target.fileName} rolled back`, { description: `${n.toLocaleString("en-GB")} ${n === 1 ? "row was" : "rows were"} removed. Upload the file again to put them back.` });
            setTarget(null); load(); refresh(); router.refresh();
        } catch {
            toast.error("The upload could not be rolled back. Check your connection and try again.");
        } finally { setBusy(false); }
    };

    const empty = uploads.filter(u => u.rowCount === 0).length;

    return (
        <section className="monumental-card" aria-label="Past uploads">
            <div className="card-h"><h2>Past uploads</h2><span className="sub">{uploads.length} files{empty > 0 ? ` · ${empty} added no rows` : ""}</span></div>
            <p className="mt-1 max-w-[78ch] text-[13px] text-muted-foreground">
                Download the original file, or roll an upload back to remove exactly the rows it added. Uploads made before 16 Nov 2026 were not linked to their rows and cannot be rolled back.
            </p>
            <div className="mt-3 max-h-[460px] overflow-auto">
                <Table>
                    <TableHeader className="sticky top-0 z-10">
                        <TableRow>
                            <TableHead>File</TableHead>
                            <TableHead>Uploaded</TableHead>
                            <TableHead className="text-right">Rows added</TableHead>
                            <TableHead>State</TableHead>
                            <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {uploads.map(u => (
                            <TableRow key={u.id}>
                                <TableCell className="max-w-[300px] truncate font-medium" title={u.fileName}>{u.fileName}</TableCell>
                                <TableCell className="mono whitespace-nowrap text-muted-foreground">{u.uploadedAt ? when(u.uploadedAt) : "—"}</TableCell>
                                <TableCell className="mono text-right">{u.rowCount.toLocaleString("en-GB")}</TableCell>
                                <TableCell>
                                    {u.rolledBackAt ? <span className="sev lo" title={`By ${u.rolledBackBy ?? "an administrator"} on ${when(u.rolledBackAt)}`}>Rolled back</span>
                                        : u.rowCount === 0 ? <span className="sev md">No rows added</span>
                                            : <span className="sev ok">On record</span>}
                                </TableCell>
                                <TableCell className="whitespace-nowrap text-right">
                                    <span className="inline-flex items-center gap-2">
                                        <a href={`/api/uploads/${u.id}`} className="tab !px-3 !py-1 !text-xs" aria-label={`Download ${u.fileName}`}><Download className="h-3.5 w-3.5" /> File</a>
                                        {u.linkedRows > 0 && !u.rolledBackAt && (
                                            <button type="button" className="tab !px-3 !py-1 !text-xs" onClick={() => setTarget(u)}>Roll back</button>
                                        )}
                                    </span>
                                </TableCell>
                            </TableRow>
                        ))}
                        {uploads.length === 0 && (
                            <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">Nothing has been uploaded yet.</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={!!target} onOpenChange={o => { if (!o && !busy) setTarget(null); }}>
                {target && (
                    <DialogContent className="max-w-[460px]">
                        <DialogHeader>
                            <DialogTitle>Roll back {target.fileName}?</DialogTitle>
                            <DialogDescription>
                                The {target.linkedRows.toLocaleString("en-GB")} {target.linkedRows === 1 ? "row" : "rows"} this upload added will be removed from every page and total.
                                Rows from other uploads are not touched, and the original file stays available to download.
                            </DialogDescription>
                        </DialogHeader>
                        <ul className="mt-3 list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
                            <li>To put the rows back, upload the same file again.</li>
                            <li>Supplier orders that this upload only updated keep their updated values.</li>
                            <li>Cost centres registered automatically from its vote numbers stay in the registry.</li>
                        </ul>
                        <DialogFooter className="mt-5 gap-2">
                            <Button type="button" variant="outline" disabled={busy} onClick={() => setTarget(null)}>Cancel</Button>
                            <Button type="button" variant="destructive" disabled={busy} onClick={rollBack}>{busy ? "Removing rows" : "Roll back upload"}</Button>
                        </DialogFooter>
                    </DialogContent>
                )}
            </Dialog>
        </section>
    );
}
