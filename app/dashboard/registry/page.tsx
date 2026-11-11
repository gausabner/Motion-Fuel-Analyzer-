"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Building2, Truck, Hash, Plus, Trash2, RefreshCcw, DownloadCloud, FileWarning, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { useNavBadges } from "@/components/dashboard/NavBadges";
import { fmtLitres } from "@/lib/format";

type Department = { name: string; voteCount: number };
type CostCentre = { voteNo: string; division: string; department: string };
type FleetUnit = { unitNo: string; description: string | null };
type UnassignedVote = { voteNo: string; txns: number; litres: number; suggestedDepartment: string | null };

export default function RegistryPage() {
    const [departments, setDepartments] = useState<Department[]>([]);
    const [costCentres, setCostCentres] = useState<CostCentre[]>([]);
    const [fleetUnits, setFleetUnits] = useState<FleetUnit[]>([]);
    const [loading, setLoading] = useState(true);
    const { refresh: refreshBadges } = useNavBadges();
    const [busy, setBusy] = useState(false);

    const [newDept, setNewDept] = useState("");
    const [ccForm, setCcForm] = useState({ department: "", division: "", voteNo: "" });
    const [unitForm, setUnitForm] = useState({ unitNo: "", description: "" });
    const [unitFilter, setUnitFilter] = useState("");

    const [unassigned, setUnassigned] = useState<UnassignedVote[]>([]);
    const [assignVote, setAssignVote] = useState<string | null>(null);
    const [assignForm, setAssignForm] = useState({ department: "", division: "" });
    // Bulk assignment: the remaining backlog needs human decisions, but codes
    // usually come in family groups that share one cost centre.
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [bulkForm, setBulkForm] = useState({ department: "", division: "" });
    const toggle = (voteNo: string) => setSelected(prev => {
        const next = new Set(prev);
        next.has(voteNo) ? next.delete(voteNo) : next.add(voteNo);
        return next;
    });

    // Deep-link support: /dashboard/registry?tab=unassigned opens that tab.
    const [tab, setTab] = useState("costcentres");
    useEffect(() => {
        const t = new URLSearchParams(window.location.search).get("tab");
        if (t) setTab(t);
    }, []);

    const loadAll = useCallback(async () => {
        try {
            const [d, c, f, u] = await Promise.all([
                fetch("/api/registry/departments").then(r => r.json()),
                fetch("/api/registry/cost-centres").then(r => r.json()),
                fetch("/api/registry/fleet-units").then(r => r.json()),
                fetch("/api/registry/unassigned-votes").then(r => r.json()),
            ]);
            setDepartments(d.departments || []);
            setCostCentres(c.costCentres || []);
            setFleetUnits(f.fleetUnits || []);
            setUnassigned(u.votes || []);
            refreshBadges();
        } catch {
            toast.error("The registry could not be loaded. Reload the page to try again.");
        } finally {
            setLoading(false);
        }
    }, [refreshBadges]);

    useEffect(() => { loadAll(); }, [loadAll]);

    const divisionsFor = (dept: string) =>
        Array.from(new Set(costCentres.filter(c => c.department === dept).map(c => c.division))).sort();

    const bulkAssign = async () => {
        setBusy(true);
        try {
            const res = await fetch("/api/registry/cost-centres", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ voteNos: [...selected], ...bulkForm }),
            });
            const data = await res.json();
            if (!res.ok) { toast.error(data.error || "Bulk assign failed"); return; }
            const skipped = data.skipped?.length || 0;
            toast.success(
                `Registered ${data.created.length} code${data.created.length === 1 ? "" : "s"}`
                + (skipped ? ` · ${skipped} skipped` : "")
            );
            if (skipped) for (const s of data.skipped) toast.error(`${s.voteNo}: ${s.reason}`);
            setSelected(new Set());
            setBulkForm({ department: "", division: "" });
            await loadAll();
        } catch {
            toast.error("That change was not saved. Check your connection and try again.");
        } finally {
            setBusy(false);
        }
    };

    const post = async (url: string, body: any, onOk: () => void) => {
        setBusy(true);
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (res.ok) {
                onOk();
                await loadAll();
            } else {
                toast.error(data.error || "That change was not saved. Try again.");
            }
        } catch {
            toast.error("That change was not saved. Check your connection and try again.");
        } finally {
            setBusy(false);
        }
    };

    /** Remove a registry entry. `restore` re-creates it, and is offered as Undo for five seconds. */
    const remove = async (url: string, label: string, restore?: { url: string; body: Record<string, unknown> }) => {
        setBusy(true);
        try {
            const res = await fetch(url, { method: "DELETE" });
            const data = await res.json();
            if (res.ok) {
                toast(`${label} removed`, restore ? {
                    duration: 5000,
                    action: { label: "Undo", onClick: () => post(restore.url, restore.body, () => toast(`${label} restored`)) },
                } : undefined);
                await loadAll();
            } else {
                toast.error(data.error || "That entry could not be removed. Try again.");
            }
        } catch {
            toast.error("That change was not saved. Check your connection and try again.");
        } finally {
            setBusy(false);
        }
    };

    if (loading) return (
        <div className="flex flex-col gap-3.5" aria-busy="true" aria-label="Loading the registry">
            <div className="skel h-9 w-56" />
            <div className="skel h-28" />
            <div className="skel h-96" />
        </div>
    );

    const filteredUnits = unitFilter
        ? fleetUnits.filter(u => u.unitNo.toLowerCase().includes(unitFilter.toLowerCase()))
        : fleetUnits;

    const backlogLitres = unassigned.reduce((sum, v) => sum + v.litres, 0);
    const backlogTxns = unassigned.reduce((sum, v) => sum + v.txns, 0);
    const known = costCentres.length;
    const mappedPct = known + unassigned.length > 0 ? (known / (known + unassigned.length)) * 100 : 100;

    return (
        <div className="flex flex-col gap-3.5">
            <PageHeader
                title="Vote registry"
                scope={[`${known.toLocaleString("en-GB")} vote codes`, `${departments.length} departments`, `${fleetUnits.length.toLocaleString("en-GB")} fleet units`]}
            />

            <section className="monumental-card" aria-label="Summary">
                <p className="bigline">
                    {unassigned.length === 0
                        ? "Every vote code on the fuel issues is mapped to a cost centre."
                        : `${unassigned.length} vote ${unassigned.length === 1 ? "code has" : "codes have"} no cost centre yet, holding ${fmtLitres(backlogLitres)} across ${backlogTxns.toLocaleString("en-GB")} issues.`}
                    <small>
                        Fuel on an unmapped code still counts in every total; it simply cannot be charged to a department until the code is assigned.
                    </small>
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="meter min-w-[140px] flex-1" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(mappedPct)} aria-label="Share of vote codes mapped">
                        <i style={{ "--p": `${mappedPct}%` } as React.CSSProperties} />
                    </div>
                    <span className="mono text-xs text-muted-foreground">{mappedPct.toFixed(1)}% of codes mapped</span>
                    {unassigned.length > 0 && tab !== "unassigned" && (
                        <button type="button" className="lnk text-[13px]" onClick={() => setTab("unassigned")}>Review the backlog</button>
                    )}
                </div>
            </section>

            <Tabs value={tab} onValueChange={setTab} className="flex flex-col gap-3.5">
                <TabsList>
                    <TabsTrigger value="costcentres">
                        <Hash className="h-3.5 w-3.5 mr-1.5" /> Vote numbers<span className="ct">{costCentres.length}</span>
                    </TabsTrigger>
                    <TabsTrigger value="departments">
                        <Building2 className="h-3.5 w-3.5 mr-1.5" /> Departments<span className="ct">{departments.length}</span>
                    </TabsTrigger>
                    <TabsTrigger value="fleet">
                        <Truck className="h-3.5 w-3.5 mr-1.5" /> Fleet units<span className="ct">{fleetUnits.length}</span>
                    </TabsTrigger>
                    <TabsTrigger value="unassigned">
                        <FileWarning className="h-3.5 w-3.5 mr-1.5" />
                        Unassigned votes
                        {unassigned.length > 0 && (
                            <span className="ct">{unassigned.length}</span>
                        )}
                    </TabsTrigger>
                </TabsList>

                {/* ============ COST CENTRES / VOTE NUMBERS ============ */}
                <TabsContent value="costcentres">
                    <Card className="monumental-card">
                        <CardHeader>
                            <CardTitle>Vote numbers</CardTitle>
                            <CardDescription>Each vote number belongs to a division within a department. Transactions are matched by vote number.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap items-end gap-3 p-4 bg-surface-2 rounded-tile">
                                <div className="space-y-1 min-w-[260px] flex-1">
                                    <label className="text-xs font-semibold text-muted-foreground">Department</label>
                                    <Select value={ccForm.department} onValueChange={v => setCcForm({ ...ccForm, department: v })}>
                                        <SelectTrigger aria-label="Department" className="bg-background h-10">
                                            <SelectValue placeholder="Select department..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {departments.map(d => (
                                                <SelectItem key={d.name} value={d.name}>{d.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1 min-w-[200px] flex-1">
                                    <label htmlFor="division-204" className="text-xs font-semibold text-muted-foreground">Division</label>
                                    <Input
                                        id="division-204"
                                        placeholder="e.g. TRAFFIC MANAGEMENT UNIT"
                                        value={ccForm.division}
                                        onChange={e => setCcForm({ ...ccForm, division: e.target.value })}
                                        className="bg-background h-10"
                                    />
                                </div>
                                <div className="space-y-1 min-w-[180px]">
                                    <label htmlFor="vote-number-213" className="text-xs font-semibold text-muted-foreground">Vote number</label>
                                    <Input
                                        id="vote-number-213"
                                        placeholder="e.g. 4520151100655"
                                        value={ccForm.voteNo}
                                        onChange={e => setCcForm({ ...ccForm, voteNo: e.target.value.replace(/\D/g, "") })}
                                        className="bg-background h-10 font-mono"
                                    />
                                </div>
                                <Button
                                    disabled={busy || !ccForm.department || !ccForm.division || !ccForm.voteNo}
                                    onClick={() => post("/api/registry/cost-centres", ccForm, () => {
                                        toast.success(`Vote ${ccForm.voteNo} registered`);
                                        setCcForm({ department: ccForm.department, division: "", voteNo: "" });
                                    })}
                                    className="font-semibold h-10"
                                >
                                    <Plus className="h-4 w-4 mr-1" /> Add vote
                                </Button>
                            </div>

                            <div className="max-h-[480px] overflow-y-auto">
                                <Table>
                                    <TableHeader className="sticky top-0 z-10">
                                        <TableRow>
                                            <TableHead>Vote number</TableHead>
                                            <TableHead>Division</TableHead>
                                            <TableHead>Department</TableHead>
                                            <TableHead className="w-12"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {costCentres.map(cc => (
                                            <TableRow key={cc.voteNo}>
                                                <TableCell className="mono text-[13px]">{cc.voteNo}</TableCell>
                                                <TableCell className="text-xs">{cc.division}</TableCell>
                                                <TableCell className="text-xs text-muted-foreground">{cc.department}</TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="ghost" size="sm" disabled={busy}
                                                        aria-label={`Remove vote ${cc.voteNo}`}
                                                        onClick={() => remove(`/api/registry/cost-centres?voteNo=${encodeURIComponent(cc.voteNo)}`, `Vote ${cc.voteNo}`, { url: "/api/registry/cost-centres", body: { voteNo: cc.voteNo, department: cc.department, division: cc.division } })}
                                                        className="h-8 w-8 p-0 text-muted-foreground hover:text-crit"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ============ DEPARTMENTS ============ */}
                <TabsContent value="departments">
                    <Card className="monumental-card">
                        <CardHeader>
                            <CardTitle>Departments</CardTitle>
                            <CardDescription>Departments can be registered before any vote numbers are assigned to them.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-end gap-3 p-4 bg-surface-2 rounded-tile">
                                <div className="space-y-1 flex-1">
                                    <label htmlFor="department-name-277" className="text-xs font-semibold text-muted-foreground">Department name</label>
                                    <Input
                                        id="department-name-277"
                                        placeholder="e.g. DEPARTMENT OF ELECTRICITY"
                                        value={newDept}
                                        onChange={e => setNewDept(e.target.value)}
                                        className="bg-background h-10"
                                    />
                                </div>
                                <Button
                                    disabled={busy || !newDept.trim()}
                                    onClick={() => post("/api/registry/departments", { name: newDept }, () => {
                                        toast.success("Department registered");
                                        setNewDept("");
                                    })}
                                    className="font-semibold h-10"
                                >
                                    <Plus className="h-4 w-4 mr-1" /> Add department
                                </Button>
                            </div>

                            <div>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Department</TableHead>
                                            <TableHead className="text-right">Vote numbers</TableHead>
                                            <TableHead className="w-12"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {departments.map(d => (
                                            <TableRow key={d.name}>
                                                <TableCell className="text-xs font-semibold">{d.name}</TableCell>
                                                <TableCell className="mono text-right">{d.voteCount}</TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="ghost" size="sm" disabled={busy}
                                                        aria-label={`Remove ${d.name}`}
                                                        onClick={() => remove(`/api/registry/departments?name=${encodeURIComponent(d.name)}`, d.name, { url: "/api/registry/departments", body: { name: d.name } })}
                                                        className="h-8 w-8 p-0 text-muted-foreground hover:text-crit"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ============ FLEET UNITS ============ */}
                <TabsContent value="fleet">
                    <Card className="monumental-card">
                        <CardHeader>
                            <div className="flex items-start justify-between gap-4 flex-wrap">
                                <div>
                                    <CardTitle>Fleet Units</CardTitle>
                                    <CardDescription>Registered vehicle unit numbers. Sync pulls every distinct vehicle already seen in fuel transactions.</CardDescription>
                                </div>
                                <Button
                                    variant="outline" disabled={busy}
                                    onClick={() => post("/api/registry/fleet-units", { action: "sync" }, () => toast.success("Fleet units synced from transactions"))}
                                    className="font-semibold text-xs "
                                >
                                    <DownloadCloud className="h-4 w-4 mr-1.5" /> Sync from Transactions
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap items-end gap-3 p-4 bg-surface-2 rounded-tile">
                                <div className="space-y-1 min-w-[160px]">
                                    <label htmlFor="unit-number-350" className="text-xs font-semibold text-muted-foreground">Unit Number</label>
                                    <Input
                                        id="unit-number-350"
                                        placeholder="e.g. WM2711"
                                        value={unitForm.unitNo}
                                        onChange={e => setUnitForm({ ...unitForm, unitNo: e.target.value })}
                                        className="bg-background h-10 font-mono"
                                    />
                                </div>
                                <div className="space-y-1 flex-1 min-w-[200px]">
                                    <label htmlFor="description-359" className="text-xs font-semibold text-muted-foreground">Description (optional)</label>
                                    <Input
                                        id="description-359"
                                        placeholder="e.g. Refuse compactor - Solid Waste"
                                        value={unitForm.description}
                                        onChange={e => setUnitForm({ ...unitForm, description: e.target.value })}
                                        className="bg-background h-10"
                                    />
                                </div>
                                <Button
                                    disabled={busy || !unitForm.unitNo.trim()}
                                    onClick={() => post("/api/registry/fleet-units", unitForm, () => {
                                        toast.success(`Unit ${unitForm.unitNo.toUpperCase()} registered`);
                                        setUnitForm({ unitNo: "", description: "" });
                                    })}
                                    className="font-semibold h-10"
                                >
                                    <Plus className="h-4 w-4 mr-1" /> Add Unit
                                </Button>
                            </div>

                            <Input
                                placeholder="Filter units..."
                                value={unitFilter}
                                onChange={e => setUnitFilter(e.target.value)}
                                className="bg-background h-9 max-w-xs"
                            />

                            <div className="max-h-[480px] overflow-y-auto">
                                <Table>
                                    <TableHeader className="sticky top-0 z-10">
                                        <TableRow>
                                            <TableHead>Unit number</TableHead>
                                            <TableHead>Description</TableHead>
                                            <TableHead className="w-12"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredUnits.slice(0, 200).map(u => (
                                            <TableRow key={u.unitNo}>
                                                <TableCell className="mono text-[13px]">{u.unitNo}</TableCell>
                                                <TableCell className="text-xs text-muted-foreground">{u.description || '—'}</TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="ghost" size="sm" disabled={busy}
                                                        aria-label={`Remove unit ${u.unitNo}`}
                                                        onClick={() => remove(`/api/registry/fleet-units?unitNo=${encodeURIComponent(u.unitNo)}`, `Unit ${u.unitNo}`, { url: "/api/registry/fleet-units", body: { unitNo: u.unitNo, description: u.description ?? "" } })}
                                                        className="h-8 w-8 p-0 text-muted-foreground hover:text-crit"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {filteredUnits.length > 200 && (
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-3">
                                                    Showing first 200 of {filteredUnits.length} — use the filter to narrow down.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                        {filteredUnits.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-4">
                                                    No fleet units registered yet. Add one manually or sync from transactions.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ============ UNASSIGNED VOTES REVIEW QUEUE ============ */}
                <TabsContent value="unassigned">
                    <Card className="monumental-card">
                        <CardHeader>
                            <CardTitle>Unassigned vote review</CardTitle>
                            <CardDescription>
                                Codes on the fuel issues that match no cost centre, largest first. Assigning one updates every issue that carries it straight away.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {unassigned.length === 0 ? (
                                <div className="flex flex-col items-center justify-center text-center py-12">
                                    <div className="disc soft mb-4">
                                        <CheckCircle2 className="w-6 h-6 text-ok" />
                                    </div>
                                    <p className="text-sm font-semibold text-foreground">Every vote is assigned</p>
                                    <p className="text-xs text-muted-foreground mt-1">All fuel-issue transactions resolve to a department.</p>
                                </div>
                            ) : (
                                <>
                                {selected.size > 0 && (
                                    <div className="mb-3 rounded-tile bg-surface-2 p-3 flex flex-wrap items-end gap-3">
                                        <div className="text-xs font-semibold text-foreground mr-1 mb-2">
                                            {selected.size} code{selected.size === 1 ? "" : "s"} selected
                                        </div>
                                        <div className="space-y-1 min-w-[220px] flex-1">
                                            <label className="text-xs font-semibold text-muted-foreground">Department</label>
                                            <Select value={bulkForm.department} onValueChange={val => setBulkForm({ department: val, division: "" })}>
                                                <SelectTrigger aria-label="Department" className="bg-background h-9"><SelectValue placeholder="Select department..." /></SelectTrigger>
                                                <SelectContent>
                                                    {departments.map(d => <SelectItem key={d.name} value={d.name}>{d.name}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1 min-w-[220px] flex-1">
                                            <label className="text-xs font-semibold text-muted-foreground">Division</label>
                                            <Select
                                                value={bulkForm.division}
                                                onValueChange={val => setBulkForm({ ...bulkForm, division: val })}
                                                disabled={!bulkForm.department}
                                            >
                                                <SelectTrigger aria-label="Division" className="bg-background h-9"><SelectValue placeholder="Select division..." /></SelectTrigger>
                                                <SelectContent>
                                                    {divisionsFor(bulkForm.department).map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <Button
                                            onClick={bulkAssign}
                                            disabled={busy || !bulkForm.department || !bulkForm.division}
                                            className="h-9 text-xs"
                                        >
                                            Assign {selected.size} code{selected.size === 1 ? "" : "s"}
                                        </Button>
                                        <Button variant="outline" className="h-9 text-xs" disabled={busy} onClick={() => setSelected(new Set())}>
                                            Clear
                                        </Button>
                                    </div>
                                )}
                                <div className="max-h-[560px] overflow-y-auto">
                                    <Table>
                                        <TableHeader className="sticky top-0 z-10">
                                            <TableRow>
                                                <TableHead className="w-10">
                                                    <input
                                                        type="checkbox"
                                                        aria-label="Select all unassigned codes"
                                                        className="h-4 w-4 align-middle cursor-pointer accent-[var(--primary)]"
                                                        checked={selected.size === unassigned.length && unassigned.length > 0}
                                                        onChange={e => setSelected(e.target.checked ? new Set(unassigned.map(u => u.voteNo)) : new Set())}
                                                    />
                                                </TableHead>
                                                <TableHead>Vote code</TableHead>
                                                <TableHead>Suggested department</TableHead>
                                                <TableHead className="text-right">Issues</TableHead>
                                                <TableHead className="text-right">Litres</TableHead>
                                                <TableHead className="w-24"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {unassigned.map((v) => (
                                                <Fragment key={v.voteNo}>
                                                    <TableRow data-state={selected.has(v.voteNo) ? "selected" : undefined}>
                                                        <TableCell>
                                                            <input
                                                                type="checkbox"
                                                                aria-label={`Select ${v.voteNo}`}
                                                                className="h-4 w-4 align-middle cursor-pointer accent-[var(--primary)]"
                                                                checked={selected.has(v.voteNo)}
                                                                onChange={() => toggle(v.voteNo)}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="mono text-[13px]">{v.voteNo}</TableCell>
                                                        <TableCell className="text-xs">
                                                            {v.suggestedDepartment
                                                                ? <span className="text-brand">{v.suggestedDepartment}</span>
                                                                : <span className="text-muted-foreground">No suggestion</span>}
                                                        </TableCell>
                                                        <TableCell className="mono text-right">{v.txns}</TableCell>
                                                        <TableCell className="mono text-right">{v.litres.toLocaleString()}</TableCell>
                                                        <TableCell className="text-right">
                                                            <Button
                                                                size="sm"
                                                                variant={assignVote === v.voteNo ? "secondary" : "default"}
                                                                disabled={busy}
                                                                onClick={() => {
                                                                    if (assignVote === v.voteNo) { setAssignVote(null); return; }
                                                                    setAssignVote(v.voteNo);
                                                                    setAssignForm({ department: v.suggestedDepartment || "", division: "" });
                                                                }}
                                                                className="h-8 text-xs"
                                                            >
                                                                {assignVote === v.voteNo ? "Cancel" : "Assign"}
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                    {assignVote === v.voteNo && (
                                                        <TableRow className="bg-muted/40">
                                                            <TableCell colSpan={6} className="py-3">
                                                                <div className="flex flex-wrap items-end gap-3">
                                                                    <div className="space-y-1 min-w-[240px] flex-1">
                                                                        <label className="text-xs font-semibold text-muted-foreground">Department</label>
                                                                        <Select value={assignForm.department} onValueChange={val => setAssignForm({ ...assignForm, department: val })}>
                                                                            <SelectTrigger aria-label="Department" className="bg-background h-9">
                                                                                <SelectValue placeholder="Select department..." />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                {departments.map(d => (
                                                                                    <SelectItem key={d.name} value={d.name}>{d.name}</SelectItem>
                                                                                ))}
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </div>
                                                                    <div className="space-y-1 min-w-[220px] flex-1">
                                                                        <label htmlFor="division-567" className="text-xs font-semibold text-muted-foreground">Division</label>
                                                                        <Input
                                                                            id="division-567"
                                                                            placeholder="e.g. STREET LIGHTING"
                                                                            value={assignForm.division}
                                                                            onChange={e => setAssignForm({ ...assignForm, division: e.target.value })}
                                                                            className="bg-background h-9"
                                                                        />
                                                                    </div>
                                                                    <Button
                                                                        disabled={busy || !assignForm.department || !assignForm.division}
                                                                        onClick={() => post("/api/registry/cost-centres", { voteNo: v.voteNo, department: assignForm.department, division: assignForm.division }, () => {
                                                                            toast(`${v.voteNo} assigned to ${assignForm.department}`, {
                                                                                description: `${v.txns.toLocaleString("en-GB")} issues now carry a cost centre.`,
                                                                                duration: 5000,
                                                                                action: { label: "Undo", onClick: () => remove(`/api/registry/cost-centres?voteNo=${encodeURIComponent(v.voteNo)}`, `Vote ${v.voteNo}`) },
                                                                            });
                                                                            setAssignVote(null);
                                                                            setAssignForm({ department: "", division: "" });
                                                                        })}
                                                                        className="h-9 font-semibold"
                                                                    >
                                                                        Assign
                                                                    </Button>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    )}
                                                </Fragment>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
