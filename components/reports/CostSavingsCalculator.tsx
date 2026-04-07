"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, ArrowRight, TrendingDown, TrendingUp, Calculator } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { calculateSavingsAction } from "@/app/actions/calculator";
import { toast } from "sonner";
import { motion } from "framer-motion";

export function CostSavingsCalculator() {
    const [dateA, setDateA] = useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined });
    const [dateB, setDateB] = useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined });
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const handleCompare = async () => {
        if (!dateA.from || !dateA.to || !dateB.from || !dateB.to) {
            toast.error("Please select start and end dates for both ranges.");
            return;
        }

        setLoading(true);
        try {
            const data = await calculateSavingsAction(
                { from: dateA.from.toISOString(), to: dateA.to.toISOString() },
                { from: dateB.from.toISOString(), to: dateB.to.toISOString() }
            );

            if (data.error) {
                toast.error(data.error);
            } else {
                setResult(data);
                toast.success("Calculation complete");
            }
        } catch (e) {
            toast.error("Failed to calculate savings");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="grid lg:grid-cols-3 gap-6">
            {/* Input Column */}
            <Card className="monumental-card lg:col-span-1">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Calculator className="h-5 w-5 text-black" />
                        Compare Periods
                    </CardTitle>
                    <CardDescription>Select two date ranges to analyze variance.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Range A */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Baseline (Period A)</label>
                        <DatePickerWithRange date={dateA} setDate={setDateA} />
                    </div>

                    {/* Range B */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Comparison (Period B)</label>
                        <DatePickerWithRange date={dateB} setDate={setDateB} />
                    </div>

                    <Button
                        onClick={handleCompare}
                        disabled={loading}
                        className="w-full h-12 bg-[#FDE047] hover:bg-[#FACC15] text-black font-bold uppercase tracking-wider rounded-none"
                    >
                        {loading ? "Calculating..." : "Calculate Variance"}
                    </Button>
                </CardContent>
            </Card>

            {/* Results Column */}
            <div className="lg:col-span-2 space-y-6">
                {result ? (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="grid gap-6"
                    >
                        {/* Summary Cards */}
                        <div className="grid md:grid-cols-2 gap-6">
                            <Card className="monumental-card">
                                <CardHeader className="pb-2 bg-zinc-50 border-b border-zinc-100">
                                    <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">Period A Spend</div>
                                </CardHeader>
                                <CardContent className="pt-6 space-y-4">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-zinc-500 font-medium">Petrol ({result.statsA.petrolVolume.toFixed(0)} L)</span>
                                        <span className="font-bold">${result.statsA.petrolCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-zinc-500 font-medium">Diesel ({result.statsA.dieselVolume.toFixed(0)} L)</span>
                                        <span className="font-bold">${result.statsA.dieselCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="pt-4 border-t border-dashed border-zinc-200">
                                        <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Total Cost</div>
                                        <div className="text-3xl font-black text-zinc-900">
                                            ${result.statsA.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="monumental-card">
                                <CardHeader className="pb-2 bg-zinc-50 border-b border-zinc-100">
                                    <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">Period B Spend</div>
                                </CardHeader>
                                <CardContent className="pt-6 space-y-4">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-zinc-500 font-medium">Petrol ({result.statsB.petrolVolume.toFixed(0)} L)</span>
                                        <span className="font-bold">${result.statsB.petrolCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-zinc-500 font-medium">Diesel ({result.statsB.dieselVolume.toFixed(0)} L)</span>
                                        <span className="font-bold">${result.statsB.dieselCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="pt-4 border-t border-dashed border-zinc-200">
                                        <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Total Cost</div>
                                        <div className="text-3xl font-black text-zinc-900">
                                            ${result.statsB.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Main Variance Card */}
                        <Card className={cn(
                            "monumental-card border-l-8",
                            result.isSaving ? "border-l-emerald-500" : "border-l-rose-500"
                        )}>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-3 text-xl">
                                    {result.isSaving ? (
                                        <TrendingDown className="h-6 w-6 text-emerald-500" />
                                    ) : (
                                        <TrendingUp className="h-6 w-6 text-rose-500" />
                                    )}
                                    {result.isSaving ? "Estimated Savings" : "Cost Increase"}
                                </CardTitle>
                                <CardDescription>Difference between Period A and Period B</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className={cn(
                                    "text-5xl md:text-6xl font-black tracking-tighter",
                                    result.isSaving ? "text-emerald-500" : "text-rose-500"
                                )}>
                                    {result.isSaving ? "-" : "+"}
                                    ${Math.abs(result.savings).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                <p className="text-zinc-500 font-medium mt-4 max-w-lg">
                                    {result.isSaving
                                        ? "Great job! Your fleet is spending less in the comparison period."
                                        : "Alert: Spending has increased in the comparison period. Check for rising fuel prices or increased consumption."}
                                </p>
                            </CardContent>
                        </Card>
                    </motion.div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center p-12 bg-zinc-50 border border-dashed border-zinc-200 rounded-lg text-center">
                        <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mb-4 text-zinc-400">
                            <Calculator className="h-8 w-8" />
                        </div>
                        <h3 className="text-lg font-bold text-zinc-900">No Calculation Yet</h3>
                        <p className="text-zinc-500 max-w-sm mt-2">
                            Select two date ranges on the left and click Calculate to see your fleet's financial variance.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

function DatePickerWithRange({
    date,
    setDate
}: {
    date: { from: Date | undefined; to: Date | undefined };
    setDate: any;
}) {
    return (
        <div className="grid gap-2">
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        id="date"
                        variant={"outline"}
                        className={cn(
                            "w-full justify-start text-left font-normal bg-white border-zinc-200 h-10 rounded-none",
                            !date && "text-muted-foreground"
                        )}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date?.from ? (
                            date.to ? (
                                <>
                                    {format(date.from, "LLL dd, y")} -{" "}
                                    {format(date.to, "LLL dd, y")}
                                </>
                            ) : (
                                format(date.from, "LLL dd, y")
                            )
                        ) : (
                            <span>Pick a date range</span>
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start" side="bottom" avoidCollisions={true}>
                    <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={date?.from}
                        selected={date}
                        onSelect={setDate}
                        numberOfMonths={1}
                    />
                </PopoverContent>
            </Popover>
        </div>
    );
}
