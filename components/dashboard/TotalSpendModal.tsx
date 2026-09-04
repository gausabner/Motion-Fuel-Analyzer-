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
import { Wallet } from "lucide-react";

interface SpendData {
    date: string;
    value: number;
}

interface TotalSpendModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    data: SpendData[];
    currencySymbol: string;
}

export function TotalSpendModal({ open, onOpenChange, data, currencySymbol }: TotalSpendModalProps) {

    // Custom Tooltip
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className="bg-popover border border-border p-3 rounded-lg shadow-xl text-xs">
                    <p className="font-bold text-foreground mb-1">{format(new Date(data.date), "MMM dd, yyyy")}</p>
                    <p className="text-muted-foreground flex items-center justify-between gap-4">
                        <span>Daily Spend:</span>
                        <span className="font-mono text-foreground font-bold">{currencySymbol}{data.value.toLocaleString()}</span>
                    </p>
                </div>
            );
        }
        return null;
    };

    // Stats
    const totalSpend = data.reduce((acc, curr) => acc + curr.value, 0);
    const maxSpend = Math.max(...data.map(d => d.value));
    const avgSpend = totalSpend / (data.length || 1);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="!w-[70vw] !max-w-[70vw] rounded-3xl p-6 bg-card/95 backdrop-blur-xl border-white/20">
                <DialogHeader>
                    <div className="flex items-center gap-3 mb-2">
                        <div className={`p-2 rounded-xl bg-accent`}>
                            <Wallet className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <DialogTitle className="text-2xl font-bold text-foreground">
                                Financial Velocity Analysis
                            </DialogTitle>
                            <DialogDescription className="text-muted-foreground">
                                Detailed daily expenditure breakdown and variance analysis.
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mt-4">
                    {/* Main Chart Area */}
                    <div className="col-span-1 lg:col-span-3 h-[200px] w-full border border-border rounded-xl p-3 bg-muted/40 flex flex-col">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                            Daily Spend Distribution
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
                                        name="Spend"
                                        unit=""
                                        tick={{ fontSize: 9, fill: '#71717A' }}
                                        tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val.toFixed(0)}
                                        axisLine={false}
                                        tickLine={false}
                                        dx={-5}
                                        domain={['0', 'auto']}
                                    />
                                    <Tooltip
                                        cursor={{ strokeDasharray: '3 3' }}
                                        content={<CustomTooltip />}
                                        wrapperStyle={{ outline: 'none' }}
                                    />
                                    <Scatter name="Daily Spend" data={data} fill="#2563EB">
                                        {data.map((entry, index) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={entry.value > avgSpend ? "#000000" : "#A1A1AA"} // Black for high spend, Grey for low
                                                fillOpacity={entry.value > avgSpend ? 1 : 0.5}
                                            />
                                        ))}
                                    </Scatter>
                                </ScatterChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Stats Side Panel */}
                    <div className="flex flex-col gap-3">
                        <div className="p-3 rounded-xl border border-border bg-card shadow-sm min-w-0">
                            <p className="text-[9px] font-bold uppercase text-muted-foreground truncate">Total Period Spend</p>
                            <p className="text-lg font-black text-foreground mt-1 truncate" title={`${currencySymbol}${totalSpend.toLocaleString()}`}>
                                {currencySymbol}{totalSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </p>
                        </div>
                        <div className="p-3 rounded-xl border border-border bg-card shadow-sm min-w-0">
                            <p className="text-[9px] font-bold uppercase text-muted-foreground truncate">Peak Daily Spend</p>
                            <p className="text-lg font-black text-foreground mt-1 truncate" title={`${currencySymbol}${maxSpend.toLocaleString()}`}>
                                {currencySymbol}{maxSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </p>
                        </div>
                        <div className="p-3 rounded-xl border border-border bg-card shadow-sm min-w-0">
                            <p className="text-[9px] font-bold uppercase text-muted-foreground truncate">Average Daily</p>
                            <p className="text-lg font-black text-foreground mt-1 truncate" title={`${currencySymbol}${avgSpend.toLocaleString()}`}>
                                {currencySymbol}{avgSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </p>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
