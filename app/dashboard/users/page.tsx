"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCcw, Plus, Check, X, Trash2, KeyRound, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";

type User = { id: string; email: string; name: string | null; role: string; status: string; createdAt?: string };

const ROLES = ["SUPER_ADMIN", "SYSTEM_ADMIN", "SYSTEM_HEAD", "EMPLOYEE"];
const roleLabel = (r: string) => r.replace(/_/g, " ").toLowerCase();

function StatusPill({ status }: { status: string }) {
    const cls = status === "ACTIVE" ? "bg-emerald-100 text-emerald-700"
        : status === "PENDING" ? "bg-amber-100 text-amber-700"
            : "bg-red-100 text-red-700";
    return <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${cls}`}>{status}</span>;
}

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [forbidden, setForbidden] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [createForm, setCreateForm] = useState({ name: "", email: "", role: "EMPLOYEE", password: "" });

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/users");
            if (res.status === 403 || res.status === 401) { setForbidden(true); return; }
            const data = await res.json();
            setUsers(data.users || []);
        } catch { toast.error("Failed to load users"); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const call = async (url: string, method: string, body: any, ok: string) => {
        setBusy(true);
        try {
            const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
            const data = await res.json().catch(() => ({}));
            if (res.ok) { toast.success(ok); await load(); return true; }
            toast.error(data.error || "Request failed");
            return false;
        } catch { toast.error("Network error"); return false; }
        finally { setBusy(false); }
    };

    const resetPassword = (u: User) => {
        const pw = prompt(`New password for ${u.email} (min 8 chars):`);
        if (!pw) return;
        if (pw.length < 8) { toast.error("Password must be at least 8 characters"); return; }
        call(`/api/admin/users/${u.id}`, "PATCH", { password: pw }, "Password reset");
    };

    if (loading) return <div className="h-96 flex items-center justify-center"><RefreshCcw className="h-8 w-8 animate-spin text-primary" /></div>;

    if (forbidden) return (
        <div className="max-w-md mx-auto mt-24 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center mx-auto"><ShieldAlert className="w-6 h-6 text-red-600" /></div>
            <h2 className="text-xl font-bold">Admins only</h2>
            <p className="text-muted-foreground text-sm">You don't have permission to manage users.</p>
        </div>
    );

    const pending = users.filter(u => u.status === "PENDING");
    const others = users.filter(u => u.status !== "PENDING");

    return (
        <div className="space-y-6">
            <PageHeader title="Users" scope="Approve registrations, create accounts, and manage roles and access.">
                <Button onClick={() => setShowCreate(v => !v)} className="h-11 px-5 font-semibold"><Plus className="h-4 w-4 mr-1.5" /> Create user</Button>
            </PageHeader>

            {showCreate && (
                <Card className="monumental-card">
                    <CardHeader><CardTitle className="text-base">Create a new user</CardTitle><CardDescription>The account is active immediately.</CardDescription></CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap items-end gap-3">
                            <div className="space-y-1 flex-1 min-w-[160px]"><label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</label><Input value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })} className="bg-background h-9" /></div>
                            <div className="space-y-1 flex-1 min-w-[200px]"><label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Email</label><Input type="email" value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })} className="bg-background h-9" /></div>
                            <div className="space-y-1 w-[170px]"><label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Role</label>
                                <Select value={createForm.role} onValueChange={v => setCreateForm({ ...createForm, role: v })}>
                                    <SelectTrigger className="bg-background h-9"><SelectValue /></SelectTrigger>
                                    <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{roleLabel(r)}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1 w-[170px]"><label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Password</label><Input type="text" value={createForm.password} onChange={e => setCreateForm({ ...createForm, password: e.target.value })} placeholder="min 8 chars" className="bg-background h-9" /></div>
                            <Button disabled={busy} onClick={async () => { const ok = await call("/api/admin/users", "POST", createForm, "User created"); if (ok) { setCreateForm({ name: "", email: "", role: "EMPLOYEE", password: "" }); setShowCreate(false); } }} className="h-9 font-semibold">Create</Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {pending.length > 0 && (
                <Card className="monumental-card border-amber-300">
                    <CardHeader><CardTitle className="text-base text-amber-700">Pending approvals ({pending.length})</CardTitle><CardDescription>New self-registrations awaiting review.</CardDescription></CardHeader>
                    <CardContent>
                        <div className="rounded-sm border border-border">
                            <Table>
                                <TableHeader className="bg-muted/50"><TableRow>
                                    <TableHead className="text-[10px] uppercase font-bold">Name</TableHead>
                                    <TableHead className="text-[10px] uppercase font-bold">Email</TableHead>
                                    <TableHead className="text-[10px] uppercase font-bold text-right">Actions</TableHead>
                                </TableRow></TableHeader>
                                <TableBody>
                                    {pending.map(u => (
                                        <TableRow key={u.id}>
                                            <TableCell className="text-xs font-semibold">{u.name}</TableCell>
                                            <TableCell className="text-xs">{u.email}</TableCell>
                                            <TableCell className="text-right space-x-2">
                                                <Button size="sm" disabled={busy} onClick={() => call(`/api/admin/users/${u.id}`, "PATCH", { status: "ACTIVE" }, "User approved")} className="h-8 text-xs"><Check className="h-3.5 w-3.5 mr-1" /> Approve</Button>
                                                <Button size="sm" variant="outline" disabled={busy} onClick={() => call(`/api/admin/users/${u.id}`, "DELETE", null, "Registration rejected")} className="h-8 text-xs text-red-600"><X className="h-3.5 w-3.5 mr-1" /> Reject</Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card className="monumental-card">
                <CardHeader><CardTitle className="text-base">All users ({others.length})</CardTitle></CardHeader>
                <CardContent>
                    <div className="rounded-sm border border-border">
                        <Table>
                            <TableHeader className="bg-muted/50"><TableRow>
                                <TableHead className="text-[10px] uppercase font-bold">Name</TableHead>
                                <TableHead className="text-[10px] uppercase font-bold">Email</TableHead>
                                <TableHead className="text-[10px] uppercase font-bold">Role</TableHead>
                                <TableHead className="text-[10px] uppercase font-bold">Status</TableHead>
                                <TableHead className="text-[10px] uppercase font-bold text-right">Actions</TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                                {others.map(u => (
                                    <TableRow key={u.id}>
                                        <TableCell className="text-xs font-semibold">{u.name}</TableCell>
                                        <TableCell className="text-xs">{u.email}</TableCell>
                                        <TableCell>
                                            <Select value={u.role} onValueChange={v => call(`/api/admin/users/${u.id}`, "PATCH", { role: v }, "Role updated")}>
                                                <SelectTrigger className="h-8 w-[150px] bg-background text-xs capitalize"><SelectValue /></SelectTrigger>
                                                <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{roleLabel(r)}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </TableCell>
                                        <TableCell><StatusPill status={u.status} /></TableCell>
                                        <TableCell className="text-right space-x-1">
                                            <Button size="sm" variant="ghost" disabled={busy} title="Reset password" aria-label="Reset password" onClick={() => resetPassword(u)} className="h-8 w-8 p-0"><KeyRound className="h-3.5 w-3.5" /></Button>
                                            {u.status === "ACTIVE"
                                                ? <Button size="sm" variant="ghost" disabled={busy} title="Disable" aria-label="Disable user" onClick={() => call(`/api/admin/users/${u.id}`, "PATCH", { status: "DISABLED" }, "User disabled")} className="h-8 w-8 p-0 text-amber-600"><X className="h-3.5 w-3.5" /></Button>
                                                : <Button size="sm" variant="ghost" disabled={busy} title="Enable" aria-label="Enable user" onClick={() => call(`/api/admin/users/${u.id}`, "PATCH", { status: "ACTIVE" }, "User enabled")} className="h-8 w-8 p-0 text-emerald-600"><Check className="h-3.5 w-3.5" /></Button>}
                                            <Button size="sm" variant="ghost" disabled={busy} title="Delete" aria-label="Delete user" onClick={() => { if (confirm(`Delete ${u.email}? This cannot be undone.`)) call(`/api/admin/users/${u.id}`, "DELETE", null, "User deleted"); }} className="h-8 w-8 p-0 text-red-600"><Trash2 className="h-3.5 w-3.5" /></Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
