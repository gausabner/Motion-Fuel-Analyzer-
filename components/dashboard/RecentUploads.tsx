"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, FileSpreadsheet } from "lucide-react";
import { format } from "date-fns";

type Upload = { id: string; fileName: string; fileSize: number; rowCount: number; uploadedAt: string };

// Admin-only list of past uploads with authenticated original-file re-download.
// Hidden for non-admins (the list API returns 403).
export function RecentUploads() {
    const [uploads, setUploads] = useState<Upload[] | null>(null);
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
        fetch("/api/uploads")
            .then(r => { if (r.status === 403 || r.status === 401) { setHidden(true); return null; } return r.json(); })
            .then(d => d && setUploads(d.uploads || []))
            .catch(() => setHidden(true));
    }, []);

    if (hidden || uploads === null) return null;

    return (
        <Card className="monumental-card">
            <CardHeader>
                <CardTitle className="text-lg font-bold tracking-tight">Recent uploads</CardTitle>
                <CardDescription>Re-download the original file of any past import (admins only).</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="rounded-sm border border-border max-h-[420px] overflow-y-auto">
                    <Table>
                        <TableHeader className="bg-muted/50 sticky top-0 z-10">
                            <TableRow>
                                <TableHead className="text-[10px] uppercase font-bold">File</TableHead>
                                <TableHead className="text-[10px] uppercase font-bold">Uploaded</TableHead>
                                <TableHead className="text-[10px] uppercase font-bold text-right">Rows</TableHead>
                                <TableHead className="text-[10px] uppercase font-bold text-right">Original</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {uploads.map(u => (
                                <TableRow key={u.id}>
                                    <TableCell className="text-xs font-medium flex items-center gap-2">
                                        <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        <span className="truncate max-w-[280px]">{u.fileName}</span>
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                        {u.uploadedAt ? format(new Date(u.uploadedAt), "dd MMM yyyy, HH:mm") : "—"}
                                    </TableCell>
                                    <TableCell className="text-xs text-right font-mono">{u.rowCount}</TableCell>
                                    <TableCell className="text-right">
                                        <a
                                            href={`/api/uploads/${u.id}`}
                                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline underline-offset-2"
                                        >
                                            <Download className="h-3.5 w-3.5" /> Download
                                        </a>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {uploads.length === 0 && (
                                <TableRow><TableCell colSpan={4} className="text-center py-6 text-xs text-muted-foreground">No uploads yet.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
