"use client";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
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
import { motion } from "framer-motion";

interface UnitData {
    vehicleId: string;
    petrol: number;
    diesel: number;
    total: number;
}

interface ScatterData {
    id: string;
    x: number;
    y: number;
    petrol: number;
    diesel: number;
}

interface ActiveUnitsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    activeUnitsList: UnitData[];
    top20Scatter: ScatterData[];
}

export function ActiveUnitsModal({ open, onOpenChange, activeUnitsList, top20Scatter }: ActiveUnitsModalProps) {

    // Custom Tooltip for Scatter Chart
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className="bg-popover border border-border p-2 rounded shadow-lg text-xs">
                    <p className="font-bold">{data.id}</p>
                    <p>Total: {data.y.toFixed(2)} L</p>
                    <p className="text-amber-500">Petrol: {data.petrol.toFixed(2)} L</p>
                    <p className="text-slate-500">Diesel: {data.diesel.toFixed(2)} L</p>
                </div>
            );
        }
        return null;
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="!w-[70vw] !max-w-[70vw] max-h-[90vh] overflow-y-auto bg-background/95 backdrop-blur-md">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-black uppercase tracking-tight">Active Fleet Units</DialogTitle>
                    <DialogDescription>
                        Detailed breakdown of fleet fuel consumption for the selected period.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
                    {/* Scatter Chart Section */}
                    <div className="h-[200px] w-full border border-border/50 rounded-xl p-3 bg-card/40 backdrop-blur-sm shadow-sm flex flex-col">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                            Consumption Distribution (Top 20)
                        </h3>
                        <div className="flex-1 w-full min-h-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <ScatterChart margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                                    <XAxis type="number" dataKey="x" name="Rank" hide />
                                    <YAxis
                                        type="number"
                                        dataKey="y"
                                        name="Consumption"
                                        unit="L"
                                        tick={{ fontSize: 9, fill: '#71717A' }}
                                        axisLine={false}
                                        tickLine={false}
                                        dx={-5}
                                    />
                                    <Tooltip
                                        cursor={{ strokeDasharray: '3 3' }}
                                        content={<CustomTooltip />}
                                        wrapperStyle={{ outline: 'none' }}
                                    />
                                    <Scatter name="Units" data={top20Scatter} fill="#eab308">
                                        {top20Scatter.map((entry, index) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={entry.petrol > entry.diesel ? "#000000" : "#FDE047"}
                                                stroke="transparent"
                                            />
                                        ))}
                                    </Scatter>
                                </ScatterChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="flex justify-center gap-4 mt-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-black"></span>
                                Petrol Dominant
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-yellow-300"></span>
                                Diesel Dominant
                            </div>
                        </div>
                    </div>

                    {/* Scrollable List Section */}
                    <div className="flex flex-col h-[200px]">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                            Detailed Fleet Metrics
                        </h3>
                        <div className="border border-border/50 rounded-xl overflow-hidden flex-1 bg-card/40 backdrop-blur-sm shadow-sm">
                            <div className="h-full overflow-y-auto custom-scrollbar p-0">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-background/95 backdrop-blur z-10 border-b border-border/50">
                                        <TableRow className="border-border/50 hover:bg-transparent h-8">
                                            <TableHead className="text-[9px] uppercase font-bold text-muted-foreground h-8 py-0">Unit ID</TableHead>
                                            <TableHead className="text-right text-[9px] uppercase font-bold text-muted-foreground h-8 py-0">Petrol</TableHead>
                                            <TableHead className="text-right text-[9px] uppercase font-bold text-muted-foreground h-8 py-0">Diesel</TableHead>
                                            <TableHead className="text-right text-[9px] uppercase font-bold text-muted-foreground h-8 py-0">Total</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {activeUnitsList.map((unit) => (
                                            <TableRow key={unit.vehicleId} className="border-border/50 hover:bg-muted/30 transition-colors h-8">
                                                <TableCell className="font-mono text-[10px] font-bold text-foreground py-1">{unit.vehicleId}</TableCell>
                                                <TableCell className="text-right text-[10px] py-1 text-zinc-500">
                                                    {unit.petrol > 0 ? unit.petrol.toFixed(0) : '-'}
                                                </TableCell>
                                                <TableCell className="text-right text-[10px] py-1 text-yellow-600/90 dark:text-yellow-500/90">
                                                    {unit.diesel > 0 ? unit.diesel.toFixed(0) : '-'}
                                                </TableCell>
                                                <TableCell className="text-right text-[10px] font-bold text-foreground py-1">
                                                    {unit.total.toFixed(0)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
