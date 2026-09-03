"use client";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import {
    ScatterChart,
    Scatter,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell
} from "recharts";
import { Droplets } from "lucide-react";

interface TotalVolumeModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    data: any[]; // Expecting daily data with { date, totalVol }
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-card/95 backdrop-blur-sm border border-border p-3 rounded-xl shadow-xl">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                    {format(new Date(payload[0].payload.date), "MMM dd, yyyy")}
                </p>
                <p className="text-sm font-black text-foreground">
                    {payload[0].payload.totalVol.toLocaleString()} L
                </p>
            </div>
        );
    }
    return null;
};

export function TotalVolumeModal({ open, onOpenChange, data }: TotalVolumeModalProps) {
    if (!data || data.length === 0) return null;

    // Calculate stats
    const totalVolume = data.reduce((acc, curr) => acc + (curr.totalVol || 0), 0);
    const maxVolume = Math.max(...data.map(d => d.totalVol || 0));
    const avgVolume = totalVolume / data.length;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="!w-[70vw] !max-w-[70vw] rounded-3xl p-6 bg-card/95 backdrop-blur-xl border-white/20">
                <DialogHeader>
                    <div className="flex items-center gap-3 mb-2">
                        <div className={`p-2 rounded-xl bg-accent`}>
                            <Droplets className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <DialogTitle className="text-2xl font-bold text-foreground">
                                Total Volume Analysis
                            </DialogTitle>
                            <DialogDescription className="text-muted-foreground">
                                Daily fuel consumption volume analysis.
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mt-4">
                    {/* Main Chart Area */}
                    <div className="col-span-1 lg:col-span-3 h-[200px] w-full border border-border rounded-xl p-3 bg-muted/40 flex flex-col">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                            Daily Volume Distribution
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
                                        dataKey="totalVol"
                                        name="Volume"
                                        unit="L"
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
                                    <Scatter name="Daily Volume" data={data} fill="#2563EB">
                                        {data.map((entry, index) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={entry.totalVol > avgVolume ? "#2563EB" : "#93C5FD"}
                                                fillOpacity={entry.totalVol > avgVolume ? 1 : 0.5}
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
                            <p className="text-[9px] font-bold uppercase text-muted-foreground truncate">Total Period Volume</p>
                            <p className="text-lg font-black text-foreground mt-1 truncate" title={`${totalVolume.toLocaleString()} L`}>
                                {totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })} L
                            </p>
                        </div>
                        <div className="p-3 rounded-xl border border-border bg-card shadow-sm min-w-0">
                            <p className="text-[9px] font-bold uppercase text-muted-foreground truncate">Peak Daily Volume</p>
                            <p className="text-lg font-black text-foreground mt-1 truncate" title={`${maxVolume.toLocaleString()} L`}>
                                {maxVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })} L
                            </p>
                        </div>
                        <div className="p-3 rounded-xl border border-border bg-card shadow-sm min-w-0">
                            <p className="text-[9px] font-bold uppercase text-muted-foreground truncate">Average Daily</p>
                            <p className="text-lg font-black text-foreground mt-1 truncate" title={`${avgVolume.toLocaleString()} L`}>
                                {avgVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })} L
                            </p>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
