"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DateRangePicker } from "@/components/dashboard/DateRangePicker";
import { DateRange } from "react-day-picker";
import { parseISO } from "date-fns";
import { ArrowRight, RotateCcw } from "lucide-react";

type CostCentre = { department: string; division: string };

const DIMENSIONS = [
    { value: "department", label: "By department" },
    { value: "division", label: "By division" },
    { value: "fleetUnit", label: "By fleet unit" },
    { value: "fuelType", label: "By fuel type" },
    { value: "total", label: "Fleet total" },
];

function rangeFrom(params: URLSearchParams, fromKey: string, toKey: string, fallback: DateRange): DateRange {
    const f = params.get(fromKey), t = params.get(toKey);
    if (f && t) return { from: parseISO(f), to: parseISO(t) };
    return fallback;
}

export function ComparisonControls({ costCentres }: { costCentres: CostCentre[] }) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const now = new Date();
    const y = now.getFullYear();
    const defA: DateRange = { from: new Date(y - 1, 0, 1), to: new Date(y - 1, 11, 31) };
    const defB: DateRange = { from: new Date(y, 0, 1), to: new Date(y, 11, 31) };

    const [dimension, setDimension] = useState(searchParams.get("dim") || "department");
    const [periodA, setPeriodA] = useState<DateRange | undefined>(rangeFrom(searchParams, "aFrom", "aTo", defA));
    const [periodB, setPeriodB] = useState<DateRange | undefined>(rangeFrom(searchParams, "bFrom", "bTo", defB));
    const [fuelType, setFuelType] = useState(searchParams.get("fuelType") || "all");
    const [department, setDepartment] = useState(searchParams.get("department") || "all");
    const [division, setDivision] = useState(searchParams.get("division") || "all");
    const [vehicleId, setVehicleId] = useState(searchParams.get("vehicleId") || "");

    const departments = Array.from(new Set(costCentres.map(c => c.department).filter(Boolean)));
    const divisions = department !== "all"
        ? Array.from(new Set(costCentres.filter(c => c.department === department).map(c => c.division).filter(Boolean)))
        : Array.from(new Set(costCentres.map(c => c.division).filter(Boolean)));

    // Quick year presets: shift both periods by calendar or financial year.
    const applyYearPreset = (mode: "cy" | "fy") => {
        if (mode === "cy") {
            setPeriodA({ from: new Date(y - 1, 0, 1), to: new Date(y - 1, 11, 31) });
            setPeriodB({ from: new Date(y, 0, 1), to: new Date(y, 11, 31) });
        } else {
            // Financial year Apr–Mar. "This FY" started Apr of (current year if month>=Apr else prev year).
            const fyStartYear = now.getMonth() >= 3 ? y : y - 1;
            setPeriodA({ from: new Date(fyStartYear - 1, 3, 1), to: new Date(fyStartYear, 2, 31) });
            setPeriodB({ from: new Date(fyStartYear, 3, 1), to: new Date(fyStartYear + 1, 2, 31) });
        }
    };

    const apply = () => {
        const p = new URLSearchParams();
        p.set("dim", dimension);
        if (periodA?.from) p.set("aFrom", periodA.from.toISOString());
        if (periodA?.to) p.set("aTo", periodA.to.toISOString());
        if (periodB?.from) p.set("bFrom", periodB.from.toISOString());
        if (periodB?.to) p.set("bTo", periodB.to.toISOString());
        if (fuelType !== "all") p.set("fuelType", fuelType);
        if (department !== "all") p.set("department", department);
        if (division !== "all") p.set("division", division);
        if (vehicleId.trim()) p.set("vehicleId", vehicleId.trim());
        router.push(`/dashboard/compare?${p.toString()}`);
    };

    const reset = () => {
        setDimension("department");
        setPeriodA(defA); setPeriodB(defB);
        setFuelType("all"); setDepartment("all"); setDivision("all"); setVehicleId("");
        router.push("/dashboard/compare");
    };

    return (
        <div className="monumental-card space-y-4 shadow-none p-4">
            {/* Row 1: dimension + periods */}
            <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1.5 w-[180px]">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Compare</label>
                    <Select value={dimension} onValueChange={setDimension}>
                        <SelectTrigger className="bg-background h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {DIMENSIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Period A</label>
                    <DateRangePicker dateRange={periodA} onDateChange={setPeriodA} />
                </div>

                <div className="flex items-center h-10 text-muted-foreground pb-0.5">
                    <ArrowRight className="h-4 w-4" />
                </div>

                <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Period B</label>
                    <DateRangePicker dateRange={periodB} onDateChange={setPeriodB} />
                </div>

                <div className="flex items-center gap-1.5 pb-0.5">
                    <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => applyYearPreset("cy")}>Calendar years</Button>
                    <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => applyYearPreset("fy")}>Financial years</Button>
                </div>
            </div>

            {/* Row 2: optional filters + actions */}
            <div className="flex flex-wrap items-end gap-3 pt-4 border-t border-border">
                <div className="space-y-1.5 w-[150px]">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Fuel type</label>
                    <Select value={fuelType} onValueChange={setFuelType}>
                        <SelectTrigger className="bg-background h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All types</SelectItem>
                            <SelectItem value="Petrol">Petrol</SelectItem>
                            <SelectItem value="Diesel">Diesel</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5 min-w-[200px] flex-1 max-w-xs">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Department</label>
                    <Select value={department} onValueChange={(v) => { setDepartment(v); setDivision("all"); }}>
                        <SelectTrigger className="bg-background h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All departments</SelectItem>
                            {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5 min-w-[180px] flex-1 max-w-xs">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Division</label>
                    <Select value={division} onValueChange={setDivision}>
                        <SelectTrigger className="bg-background h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All divisions</SelectItem>
                            {divisions.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5 w-[150px]">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Fleet unit</label>
                    <Input placeholder="e.g. WM2711" value={vehicleId} onChange={e => setVehicleId(e.target.value)} className="bg-background h-9 font-mono" />
                </div>

                <div className="flex gap-2 ml-auto">
                    <Button onClick={apply} className="h-9 px-6 font-semibold">Compare</Button>
                    <Button variant="outline" onClick={reset} aria-label="Reset comparison" className="h-9 px-3 text-muted-foreground">
                        <RotateCcw className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
