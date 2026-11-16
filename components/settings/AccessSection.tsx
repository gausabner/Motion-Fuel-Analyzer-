import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { NAV_GROUPS } from "@/lib/nav";
import { Section } from "./parts";

const ROLES = [
    { key: "SUPER_ADMIN", label: "Super admin" },
    { key: "SYSTEM_ADMIN", label: "System admin" },
    { key: "SYSTEM_HEAD", label: "System head" },
    { key: "EMPLOYEE", label: "Employee" },
];
const ADMINS = ["SUPER_ADMIN", "SYSTEM_ADMIN"];
const EVERYONE = ROLES.map(r => r.key);

/**
 * Actions and the roles the server accepts them from. These mirror the checks
 * in the API routes (requireRole / requireSession), not a separate list of
 * intentions, so the table cannot promise something the server refuses.
 */
const ACTIONS: { name: string; roles: string[] }[] = [
    { name: "Mark an exception explained or escalated", roles: EVERYONE },
    { name: "Export tables to CSV and reports to PDF", roles: EVERYONE },
    { name: "Upload fuel reports", roles: ADMINS },
    { name: "Assign vote codes and edit the registry", roles: ADMINS },
    { name: "Change currency, prices, rules, tanks and organisation details", roles: ADMINS },
    { name: "Create, approve, disable and delete users", roles: ADMINS },
    { name: "See the change history", roles: ADMINS },
];

function Mark({ on, label }: { on: boolean; label: string }) {
    return on
        ? <span className="inline-grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground" role="img" aria-label={`${label}: yes`}><Check className="h-3 w-3" strokeWidth={3} /></span>
        : <span className="inline-grid h-5 w-5 place-items-center text-faint" role="img" aria-label={`${label}: no`}><Minus className="h-3.5 w-3.5" /></span>;
}

function Matrix({ caption, rows }: { caption: string; rows: { name: string; roles: string[] }[] }) {
    return (
        <div className="mt-3 overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-[13px]">
                <caption className="sr-only">{caption}</caption>
                <thead><tr>
                    <th scope="col" className="relative bg-surface-2 px-2.5 py-2 text-left text-[11.5px] font-medium text-muted-foreground first:rounded-l-[10px]">{caption}</th>
                    {ROLES.map(r => <th key={r.key} scope="col" className="relative w-[104px] whitespace-nowrap bg-surface-2 px-2.5 py-2 text-center text-[11.5px] font-medium text-muted-foreground last:rounded-r-[10px]">{r.label}</th>)}
                </tr></thead>
                <tbody>
                    {rows.map(row => (
                        <tr key={row.name}>
                            <th scope="row" className="border-b border-grid px-2.5 py-2.5 text-left font-normal">{row.name}</th>
                            {ROLES.map(r => <td key={r.key} className="border-b border-grid px-2.5 py-2.5 text-center"><Mark on={row.roles.includes(r.key)} label={`${r.label}, ${row.name}`} /></td>)}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/** Who can open which page and do which thing. Read-only; roles are set per person on the Users page. */
export function AccessSection() {
    const pages = NAV_GROUPS.flatMap(g => g.items.map(i => ({ name: i.name, roles: i.roles })));
    return (
        <Section id="access" title="Roles and access"
            sub={<>What each role can open and do. A person&rsquo;s role is set on the <Link href="/dashboard/users" className="lnk">Users</Link> page; the roles themselves are fixed.</>}>
            <Matrix caption="Pages" rows={pages} />
            <Matrix caption="Actions" rows={ACTIONS} />
            <p className="mt-3 max-w-[80ch] text-[13px] text-muted-foreground">
                New accounts start as Employee and cannot sign in until an administrator approves them. The Settings page is in the Super admin menu only,
                although a System admin&rsquo;s changes to these settings are accepted by the server.
            </p>
        </Section>
    );
}
