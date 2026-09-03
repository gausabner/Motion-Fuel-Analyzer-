"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ChevronsUpDown, Check, Search, RotateCcw, SlidersHorizontal, Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { DateRangePicker } from "./DateRangePicker";
import { DateRangePresets } from "./DateRangePresets";
import { DateRange } from "react-day-picker";
import { parseISO } from "date-fns";

export function FuelLogFilters({
    costCentres = [],
    hideVehicle = false,
    hideCostCentres = false,
    hideFuelType = false,
}: {
    costCentres?: { department: string, division: string }[];
    /** Hide the vehicle/unit search (e.g. FRE receipts have no vehicle). */
    hideVehicle?: boolean;
    /** Hide the department + division combos (e.g. FRE has no cost-centre attribution). */
    hideCostCentres?: boolean;
    /** Hide the fuel-type select (e.g. the Fuel Report already splits petrol/diesel per table). */
    hideFuelType?: boolean;
}) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [vehicleId, setVehicleId] = useState(searchParams.get("vehicleId") || "");
    const [fuelType, setFuelType] = useState(searchParams.get("fuelType") || "all");
    const [department, setDepartment] = useState(searchParams.get("department") || "");
    const [division, setDivision] = useState(searchParams.get("division") || "");
    const [openDept, setOpenDept] = useState(false);
    const [openDiv, setOpenDiv] = useState(false);
    // Advanced section starts open when one of its filters is active
    const [showAdvanced, setShowAdvanced] = useState(
        Boolean(searchParams.get("department") || searchParams.get("division") || (!hideFuelType && searchParams.get("fuelType") && searchParams.get("fuelType") !== "all"))
    );
    const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
        const from = searchParams.get("from");
        const to = searchParams.get("to");
        if (from && to) return { from: parseISO(from), to: parseISO(to) };
        if (from) return { from: parseISO(from) };
        return undefined;
    });

    const handleApplyFilters = () => {
        const params = new URLSearchParams();
        if (vehicleId) params.set("vehicleId", vehicleId);
        if (fuelType && fuelType !== "all") params.set("fuelType", fuelType);
        if (department) params.set("department", department);
        if (division) params.set("division", division);
        if (dateRange?.from) params.set("from", dateRange.from.toISOString());
        if (dateRange?.to) params.set("to", dateRange.to.toISOString());

        router.push(`${window.location.pathname}?${params.toString()}`);
    };

    const handleReset = () => {
        setVehicleId("");
        setFuelType("all");
        setDepartment("");
        setDivision("");
        setDateRange(undefined);
        router.push(window.location.pathname);
    };

    const uniqueDepartments = Array.from(new Set(costCentres.map((c) => c.department).filter(Boolean)));
    const availableDivisions = department
        ? Array.from(new Set(costCentres.filter((c) => c.department === department).map((c) => c.division).filter(Boolean)))
        : [];
    const advancedCount = [department, division, !hideFuelType && fuelType !== "all" ? fuelType : ""].filter(Boolean).length;

    return (
        <div className="monumental-card mb-6 space-y-4 shadow-none p-4">
            {/* Primary row: presets, custom range, vehicle search, actions */}
            <div className="flex flex-wrap items-center gap-3">
                <DateRangePresets />
                <div className="h-6 w-px bg-border hidden sm:block" />
                <DateRangePicker
                    dateRange={dateRange}
                    onDateChange={setDateRange}
                />
                {!hideVehicle && (
                    <div className="relative min-w-[180px] flex-1 max-w-xs">
                        <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Vehicle or unit no…"
                            value={vehicleId}
                            onChange={(e) => setVehicleId(e.target.value)}
                            className="bg-background h-9 pl-8"
                        />
                    </div>
                )}
                <Button
                    variant="outline"
                    onClick={() => setShowAdvanced(v => !v)}
                    className={cn("h-9 px-3.5 text-xs", advancedCount > 0 && "border-primary/50 text-primary")}
                >
                    <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
                    All filters{advancedCount > 0 ? ` (${advancedCount})` : ""}
                </Button>
                <div className="flex gap-2 ml-auto">
                    <Button onClick={handleApplyFilters} className="h-9 px-6">
                        Apply
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handleReset}
                        aria-label="Reset filters"
                        className="h-9 px-3 text-muted-foreground"
                    >
                        <RotateCcw className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Advanced row — hidden until requested */}
            {showAdvanced && (
                <div className="flex flex-wrap items-end gap-4 pt-4 border-t border-border">
                    {!hideFuelType && (
                    <div className="w-[170px] space-y-1.5">
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ml-1">Fuel type</label>
                        <Select value={fuelType} onValueChange={setFuelType}>
                            <SelectTrigger className="bg-background h-9">
                                <SelectValue placeholder="All types" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All types</SelectItem>
                                <SelectItem value="Petrol">Petrol</SelectItem>
                                <SelectItem value="Petrol Unleaded">Petrol Unleaded</SelectItem>
                                <SelectItem value="Diesel">Diesel</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    )}

                    {!hideCostCentres && (
                    <div className="flex-1 min-w-[200px] max-w-sm space-y-1.5" key="dept">
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ml-1">Department</label>
                        <Popover open={openDept} onOpenChange={setOpenDept}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={openDept}
                                    className="w-full justify-between bg-background h-9 font-normal relative"
                                >
                                    <span className="truncate pr-6 text-left block w-full">
                                        {department || "All departments"}
                                    </span>
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50 absolute right-2" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[260px] p-0">
                                <Command>
                                    <CommandInput placeholder="Search department…" />
                                    <CommandList>
                                        <CommandEmpty>No department found.</CommandEmpty>
                                        <CommandGroup>
                                            {uniqueDepartments.map((dept) => (
                                                <CommandItem
                                                    key={dept}
                                                    value={dept}
                                                    className="text-[0.7rem] py-2 cursor-pointer"
                                                    onSelect={(currentValue) => {
                                                        const newDept = currentValue === department ? "" : currentValue;
                                                        setDepartment(newDept);
                                                        if (newDept !== department) {
                                                            setDivision("");
                                                        }
                                                        setOpenDept(false);
                                                    }}
                                                >
                                                    <Check
                                                        className={cn(
                                                            "mr-2 h-3 w-3 shrink-0",
                                                            department === dept ? "opacity-100" : "opacity-0"
                                                        )}
                                                    />
                                                    {dept}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>
                    )}

                    {/* Division appears only once a department is chosen */}
                    {!hideCostCentres && department && availableDivisions.length > 0 && (
                        <div className="flex-1 min-w-[200px] max-w-sm space-y-1.5">
                            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ml-1">Division</label>
                            <Popover open={openDiv} onOpenChange={setOpenDiv}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        aria-expanded={openDiv}
                                        className="w-full justify-between bg-background h-9 font-normal relative"
                                    >
                                        <span className="truncate pr-6 text-left block w-full">
                                            {division || "All divisions"}
                                        </span>
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50 absolute right-2" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[260px] p-0">
                                    <Command>
                                        <CommandInput placeholder="Search division…" />
                                        <CommandList>
                                            <CommandEmpty>No divisions found.</CommandEmpty>
                                            <CommandGroup>
                                                {availableDivisions.map((div) => (
                                                    <CommandItem
                                                        key={div}
                                                        value={div}
                                                        className="text-[0.7rem] py-2 cursor-pointer"
                                                        onSelect={(currentValue) => {
                                                            setDivision(currentValue === division ? "" : currentValue);
                                                            setOpenDiv(false);
                                                        }}
                                                    >
                                                        <Check
                                                            className={cn(
                                                                "mr-2 h-3 w-3 shrink-0",
                                                                division === div ? "opacity-100" : "opacity-0"
                                                            )}
                                                        />
                                                        {div}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
