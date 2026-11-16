"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Row, Section } from "@/components/settings/parts";

type Account = { name: string | null; email: string; role: string; createdAt?: string };
const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: "Super admin", SYSTEM_ADMIN: "System admin", SYSTEM_HEAD: "System head", EMPLOYEE: "Employee" };

/** Your own name and password. Everyone has this page; it reaches no account but the one signed in. */
export default function AccountPage() {
    const router = useRouter();
    const { update } = useSession();
    const [account, setAccount] = useState<Account | null>(null);
    const [name, setName] = useState("");
    const [savingName, setSavingName] = useState(false);
    const [pw, setPw] = useState({ current: "", next: "", again: "" });
    const [show, setShow] = useState(false);
    const [savingPw, setSavingPw] = useState(false);
    const [pwError, setPwError] = useState<{ field: "current" | "next" | "again"; text: string } | null>(null);

    useEffect(() => {
        fetch("/api/account").then(r => r.json()).then(d => { if (d.account) { setAccount(d.account); setName(d.account.name ?? ""); } })
            .catch(() => toast.error("Your account details could not be loaded. Reload the page to try again."));
    }, []);

    if (!account) {
        return <div className="flex max-w-[760px] flex-col gap-3.5" aria-busy="true" aria-label="Loading your account"><div className="skel-line h-9 w-48" /><div className="skel-line h-40" /><div className="skel-line h-64" /></div>;
    }

    const nameDirty = name.trim() !== (account.name ?? "") && name.trim() !== "";

    const saveName = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!nameDirty) return;
        setSavingName(true);
        try {
            const res = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { toast.error(d.error || "Your name was not saved. Try again."); return; }
            setAccount({ ...account, name: d.name }); setName(d.name);
            await update({ name: d.name });      // refresh the name shown in the menu without signing out
            toast("Name saved");
            router.refresh();
        } catch {
            toast.error("Your name was not saved. Check your connection and try again.");
        } finally { setSavingName(false); }
    };

    const savePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setPwError(null);
        if (!pw.current) { setPwError({ field: "current", text: "Enter your current password." }); return; }
        if (pw.next.length < 8) { setPwError({ field: "next", text: "Choose a new password of at least 8 characters." }); return; }
        if (pw.next !== pw.again) { setPwError({ field: "again", text: "The two new passwords are not the same." }); return; }
        setSavingPw(true);
        try {
            const res = await fetch("/api/account/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current: pw.current, next: pw.next }) });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setPwError({ field: d.field === "next" ? "next" : "current", text: d.error || "The password was not changed. Try again." }); return; }
            setPw({ current: "", next: "", again: "" });
            toast("Password changed", { description: "Use the new password next time you sign in." });
        } catch {
            setPwError({ field: "current", text: "The password was not changed. Check your connection and try again." });
        } finally { setSavingPw(false); }
    };

    const type = show ? "text" : "password";
    const err = (f: "current" | "next" | "again") => (pwError?.field === f ? pwError.text : null);

    return (
        <div className="flex max-w-[760px] flex-col gap-3.5">
            <PageHeader title="My account" scope={[account.email, ROLE_LABEL[account.role] ?? account.role]} />

            <Section title="Profile" sub="How you appear in the menu, on exception reviews and in the change history.">
                <form onSubmit={saveName}>
                    <Row label="Name" hint="Shown wherever the app says who did something." htmlFor="acc-name">
                        <Input id="acc-name" maxLength={80} autoComplete="name" value={name} onChange={e => setName(e.target.value)} />
                    </Row>
                    <Row label="Email" hint="This is what you sign in with. An administrator can change it for you.">
                        <p className="mono text-[13px]">{account.email}</p>
                    </Row>
                    <Row label="Role" hint="Decides which pages and actions you have. Set by an administrator.">
                        <p className="text-[13px]">{ROLE_LABEL[account.role] ?? account.role}</p>
                    </Row>
                    <div className="mt-4 flex justify-end gap-2.5">
                        <Button type="button" variant="outline" disabled={!nameDirty || savingName} onClick={() => setName(account.name ?? "")}>Discard</Button>
                        <Button type="submit" disabled={!nameDirty || savingName}>{savingName ? "Saving" : "Save name"}</Button>
                    </div>
                </form>
            </Section>

            <Section title="Password" sub="Changing it here needs your current password. If you have forgotten it, an administrator can set a new one from the Users page.">
                <form onSubmit={savePassword} noValidate>
                    <Row label="Current password" hint="To confirm it is you." htmlFor="acc-current">
                        <Input id="acc-current" type={type} autoComplete="current-password" value={pw.current} aria-invalid={!!err("current")} aria-describedby={err("current") ? "acc-current-err" : undefined}
                            onChange={e => setPw({ ...pw, current: e.target.value })} />
                        {err("current") && <p id="acc-current-err" role="alert" className="mt-1.5 text-xs text-crit">{err("current")}</p>}
                    </Row>
                    <Row label="New password" hint="At least 8 characters." htmlFor="acc-next">
                        <div className="relative">
                            <Input id="acc-next" type={type} autoComplete="new-password" className="pr-11" value={pw.next} aria-invalid={!!err("next")} aria-describedby={err("next") ? "acc-next-err" : undefined}
                                onChange={e => setPw({ ...pw, next: e.target.value })} />
                            <button type="button" onClick={() => setShow(v => !v)} aria-label={show ? "Hide passwords" : "Show passwords"} aria-pressed={show}
                                className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground">
                                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                        {err("next") && <p id="acc-next-err" role="alert" className="mt-1.5 text-xs text-crit">{err("next")}</p>}
                    </Row>
                    <Row label="New password again" hint="Typed twice so a slip does not lock you out." htmlFor="acc-again">
                        <Input id="acc-again" type={type} autoComplete="new-password" value={pw.again} aria-invalid={!!err("again")} aria-describedby={err("again") ? "acc-again-err" : undefined}
                            onChange={e => setPw({ ...pw, again: e.target.value })} />
                        {err("again") && <p id="acc-again-err" role="alert" className="mt-1.5 text-xs text-crit">{err("again")}</p>}
                    </Row>
                    <div className="mt-4 flex justify-end">
                        <Button type="submit" disabled={savingPw || (!pw.current && !pw.next && !pw.again)}>{savingPw ? "Changing" : "Change password"}</Button>
                    </div>
                </form>
            </Section>
        </div>
    );
}
