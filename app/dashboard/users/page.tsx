"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Check, Ban, Trash2, KeyRound, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";

type User = { id: string; email: string; name: string | null; role: string; status: string; createdAt?: string };
type Pending =
    | { kind: "password"; user: User }
    | { kind: "delete"; user: User }
    | { kind: "role"; user: User; role: string };

const ROLES = ["SUPER_ADMIN", "SYSTEM_ADMIN", "SYSTEM_HEAD", "EMPLOYEE"];
const ADMIN_ROLES = ["SUPER_ADMIN", "SYSTEM_ADMIN"];
const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: "Super admin", SYSTEM_ADMIN: "System admin", SYSTEM_HEAD: "System head", EMPLOYEE: "Employee" };
const roleLabel = (r: string) => ROLE_LABEL[r] ?? r;
const STATUS: Record<string, { label: string; cls: string }> = {
    ACTIVE: { label: "Active", cls: "ok" },
    PENDING: { label: "Awaiting approval", cls: "md" },
    DISABLED: { label: "Disabled", cls: "hi" },
};
const who = (u: User) => u.name || u.email;

function StatusPill({ status }: { status: string }) {
    const s = STATUS[status] ?? { label: status, cls: "lo" };
    return <span className={`sev ${s.cls}`}>{s.label}</span>;
}

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [forbidden, setForbidden] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [createForm, setCreateForm] = useState({ name: "", email: "", role: "EMPLOYEE", password: "" });
    const [pending, setPending] = useState<Pending | null>(null);
    const [newPassword, setNewPassword] = useState("");
    const [showPw, setShowPw] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/users");
            if (res.status === 403 || res.status === 401) { setForbidden(true); return; }
            const data = await res.json();
            setUsers(data.users || []);
        } catch { toast.error("The user list could not be loaded. Reload the page to try again."); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    /** One request, one outcome message. `undo` adds an Undo action to the confirmation for five seconds. */
    const call = async (url: string, method: string, body: unknown, ok: string, undo?: () => void) => {
        setBusy(true);
        try {
            const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                toast(ok, undo ? { duration: 5000, action: { label: "Undo", onClick: undo } } : undefined);
                await load();
                return true;
            }
            toast.error(data.error || "That change was not saved. Try again.");
            return false;
        } catch { toast.error("That change was not saved. Check your connection and try again."); return false; }
        finally { setBusy(false); }
    };

    const patch = (u: User, body: Record<string, string>, ok: string, undo?: () => void) => call(`/api/admin/users/${u.id}`, "PATCH", body, ok, undo);

    const changeRole = (u: User, role: string) => {
        if (role === u.role) return;
        // Granting an administrative role is confirmed first; everything else is applied and can be undone.
        if (ADMIN_ROLES.includes(role) && !ADMIN_ROLES.includes(u.role)) { setPending({ kind: "role", user: u, role }); return; }
        patch(u, { role }, `${who(u)} is now ${roleLabel(role).toLowerCase()}`, () => patch(u, { role: u.role }, `${who(u)} is ${roleLabel(u.role).toLowerCase()} again`));
    };

    const setStatus = (u: User, status: "ACTIVE" | "DISABLED") =>
        patch(u, { status }, status === "DISABLED" ? `${who(u)} can no longer sign in` : `${who(u)} can sign in again`,
            () => patch(u, { status: u.status }, `${who(u)} is back to ${STATUS[u.status]?.label.toLowerCase() ?? u.status}`));

    const closeDialog = () => { setPending(null); setNewPassword(""); setShowPw(false); };

    const confirmPending = async () => {
        if (!pending) return;
        const u = pending.user;
        const ok = pending.kind === "password"
            ? await patch(u, { password: newPassword }, `New password set for ${who(u)}`)
            : pending.kind === "delete"
                ? await call(`/api/admin/users/${u.id}`, "DELETE", null, `${who(u)} was deleted`)
                : await patch(u, { role: pending.role }, `${who(u)} is now ${roleLabel(pending.role).toLowerCase()}`);
        if (ok) closeDialog();
    };

    if (loading) return <div className="flex flex-col gap-3.5" aria-busy="true" aria-label="Loading users"><div className="skel h-9 w-40" /><div className="skel h-96" /></div>;

    if (forbidden) return (
        <div className="mx-auto mt-24 max-w-md text-center">
            <h1 className="text-xl font-semibold">Administrators only</h1>
            <p className="mt-2 text-sm text-muted-foreground">Your account cannot manage users. Ask a system administrator if you need this.</p>
        </div>
    );

    const waiting = users.filter(u => u.status === "PENDING");
    const others = users.filter(u => u.status !== "PENDING");
    const admins = others.filter(u => ADMIN_ROLES.includes(u.role)).length;
    const createValid = createForm.email.trim() && createForm.password.length >= 8;

    return (
        <div className="flex flex-col gap-3.5">
            <PageHeader title="Users" scope={[`${others.length} accounts`, `${admins} administrators`, waiting.length ? `${waiting.length} awaiting approval` : "No requests waiting"]}>
                <Button onClick={() => setShowCreate(v => !v)} aria-expanded={showCreate}><Plus className="mr-1.5 h-4 w-4" /> Create user</Button>
            </PageHeader>

            {showCreate && (
                <section className="monumental-card" aria-label="Create a user">
                    <div className="card-h"><h2>Create a user</h2><span className="sub">The account can sign in straight away</span></div>
                    <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={async e => {
                        e.preventDefault();
                        const ok = await call("/api/admin/users", "POST", createForm, `Account created for ${createForm.name || createForm.email}`);
                        if (ok) { setCreateForm({ name: "", email: "", role: "EMPLOYEE", password: "" }); setShowCreate(false); }
                    }}>
                        <div className="flex min-w-[160px] flex-1 flex-col gap-1.5"><label htmlFor="new-name" className="text-[13px] font-medium">Name</label><Input id="new-name" autoComplete="off" value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })} /></div>
                        <div className="flex min-w-[200px] flex-1 flex-col gap-1.5"><label htmlFor="new-email" className="text-[13px] font-medium">Email</label><Input id="new-email" type="email" required autoComplete="off" value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })} /></div>
                        <div className="flex w-[170px] flex-col gap-1.5"><span id="new-role-label" className="text-[13px] font-medium">Role</span>
                            <Select value={createForm.role} onValueChange={v => setCreateForm({ ...createForm, role: v })}>
                                <SelectTrigger aria-labelledby="new-role-label"><SelectValue /></SelectTrigger>
                                <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="flex w-[200px] flex-col gap-1.5"><label htmlFor="new-password" className="text-[13px] font-medium">Password</label><Input id="new-password" type="password" autoComplete="new-password" minLength={8} required aria-describedby="new-password-hint" value={createForm.password} onChange={e => setCreateForm({ ...createForm, password: e.target.value })} /></div>
                        <Button type="submit" disabled={busy || !createValid}>Create account</Button>
                        <p id="new-password-hint" className="basis-full text-xs text-muted-foreground">Passwords need at least 8 characters. Give it to the person directly; it is not emailed.</p>
                    </form>
                </section>
            )}

            {waiting.length > 0 && (
                <section className="monumental-card" aria-label="Requests awaiting approval">
                    <div className="card-h"><h2>Awaiting approval</h2><span className="sub">{waiting.length} {waiting.length === 1 ? "person has" : "people have"} asked for an account</span></div>
                    <div className="mt-3 overflow-x-auto">
                        <Table>
                            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead className="text-right"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
                            <TableBody>
                                {waiting.map(u => (
                                    <TableRow key={u.id}>
                                        <TableCell>{u.name || "—"}</TableCell>
                                        <TableCell className="text-muted-foreground">{u.email}</TableCell>
                                        <TableCell className="space-x-2 whitespace-nowrap text-right">
                                            <Button size="sm" disabled={busy} onClick={() => patch(u, { status: "ACTIVE" }, `${who(u)} was approved`)}>Approve</Button>
                                            <Button size="sm" variant="outline" disabled={busy} onClick={() => setPending({ kind: "delete", user: u })}>Reject</Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </section>
            )}

            <section className="monumental-card" aria-label="All users">
                <div className="card-h"><h2>All users</h2><span className="sub">{others.length}</span></div>
                <div className="mt-3 overflow-x-auto">
                    <Table>
                        <TableHeader><TableRow>
                            <TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead>
                            <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                            {others.map(u => (
                                <TableRow key={u.id}>
                                    <TableCell className="font-medium">{u.name || "—"}</TableCell>
                                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                                    <TableCell>
                                        <Select value={u.role} onValueChange={v => changeRole(u, v)} disabled={busy}>
                                            <SelectTrigger aria-label={`Role for ${who(u)}`} className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
                                            <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell><StatusPill status={u.status} /></TableCell>
                                    <TableCell className="whitespace-nowrap text-right">
                                        <span className="inline-flex gap-1.5">
                                            <button type="button" className="ibtn" disabled={busy} title="Set a new password" aria-label={`Set a new password for ${who(u)}`} onClick={() => setPending({ kind: "password", user: u })}><KeyRound /></button>
                                            {u.status === "ACTIVE"
                                                ? <button type="button" className="ibtn" disabled={busy} title="Stop this person signing in" aria-label={`Disable ${who(u)}`} onClick={() => setStatus(u, "DISABLED")}><Ban /></button>
                                                : <button type="button" className="ibtn" disabled={busy} title="Let this person sign in again" aria-label={`Enable ${who(u)}`} onClick={() => setStatus(u, "ACTIVE")}><Check /></button>}
                                            <button type="button" className="ibtn text-crit" disabled={busy} title="Delete this account" aria-label={`Delete ${who(u)}`} onClick={() => setPending({ kind: "delete", user: u })}><Trash2 /></button>
                                        </span>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </section>

            <Dialog open={!!pending} onOpenChange={open => { if (!open) closeDialog(); }}>
                {pending && (
                    <DialogContent className="max-w-[440px]">
                        <form onSubmit={e => { e.preventDefault(); confirmPending(); }}>
                            <DialogHeader>
                                <DialogTitle>
                                    {pending.kind === "password" ? `Set a new password for ${who(pending.user)}`
                                        : pending.kind === "delete" ? `Delete ${who(pending.user)}?`
                                            : `Make ${who(pending.user)} a ${roleLabel(pending.role).toLowerCase()}?`}
                                </DialogTitle>
                                <DialogDescription>
                                    {pending.kind === "password" ? `${pending.user.email} will sign in with this password from now on. Their current password stops working.`
                                        : pending.kind === "delete" ? `${pending.user.email} will lose access and the account is removed. This cannot be undone. To stop someone signing in without removing them, disable the account instead.`
                                            : "Administrators can upload reports, change the vote registry and settings, and manage every other account."}
                                </DialogDescription>
                            </DialogHeader>
                            {pending.kind === "password" && (
                                <div className="mt-4 flex flex-col gap-1.5">
                                    <label htmlFor="reset-password" className="text-[13px] font-medium">New password</label>
                                    <div className="relative">
                                        <Input id="reset-password" autoFocus type={showPw ? "text" : "password"} autoComplete="new-password" minLength={8} className="pr-11"
                                            value={newPassword} onChange={e => setNewPassword(e.target.value)} aria-describedby="reset-hint" />
                                        <button type="button" onClick={() => setShowPw(v => !v)} aria-label={showPw ? "Hide password" : "Show password"} aria-pressed={showPw}
                                            className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground">
                                            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                    <p id="reset-hint" className="text-xs text-muted-foreground">At least 8 characters.</p>
                                </div>
                            )}
                            <DialogFooter className="mt-5 gap-2">
                                <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
                                <Button type="submit" variant={pending.kind === "delete" ? "destructive" : "default"} disabled={busy || (pending.kind === "password" && newPassword.length < 8)}>
                                    {pending.kind === "password" ? "Set password" : pending.kind === "delete" ? "Delete account" : "Make administrator"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                )}
            </Dialog>
        </div>
    );
}
