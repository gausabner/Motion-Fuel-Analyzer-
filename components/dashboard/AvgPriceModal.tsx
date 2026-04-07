"use client";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    ScatterChart,
    Scatter,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from "recharts";
import { format } from "date-fns";

interface AvgPriceData {
    date: string;
    value: number;
}

interface AvgPriceModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    data: AvgPriceData[];
    currencySymbol: string;
}

export function AvgPriceModal({ open, onOpenChange, data, currencySymbol }: AvgPriceModalProps) {

    // Custom Tooltip
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className="bg-popover border border-border p-3 rounded-lg shadow-xl text-xs">
                    <p className="font-bold text-foreground mb-1">{format(new Date(data.date), "MMM dd, yyyy")}</p>
                    <p className="text-muted-foreground flex items-center justify-between gap-4">
                        <span>Avg Price:</span>
                        <span className="font-mono text-foreground font-bold">{currencySymbol}{data.value.toFixed(2)} /L</span>
                    </p>
                </div>
            );
        }
        return null;
    };

    // Calculate generic stats for the side panel
    const maxPrice = Math.max(...data.map(d => d.value));
    const minPrice = Math.min(...data.map(d => d.value));
    const avgTotal = data.reduce((acc, curr) => acc + curr.value, 0) / (data.length || 1);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="!w-[70vw] !max-w-[70vw] rounded-3xl p-6 bg-white/95 backdrop-blur-xl border-white/20">
                <DialogHeader>
                    <div className="flex items-center gap-3 mb-2">
                        <div className={`p-2 rounded-xl bg-black/5`}>
                            <span className="font-bold text-xl px-1">$</span>
                        </div>
                        <div>
                            <DialogTitle className="text-2xl font-bold text-foreground">
                                Daily Price Analysis
                            </DialogTitle>
                            <DialogDescription className="text-muted-foreground">
                                Scatter analysis of daily average fuel costs (Total Cost / Total Volume).
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mt-4">
                    {/* Main Chart Area */}
                    <div className="col-span-1 lg:col-span-3 h-[200px] w-full border border-zinc-100 rounded-xl p-3 bg-zinc-50/50 flex flex-col">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">
                            Price Scatter Distribution
                        </h3>
                        <div className="flex-1 w-full min-h-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <ScatterChart margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                                    <XAxis
                                        dataKey="date"
                                        name="Date"
                                        tick={{ fontSize: 9, fill: '#71717A' }}
                                        tickFormatter={(val) => format(new Date(val), "MMM dd")}
                                        axisLine={false}
                                        tickLine={false}
                                        dy={5}
                                        domain={['auto', 'auto']}
                                    />
                                    <YAxis
                                        type="number"
                                        dataKey="value"
                                        name="Price"
                                        unit=""
                                        tick={{ fontSize: 9, fill: '#71717A' }}
                                        tickFormatter={(val) => val.toFixed(2)}
                                        axisLine={false}
                                        tickLine={false}
                                        dx={-5}
                                        domain={['dataMin - 1', 'dataMax + 1']}
                                    />
                                    <Tooltip
                                        cursor={{ strokeDasharray: '3 3' }}
                                        content={<CustomTooltip />}
                                        wrapperStyle={{ outline: 'none' }}
                                    />
                                    <Scatter name="Daily Price" data={data} fill="#000000">
                                        {data.map((entry, index) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={entry.value > avgTotal ? "#EF4444" : "#10B981"} // Red if above avg, Green if below/equal
                                                fillOpacity={0.6}
                                            />
                                        ))}
                                    </Scatter>
                                </ScatterChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Stats Side Panel */}
                    <div className="flex flex-col gap-3">
                        <div className="p-3 rounded-xl border border-zinc-100 bg-white shadow-sm min-w-0">
                            <p className="text-[9px] font-bold uppercase text-zinc-400 truncate">Highest Recorded</p>
                            <p className="text-lg font-black text-foreground mt-1 truncate" title={`${currencySymbol}${maxPrice.toFixed(2)}`}>
                                {currencySymbol}{maxPrice.toFixed(2)}
                            </p>
                        </div>
                        <div className="p-3 rounded-xl border border-zinc-100 bg-white shadow-sm min-w-0">
                            <p className="text-[9px] font-bold uppercase text-zinc-400 truncate">Lowest Recorded</p>
                            <p className="text-lg font-black text-foreground mt-1 truncate" title={`${currencySymbol}${minPrice.toFixed(2)}`}>
                                {currencySymbol}{minPrice.toFixed(2)}
                            </p>
                        </div>
                        <div className="p-3 rounded-xl border border-zinc-100 bg-white shadow-sm min-w-0">
                            <p className="text-[9px] font-bold uppercase text-zinc-400 truncate">Period Average</p>
                            <p className="text-lg font-black text-foreground mt-1 truncate" title={`${currencySymbol}${avgTotal.toFixed(2)}`}>
                                {currencySymbol}{avgTotal.toFixed(2)}
                            </p>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
