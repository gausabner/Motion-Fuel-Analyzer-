"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";
import { DateRangePicker } from "@/components/dashboard/DateRangePicker";
import { DateRange } from "react-day-picker";
import { parseISO } from "date-fns";

export function ReportsFilters() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
        const from = searchParams.get("from");
        const to = searchParams.get("to");
        if (from && to) return { from: parseISO(from), to: parseISO(to) };
        if (from) return { from: parseISO(from) };
        return undefined;
    });

    const handleApplyFilters = () => {
        const params = new URLSearchParams();
        if (dateRange?.from) params.set("from", dateRange.from.toISOString());
        if (dateRange?.to) params.set("to", dateRange.to.toISOString());

        router.push(`${window.location.pathname}?${params.toString()}`);
    };

    const handleReset = () => {
        setDateRange(undefined);
        router.push(window.location.pathname);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="monumental-card mb-6 flex flex-wrap items-end gap-5 shadow-none p-4"
        >
            <div className="flex-1 min-w-[260px] space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1 flex items-center gap-1">
                    <CalendarIcon className="h-3 w-3" /> Report Date Range
                </label>
                <DateRangePicker
                    dateRange={dateRange}
                    onDateChange={setDateRange}
                />
            </div>

            <div className="flex gap-2">
                <Button
                    onClick={handleApplyFilters}
                    className="bg-brand-primary text-primary-foreground font-bold rounded-sm px-6 shadow-none"
                >
                    Apply Range
                </Button>
                <Button
                    variant="outline"
                    onClick={handleReset}
                    className="border-input bg-background rounded-sm px-4"
                >
                    <RotateCcw className="h-4 w-4" />
                </Button>
            </div>
        </motion.div>
    );
}
