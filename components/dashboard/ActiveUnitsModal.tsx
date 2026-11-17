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
import { useChartTheme, AXIS, tooltipStyles } from "@/lib/chart-theme";

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
    const chart = useChartTheme();
    const tip = tooltipStyles(chart);


    // Custom Tooltip for Scatter Chart
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className="bg-popover border border-border p-2 rounded text-xs">
                    <p className="font-semibold">{data.id}</p>
                    <p>Total: {data.y.toFixed(2)} L</p>
                    <p className="text-warn">Petrol: {data.petrol.toFixed(2)} L</p>
                    <p className="text-muted-foreground">Diesel: {data.diesel.toFixed(2)} L</p>
                </div>
            );
        }
        return null;
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="!w-[70vw] !max-w-[70vw] max-h-[90vh] overflow-y-auto bg-background/95 ">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-semibold tracking-tight">Active Fleet Units</DialogTitle>
                    <DialogDescription>
                        Detailed breakdown of fleet fuel consumption for the selected period.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
                    {/* Scatter Chart Section */}
                    <div className="h-[200px] w-full border border-border/50 rounded-xl p-3 bg-card/40 flex flex-col">
                        <h3 className="text-xs font-semibold text-muted-foreground mb-2">
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
                                        tick={{ fontSize: AXIS.tickSize, fill: chart.axis }}
                                        axisLine={false}
                                        tickLine={false}
                                        dx={-5}
                                    />
                                    <Tooltip
                                        cursor={tip.cursor}
                                        content={<CustomTooltip />}
                                        wrapperStyle={{ outline: 'none' }}
                                    />
                                    <Scatter name="Units" data={top20Scatter} fill={chart.petrol}>
                                        {top20Scatter.map((entry, index) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={entry.petrol > entry.diesel ? chart.petrol : chart.diesel}
                                                stroke="transparent"
                                            />
                                        ))}
                                    </Scatter>
                                </ScatterChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="flex justify-center gap-4 mt-1 text-xs font-semibold text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#60A5FA]"></span>
                                Petrol Dominant
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#1D4ED8]"></span>
                                Diesel Dominant
                            </div>
                        </div>
                    </div>

                    {/* Scrollable List Section */}
                    <div className="flex flex-col h-[200px]">
                        <h3 className="text-xs font-semibold text-muted-foreground mb-2">
                            Detailed Fleet Metrics
                        </h3>
                        <div className="border border-border/50 rounded-xl overflow-hidden flex-1 bg-card/40 ">
                            <div className="h-full overflow-y-auto custom-scrollbar p-0">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-background/95 z-10 border-b border-border/50">
                                        <TableRow className="border-border/50 hover:bg-transparent h-8">
                                            <TableHead className="h-8">Unit ID</TableHead>
                                            <TableHead className="text-right h-8">Petrol</TableHead>
                                            <TableHead className="text-right h-8">Diesel</TableHead>
                                            <TableHead className="text-right h-8">Total</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {activeUnitsList.map((unit) => (
                                            <TableRow key={unit.vehicleId} className="border-border/50 hover:bg-muted/30 transition-colors h-8">
                                                <TableCell className="font-mono text-xs font-semibold text-foreground py-1">{unit.vehicleId}</TableCell>
                                                <TableCell className="text-right text-xs py-1 text-[#3B82F6]">
                                                    {unit.petrol > 0 ? unit.petrol.toFixed(0) : '-'}
                                                </TableCell>
                                                <TableCell className="text-right text-xs py-1 text-[#1D4ED8] dark:text-[#60A5FA]">
                                                    {unit.diesel > 0 ? unit.diesel.toFixed(0) : '-'}
                                                </TableCell>
                                                <TableCell className="text-right text-xs font-semibold text-foreground py-1">
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
