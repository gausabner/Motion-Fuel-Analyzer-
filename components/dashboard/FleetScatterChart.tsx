"use client";

import { useMemo, useState, useRef } from "react";
import { ChartExportButton } from "@/components/ui/ChartExportButton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    ScatterChart,
    Scatter,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Legend
} from "recharts";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface FleetTransaction {
    vehicleId: string;
    date: string; // ISO string
    quantity: number;
    fuelType: string;
    cost: number;
}

const PALETTE = {
    petrol: '#000000', // Black
    diesel: '#FDE047', // Yellow
    grid: 'transparent',
    text: '#71717A'  // zinc-500
};

type Granularity = 'daily' | 'weekly' | 'monthly' | 'yearly';

export function FleetScatterChart({ data }: { data: FleetTransaction[] }) {
    const [granularity, setGranularity] = useState<Granularity>('daily');

    // Process data based on granularity
    const chartData = useMemo(() => {
        if (!data || data.length === 0) return [];

        const processed = data.map(d => ({
            ...d,
            dateObj: new Date(d.date)
        }));

        // Group by Vehicle + Time Period
        const groups: Record<string, any> = {};

        processed.forEach(curr => {
            const vehicle = curr.vehicleId;
            let timeKey = '';

            const date = curr.dateObj;
            if (granularity === 'daily') timeKey = date.toISOString().split('T')[0];
            else if (granularity === 'weekly') {
                const firstDay = new Date(date.setDate(date.getDate() - date.getDay()));
                timeKey = firstDay.toISOString().split('T')[0] + "_W";
            }
            else if (granularity === 'monthly') timeKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
            else if (granularity === 'yearly') timeKey = `${date.getFullYear()}`;

            const key = `${vehicle}_${timeKey}_${curr.fuelType}`;

            if (!groups[key]) {
                groups[key] = {
                    vehicleId: vehicle,
                    timeKey: timeKey, // For tooltip
                    fuelType: curr.fuelType,
                    quantity: 0,
                    cost: 0,
                    count: 0
                };
            }
            groups[key].quantity += curr.quantity;
            groups[key].cost += curr.cost;
            groups[key].count += 1;
        });

        // 1. Get unique vehicles and sort them (e.g. alphanumeric)
        const uniqueVehicles = Array.from(new Set(processed.map(d => d.vehicleId))).sort();

        return Object.values(groups).map((d: any) => ({
            ...d,
            xIndex: uniqueVehicles.indexOf(d.vehicleId), // Numeric index for X
            vehicleName: d.vehicleId // Label
        })).sort((a, b) => a.xIndex - b.xIndex); // Sort by vehicle index

    }, [data, granularity]);

    // Unique vehicles for Tick formatting
    const vehiclesList = useMemo(() => {
        if (!data) return [];
        return Array.from(new Set(data.map(d => d.vehicleId))).sort();
    }, [data]);

    const chartRef = useRef<HTMLDivElement>(null);

    return (
        <Card className="monumental-card border-0 shadow-none bg-white" ref={chartRef}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6 border-b border-border pl-0">
                <div className="space-y-1">
                    <CardTitle className="text-lg font-extrabold tracking-tight uppercase">Fleet Operations Matrix</CardTitle>
                    <CardDescription className="text-xs font-medium tracking-wide">
                        Consumption distribution per vehicle.
                    </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                    <ChartExportButton targetRef={chartRef} fileName={`fleet_matrix_${granularity}`} />
                    <ToggleGroup type="single" value={granularity} onValueChange={(v) => v && setGranularity(v as Granularity)}>
                        <ToggleGroupItem value="daily" className="text-[10px] font-bold uppercase" aria-label="Daily">Daily</ToggleGroupItem>
                        <ToggleGroupItem value="weekly" className="text-[10px] font-bold uppercase" aria-label="Weekly">Weekly</ToggleGroupItem>
                        <ToggleGroupItem value="monthly" className="text-[10px] font-bold uppercase" aria-label="Monthly">Monthly</ToggleGroupItem>
                    </ToggleGroup>
                </div>
            </CardHeader>
            <CardContent className="h-[500px] w-full pt-8 pl-0">
                <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 30, bottom: 60, left: 20 }}>
                        {/* Minimalist: No Grid */}
                        <XAxis
                            type="number"
                            dataKey="xIndex"
                            name="Vehicle"
                            domain={[-1, vehiclesList.length]}
                            ticks={vehiclesList.map((_, i) => i)}
                            tickFormatter={(i) => vehiclesList[i] || ''}
                            tick={{ fontSize: 10, fill: PALETTE.text, dy: 10, fontWeight: 600 }}
                            angle={-45}
                            textAnchor="end"
                            axisLine={false}
                            tickLine={false}
                            interval={0}
                            height={80}
                        />
                        <YAxis
                            type="number"
                            dataKey="quantity"
                            name="Volume"
                            unit=" L"
                            tick={{ fontSize: 10, fill: PALETTE.text, fontWeight: 600 }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip
                            cursor={{ strokeDasharray: '3 3', stroke: '#E4E4E7' }}
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    const data = payload[0].payload;
                                    return (
                                        <div className="bg-white shadow-xl rounded-lg p-4 border border-border text-sm min-w-[200px]">
                                            <p className="font-extrabold mb-2 text-black uppercase tracking-wide border-b border-border pb-2">{data.vehicleId}</p>
                                            <div className="space-y-1.5 text-muted-foreground">
                                                <p className="flex justify-between"><span className="font-semibold text-xs uppercase">Period</span> <span className="text-black">{data.timeKey}</span></p>
                                                <p className="flex justify-between"><span className="font-semibold text-xs uppercase">Volume</span> <span className="text-black">{data.quantity.toFixed(1)} L</span></p>
                                                <p className="flex justify-between"><span className="font-semibold text-xs uppercase">Count</span> <span className="text-black">{data.count}</span></p>
                                                <div className="mt-2 pt-2 border-t border-border flex items-center gap-2">
                                                    <div className={`w-3 h-3 rounded-full ${data.fuelType === 'Petrol' ? 'bg-black' : 'bg-yellow-300'}`} />
                                                    <span className="text-xs font-bold uppercase text-black">{data.fuelType}</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            }}
                        />
                        <Legend
                            verticalAlign="top"
                            height={36}
                            wrapperStyle={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                        />
                        <Scatter name="Petrol" data={chartData.filter(d => d.fuelType === 'Petrol')} fill={PALETTE.petrol} shape="circle" />
                        <Scatter name="Diesel" data={chartData.filter(d => d.fuelType === 'Diesel')} fill={PALETTE.diesel} shape="square" />
                    </ScatterChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}
