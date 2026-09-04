"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Building2, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import { TableCsvButton } from "@/components/reports/ReportExports";
import type { AttributionResult, UnitVoteRow } from "@/lib/vehicle-attribution";

const fmtL = (n: number) => `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} L`;

/** Units listed inline for a multi-unit match; the CSV always has the full set. */
const MULTI_LIST_LIMIT = 12;

/**
 * Shows which cost centre a filtered fleet unit's fuel is booked to, and — for
 * unregistered votes — offers to register them (admins only).
 */
export function UnitAttributionCard({
    attribution,
    canAssign = false,
    exportUrl,
}: {
    attribution: AttributionResult | null;
    canAssign?: boolean;
    /** When set, shows a CSV button for the unit's vote split. */
    exportUrl?: string;
}) {
    if (!attribution) return null;

    if (attribution.matchedCount === 0) {
        return (
            <Card className="monumental-card border-l-4 border-l-muted">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Unit attribution</CardTitle>
                    <CardDescription>No fuel issues found for “{attribution.query}” in this period.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    // Substring searches can match many units — summarise, then list them so the
    // ones needing attention are still reachable.
    if (!attribution.unit) {
        const { units, departments, unassignedUnits } = attribution.summary;
        const shown = attribution.units.slice(0, MULTI_LIST_LIMIT);
        return (
            <Card className="monumental-card border-l-4 border-l-foreground/20">
                <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Unit attribution</CardTitle>
                            <CardDescription className="mt-1.5">
                                <span className="font-semibold text-foreground">{units} units</span> match “{attribution.query}”,
                                spanning <span className="font-semibold text-foreground">{departments}</span> department{departments === 1 ? "" : "s"}
                                {unassignedUnits > 0 && (
                                    <> · <span className="font-semibold text-amber-600">{unassignedUnits}</span> with unregistered votes</>
                                )}
                                . Search one unit number to see and fix its attribution.
                            </CardDescription>
                        </div>
                        {exportUrl && <TableCsvButton filename="unit_attribution.csv" serverUrl={exportUrl} />}
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                                    <th className="py-1.5 pr-3 font-bold">Unit</th>
                                    <th className="py-1.5 pr-3 font-bold">Cost centre</th>
                                    <th className="py-1.5 pr-3 font-bold text-right">Litres</th>
                                    <th className="py-1.5 font-bold text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {shown.map(u => (
                                    <tr key={u.unitNo} className="border-b border-border/50 last:border-0">
                                        <td className="py-1.5 pr-3 font-mono font-semibold">{u.unitNo}</td>
                                        <td className="py-1.5 pr-3">
                                            {u.primary
                                                ? <>{u.primary.department}<span className="text-muted-foreground"> / {u.primary.division}</span></>
                                                : <span className="text-amber-600 font-semibold">No registered cost centre</span>}
                                            {u.departments.length > 1 && (
                                                <span className="text-muted-foreground"> +{u.departments.length - 1} more</span>
                                            )}
                                        </td>
                                        <td className="py-1.5 pr-3 text-right font-mono">{fmtL(u.litres)}</td>
                                        <td className="py-1.5 text-right"><StatusBadge status={u.status} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {attribution.units.length > shown.length && (
                        <p className="text-xs text-muted-foreground mt-3">
                            Showing {shown.length} of {attribution.units.length} matched units, unresolved first.
                            The CSV contains them all.
                        </p>
                    )}
                </CardContent>
            </Card>
        );
    }

    return <SingleUnit unit={attribution.unit} canAssign={canAssign} exportUrl={exportUrl} />;
}

function SingleUnit({ unit, canAssign, exportUrl }: {
    unit: NonNullable<AttributionResult["unit"]>;
    canAssign: boolean;
    exportUrl?: string;
}) {
    const assigned = unit.status === "assigned";
    const accent = assigned ? "border-l-emerald-500" : "border-l-amber-500";

    return (
        <Card className={`monumental-card border-l-4 ${accent}`}>
            <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                            Unit attribution
                        </CardTitle>
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                            <Building2 className="h-4 w-4 text-foreground" />
                            <span className="text-lg font-extrabold text-foreground">{unit.unitNo}</span>
                            {unit.primary ? (
                                <span className="text-sm text-muted-foreground">
                                    · {unit.primary.department} <span className="opacity-60">/ {unit.primary.division}</span>
                                </span>
                            ) : (
                                <span className="text-sm text-amber-600 font-semibold">· No registered cost centre</span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <StatusBadge status={unit.status} />
                        {exportUrl && <TableCsvButton filename="unit_attribution.csv" serverUrl={exportUrl} />}
                    </div>
                </div>

                {unit.departments.length > 1 && (
                    <CardDescription className="mt-2">
                        This unit books fuel to <span className="font-semibold text-foreground">{unit.departments.length} departments</span>;
                        the one shown is its highest-volume. Full split below.
                    </CardDescription>
                )}
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Vote split — always useful, and the audit trail for the status. */}
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                                <th className="py-1.5 pr-3 font-bold">Issue vote</th>
                                <th className="py-1.5 pr-3 font-bold">Department</th>
                                <th className="py-1.5 pr-3 font-bold">Division</th>
                                <th className="py-1.5 pr-3 font-bold text-right">Litres</th>
                                <th className="py-1.5 font-bold text-right">Txns</th>
                            </tr>
                        </thead>
                        <tbody>
                            {unit.votes.map(v => (
                                <tr key={v.voteNo} className="border-b border-border/50 last:border-0">
                                    <td className="py-1.5 pr-3 font-mono">{v.voteNo || "—"}</td>
                                    <td className="py-1.5 pr-3">
                                        {v.department ?? (
                                            <span className="text-amber-600 font-semibold">
                                                Unregistered
                                                {v.suggestedDepartment && (
                                                    <span className="font-normal opacity-80"> · suggested: {v.suggestedDepartment}</span>
                                                )}
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-1.5 pr-3 text-muted-foreground">{v.division ?? "—"}</td>
                                    <td className="py-1.5 pr-3 text-right font-mono">{fmtL(v.litres)}</td>
                                    <td className="py-1.5 text-right font-mono">{v.txns}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Assignment is only offered when something is actually unregistered. */}
                {unit.unresolved.length > 0 && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-2">
                        <p className="text-xs text-foreground">
                            <AlertTriangle className="h-3.5 w-3.5 inline mr-1.5 text-amber-600" />
                            {unit.unresolved.length} vote{unit.unresolved.length === 1 ? " is" : "s are"} not registered to a cost centre.
                        </p>
                        {canAssign ? (
                            <div className="flex flex-wrap gap-2">
                                {unit.unresolved.map(v => (
                                    <AssignDialog key={v.voteNo} vote={v} unitNo={unit.unitNo} />
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                Registering a vote requires an administrator.{" "}
                                <Link href="/dashboard/registry?tab=unassigned" className="underline font-medium">
                                    Review in the registry <ExternalLink className="h-3 w-3 inline" />
                                </Link>
                            </p>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function StatusBadge({ status }: { status: "assigned" | "partial" | "unassigned" }) {
    if (status === "assigned") {
        return (
            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Assigned
            </Badge>
        );
    }
    return (
        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {status === "partial" ? "Partly assigned" : "Not assigned"}
        </Badge>
    );
}

function AssignDialog({ vote, unitNo }: { vote: UnitVoteRow; unitNo: string }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [department, setDepartment] = useState(vote.suggestedDepartment || "");
    const [division, setDivision] = useState(vote.suggestedDivision || "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/registry/cost-centres", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ voteNo: vote.voteNo, department, division }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(json.error || "Could not register this vote.");
                return;
            }
            setOpen(false);
            router.refresh();
        } catch {
            setError("Network error — please try again.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 text-xs font-mono">
                    Assign {vote.voteNo}
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Register vote {vote.voteNo}</DialogTitle>
                    <DialogDescription>
                        {unitNo} books {fmtL(vote.litres)} across {vote.txns} transaction{vote.txns === 1 ? "" : "s"} to this vote.
                        Cost centres attach to the <strong>vote</strong>, not the unit — so registering it will also
                        attribute every other unit that books fuel to {vote.voteNo}.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Department</label>
                        <Input value={department} onChange={e => setDepartment(e.target.value)} placeholder="DEPARTMENT OF …" />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Division</label>
                        <Input value={division} onChange={e => setDivision(e.target.value)} placeholder="DIVISION NAME" />
                    </div>
                    {vote.suggestedDepartment && (
                        <p className="text-xs text-muted-foreground">
                            Suggested from the vote’s division prefix. Check before saving.
                        </p>
                    )}
                    {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
                    <Button onClick={submit} disabled={busy || !department.trim() || !division.trim()}>
                        {busy ? "Saving…" : "Register vote"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
