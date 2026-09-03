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

type Department = { name: string; voteCount: number };
type CostCentre = { voteNo: string; division: string; department: string };
type FleetUnit = { unitNo: string; description: string | null };
type UnassignedVote = { voteNo: string; txns: number; litres: number; suggestedDepartment: string | null };

export default function RegistryPage() {
    const [departments, setDepartments] = useState<Department[]>([]);
    const [costCentres, setCostCentres] = useState<CostCentre[]>([]);
    const [fleetUnits, setFleetUnits] = useState<FleetUnit[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const [newDept, setNewDept] = useState("");
    const [ccForm, setCcForm] = useState({ department: "", division: "", voteNo: "" });
    const [unitForm, setUnitForm] = useState({ unitNo: "", description: "" });
    const [unitFilter, setUnitFilter] = useState("");

    const [unassigned, setUnassigned] = useState<UnassignedVote[]>([]);
    const [assignVote, setAssignVote] = useState<string | null>(null);
    const [assignForm, setAssignForm] = useState({ department: "", division: "" });

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
        } catch {
            toast.error("Failed to load registry data");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

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
                toast.error(data.error || "Request failed");
            }
        } catch {
            toast.error("Network error");
        } finally {
            setBusy(false);
        }
    };

    const remove = async (url: string, label: string) => {
        setBusy(true);
        try {
            const res = await fetch(url, { method: "DELETE" });
            const data = await res.json();
            if (res.ok) {
                toast.success(`${label} removed`);
                await loadAll();
            } else {
                toast.error(data.error || "Delete failed");
            }
        } catch {
            toast.error("Network error");
        } finally {
            setBusy(false);
        }
    };

    if (loading) return (
        <div className="h-96 flex items-center justify-center">
            <RefreshCcw className="h-8 w-8 animate-spin text-brand-primary" />
        </div>
    );

    const filteredUnits = unitFilter
        ? fleetUnits.filter(u => u.unitNo.toLowerCase().includes(unitFilter.toLowerCase()))
        : fleetUnits;

    return (
        <div className="space-y-8">
            <PageHeader
                title="Registry"
                scope="Manage departments, cost centre vote numbers, and fleet units independently."
            />

            <Tabs value={tab} onValueChange={setTab} className="space-y-6">
                <TabsList className="bg-muted p-1">
                    <TabsTrigger value="costcentres" className="data-[state=active]:bg-background font-bold uppercase text-xs tracking-wider">
                        <Hash className="h-3.5 w-3.5 mr-1.5" /> Vote Numbers ({costCentres.length})
                    </TabsTrigger>
                    <TabsTrigger value="departments" className="data-[state=active]:bg-background font-bold uppercase text-xs tracking-wider">
                        <Building2 className="h-3.5 w-3.5 mr-1.5" /> Departments ({departments.length})
                    </TabsTrigger>
                    <TabsTrigger value="fleet" className="data-[state=active]:bg-background font-bold uppercase text-xs tracking-wider">
                        <Truck className="h-3.5 w-3.5 mr-1.5" /> Fleet Units ({fleetUnits.length})
                    </TabsTrigger>
                    <TabsTrigger value="unassigned" className="data-[state=active]:bg-background font-bold uppercase text-xs tracking-wider">
                        <FileWarning className={`h-3.5 w-3.5 mr-1.5 ${unassigned.length ? 'text-amber-600' : ''}`} />
                        Unassigned votes
                        {unassigned.length > 0 && (
                            <span className="ml-1.5 rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-[10px] leading-none">{unassigned.length}</span>
                        )}
                    </TabsTrigger>
                </TabsList>

                {/* ============ COST CENTRES / VOTE NUMBERS ============ */}
                <TabsContent value="costcentres">
                    <Card className="monumental-card">
                        <CardHeader>
                            <CardTitle>Issue Vote Numbers</CardTitle>
                            <CardDescription>Each vote number belongs to a division within a department. Transactions are matched by vote number.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex flex-wrap items-end gap-3 p-4 bg-muted/40 rounded-md border border-border">
                                <div className="space-y-1 min-w-[260px] flex-1">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Department</label>
                                    <Select value={ccForm.department} onValueChange={v => setCcForm({ ...ccForm, department: v })}>
                                        <SelectTrigger className="bg-background h-10">
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
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Division</label>
                                    <Input
                                        placeholder="e.g. TRAFFIC MANAGEMENT UNIT"
                                        value={ccForm.division}
                                        onChange={e => setCcForm({ ...ccForm, division: e.target.value })}
                                        className="bg-background h-10"
                                    />
                                </div>
                                <div className="space-y-1 min-w-[180px]">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Vote Number</label>
                                    <Input
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
                                    <Plus className="h-4 w-4 mr-1" /> Add Vote
                                </Button>
                            </div>

                            <div className="rounded-sm border border-border max-h-[480px] overflow-y-auto">
                                <Table>
                                    <TableHeader className="bg-muted/50 sticky top-0 z-10">
                                        <TableRow>
                                            <TableHead className="font-bold uppercase tracking-wider text-[10px]">Vote No</TableHead>
                                            <TableHead className="font-bold uppercase tracking-wider text-[10px]">Division</TableHead>
                                            <TableHead className="font-bold uppercase tracking-wider text-[10px]">Department</TableHead>
                                            <TableHead className="w-12"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {costCentres.map(cc => (
                                            <TableRow key={cc.voteNo}>
                                                <TableCell className="font-mono text-xs font-bold">{cc.voteNo}</TableCell>
                                                <TableCell className="text-xs">{cc.division}</TableCell>
                                                <TableCell className="text-xs text-muted-foreground">{cc.department}</TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="ghost" size="sm" disabled={busy}
                                                        onClick={() => remove(`/api/registry/cost-centres?voteNo=${encodeURIComponent(cc.voteNo)}`, `Vote ${cc.voteNo}`)}
                                                        className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
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
                        <CardContent className="space-y-6">
                            <div className="flex items-end gap-3 p-4 bg-muted/40 rounded-md border border-border">
                                <div className="space-y-1 flex-1">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Department Name</label>
                                    <Input
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
                                    <Plus className="h-4 w-4 mr-1" /> Add Department
                                </Button>
                            </div>

                            <div className="rounded-sm border border-border">
                                <Table>
                                    <TableHeader className="bg-muted/50">
                                        <TableRow>
                                            <TableHead className="font-bold uppercase tracking-wider text-[10px]">Department</TableHead>
                                            <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">Vote Numbers</TableHead>
                                            <TableHead className="w-12"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {departments.map(d => (
                                            <TableRow key={d.name}>
                                                <TableCell className="text-xs font-bold">{d.name}</TableCell>
                                                <TableCell className="text-xs text-right font-mono">{d.voteCount}</TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="ghost" size="sm" disabled={busy}
                                                        onClick={() => remove(`/api/registry/departments?name=${encodeURIComponent(d.name)}`, d.name)}
                                                        className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
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
                                    className="font-bold uppercase text-xs tracking-wider"
                                >
                                    <DownloadCloud className="h-4 w-4 mr-1.5" /> Sync from Transactions
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex flex-wrap items-end gap-3 p-4 bg-muted/40 rounded-md border border-border">
                                <div className="space-y-1 min-w-[160px]">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Unit Number</label>
                                    <Input
                                        placeholder="e.g. WM2711"
                                        value={unitForm.unitNo}
                                        onChange={e => setUnitForm({ ...unitForm, unitNo: e.target.value })}
                                        className="bg-background h-10 font-mono"
                                    />
                                </div>
                                <div className="space-y-1 flex-1 min-w-[200px]">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Description (optional)</label>
                                    <Input
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

                            <div className="rounded-sm border border-border max-h-[480px] overflow-y-auto">
                                <Table>
                                    <TableHeader className="bg-muted/50 sticky top-0 z-10">
                                        <TableRow>
                                            <TableHead className="font-bold uppercase tracking-wider text-[10px]">Unit No</TableHead>
                                            <TableHead className="font-bold uppercase tracking-wider text-[10px]">Description</TableHead>
                                            <TableHead className="w-12"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredUnits.slice(0, 200).map(u => (
                                            <TableRow key={u.unitNo}>
                                                <TableCell className="font-mono text-xs font-bold">{u.unitNo}</TableCell>
                                                <TableCell className="text-xs text-muted-foreground">{u.description || '—'}</TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="ghost" size="sm" disabled={busy}
                                                        onClick={() => remove(`/api/registry/fleet-units?unitNo=${encodeURIComponent(u.unitNo)}`, `Unit ${u.unitNo}`)}
                                                        className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
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
                                Fuel-issue votes that don't yet match a cost centre, ranked by transaction volume.
                                Assign each to a department and division — affected transactions re-resolve immediately.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {unassigned.length === 0 ? (
                                <div className="flex flex-col items-center justify-center text-center py-12">
                                    <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center mb-4">
                                        <CheckCircle2 className="w-6 h-6 text-emerald-700" />
                                    </div>
                                    <p className="text-sm font-semibold text-foreground">Every vote is assigned</p>
                                    <p className="text-xs text-muted-foreground mt-1">All fuel-issue transactions resolve to a department.</p>
                                </div>
                            ) : (
                                <div className="rounded-sm border border-border max-h-[560px] overflow-y-auto">
                                    <Table>
                                        <TableHeader className="bg-muted/50 sticky top-0 z-10">
                                            <TableRow>
                                                <TableHead className="font-bold uppercase tracking-wider text-[10px]">Vote code</TableHead>
                                                <TableHead className="font-bold uppercase tracking-wider text-[10px]">Suggested department</TableHead>
                                                <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">Txns</TableHead>
                                                <TableHead className="font-bold uppercase tracking-wider text-[10px] text-right">Litres</TableHead>
                                                <TableHead className="w-24"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {unassigned.map((v) => (
                                                <Fragment key={v.voteNo}>
                                                    <TableRow>
                                                        <TableCell className="font-mono text-xs font-bold">{v.voteNo}</TableCell>
                                                        <TableCell className="text-xs">
                                                            {v.suggestedDepartment
                                                                ? <span className="text-primary">{v.suggestedDepartment}</span>
                                                                : <span className="text-muted-foreground">No suggestion — pick manually</span>}
                                                        </TableCell>
                                                        <TableCell className="text-xs text-right font-mono">{v.txns}</TableCell>
                                                        <TableCell className="text-xs text-right font-mono font-bold">{v.litres.toLocaleString()}</TableCell>
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
                                                            <TableCell colSpan={5} className="py-3">
                                                                <div className="flex flex-wrap items-end gap-3">
                                                                    <div className="space-y-1 min-w-[240px] flex-1">
                                                                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Department</label>
                                                                        <Select value={assignForm.department} onValueChange={val => setAssignForm({ ...assignForm, department: val })}>
                                                                            <SelectTrigger className="bg-background h-9">
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
                                                                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Division</label>
                                                                        <Input
                                                                            placeholder="e.g. STREET LIGHTING"
                                                                            value={assignForm.division}
                                                                            onChange={e => setAssignForm({ ...assignForm, division: e.target.value })}
                                                                            className="bg-background h-9"
                                                                        />
                                                                    </div>
                                                                    <Button
                                                                        disabled={busy || !assignForm.department || !assignForm.division}
                                                                        onClick={() => post("/api/registry/cost-centres", { voteNo: v.voteNo, department: assignForm.department, division: assignForm.division }, () => {
                                                                            toast.success(`${v.voteNo} assigned — ${v.txns} transactions re-resolved`);
                                                                            setAssignVote(null);
                                                                            setAssignForm({ department: "", division: "" });
                                                                        })}
                                                                        className="h-9 font-semibold"
                                                                    >
                                                                        Save &amp; re-resolve
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
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
