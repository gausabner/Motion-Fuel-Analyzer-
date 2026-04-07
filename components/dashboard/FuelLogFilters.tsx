"use client";

import { useState, useEffect } from "react";
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
import { ChevronsUpDown, Check, Search, RotateCcw, Filter, Calendar as CalendarIcon } from "lucide-react";
import { motion } from "framer-motion";
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
import { DateRange } from "react-day-picker";
import { parseISO } from "date-fns";

export function FuelLogFilters({ costCentres = [] }: { costCentres?: { department: string, division: string }[] }) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [vehicleId, setVehicleId] = useState(searchParams.get("vehicleId") || "");
    const [fuelType, setFuelType] = useState(searchParams.get("fuelType") || "all");
    const [department, setDepartment] = useState(searchParams.get("department") || "");
    const [division, setDivision] = useState(searchParams.get("division") || "");
    const [openDept, setOpenDept] = useState(false);
    const [openDiv, setOpenDiv] = useState(false);
    const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
        const from = searchParams.get("from");
        const to = searchParams.get("to");
        if (from && to) return { from: parseISO(from), to: parseISO(to) };
        if (from) return { from: parseISO(from) };
        return undefined;
    });

    const handleApplyFilters = () => {
        const params = new URLSearchParams();
        cacheParamsForReset(params);

        if (vehicleId) params.set("vehicleId", vehicleId);
        if (fuelType && fuelType !== "all") params.set("fuelType", fuelType);
        if (department) params.set("department", department);
        if (division) params.set("division", division);
        if (dateRange?.from) params.set("from", dateRange.from.toISOString());
        if (dateRange?.to) params.set("to", dateRange.to.toISOString());

        router.push(`${window.location.pathname}?${params.toString()}`);
    };

    const cacheParamsForReset = (params: URLSearchParams) => {
        // preserve other params?
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

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="monumental-card mb-6 flex flex-wrap items-end gap-5 shadow-none"
        >
            <div className="flex-1 min-w-[200px] space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1 flex items-center gap-1">
                    <Search className="h-3 w-3" /> Vehicle ID
                </label>
                <Input
                    placeholder="Search Vehicle..."
                    value={vehicleId}
                    onChange={(e) => setVehicleId(e.target.value)}
                    className="bg-background/80 border-input rounded-xl h-11 shadow-sm focus-visible:ring-zinc-950"
                />
            </div>

            <div className="flex-1 min-w-[260px] space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1 flex items-center gap-1">
                    <CalendarIcon className="h-3 w-3" /> Date Range
                </label>
                <DateRangePicker
                    dateRange={dateRange}
                    onDateChange={setDateRange}
                />
            </div>

            <div className="w-[180px] space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Fuel Type</label>
                <Select value={fuelType} onValueChange={setFuelType}>
                    <SelectTrigger className="bg-background/80 border-input rounded-xl h-11 shadow-sm focus:ring-zinc-950">
                        <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="Petrol">Petrol</SelectItem>
                        <SelectItem value="Petrol Unleaded">Petrol Unleaded</SelectItem>
                        <SelectItem value="Diesel">Diesel</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="flex-1 min-w-[200px] space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1 flex items-center gap-1">
                    <Filter className="h-3 w-3" /> Department
                </label>
                <Popover open={openDept} onOpenChange={setOpenDept}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={openDept}
                            className="w-full justify-between bg-background/80 border-input rounded-xl h-11 shadow-sm font-normal relative hover:bg-zinc-50"
                        >
                            <span className="truncate pr-6 text-left block w-full">
                                {department
                                    ? uniqueDepartments.find((d) => d === department) || department
                                    : "Select Dept..."}
                            </span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50 absolute right-2" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[200px] p-0">
                        <Command>
                            <CommandInput placeholder="Search dept..." />
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
                                                // Reset division if it doesn't belong to the new department
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

            <div className="flex-1 min-w-[200px] space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1 flex items-center gap-1">
                    <Filter className="h-3 w-3" /> Division
                </label>
                <Popover open={openDiv} onOpenChange={setOpenDiv}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={openDiv}
                            disabled={!department || availableDivisions.length === 0}
                            className="w-full justify-between bg-background/80 border-input rounded-xl h-11 shadow-sm font-normal relative hover:bg-zinc-50"
                        >
                            <span className="truncate pr-6 text-left block w-full">
                                {division
                                    ? availableDivisions.find((d) => d === division) || division
                                    : (department ? "Select Div..." : "Select Dept First")}
                            </span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50 absolute right-2" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[200px] p-0">
                        <Command>
                            <CommandInput placeholder="Search division..." />
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

            <div className="flex gap-2">
                <Button
                    onClick={handleApplyFilters}
                    className="bg-black text-white font-bold rounded-xl h-11 px-8 shadow-sm hover:bg-zinc-800 transition-all uppercase tracking-wider text-xs"
                >
                    Apply
                </Button>
                <Button
                    variant="outline"
                    onClick={handleReset}
                    className="border-input bg-white rounded-xl h-11 px-4 shadow-sm hover:bg-zinc-50 text-zinc-500"
                >
                    <RotateCcw className="h-4 w-4" />
                </Button>
            </div>
        </motion.div>
    );
}
