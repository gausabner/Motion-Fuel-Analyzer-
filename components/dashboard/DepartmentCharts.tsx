"use client";

import { useMemo, useRef } from "react";
import { ChartExportButton } from "@/components/ui/ChartExportButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell
} from "recharts";

interface DepartmentStat {
    id: string;
    division?: string;
    petrolVolume: number;
    dieselVolume: number;
    totalCost: number;
    count: number;
}

export function DepartmentCharts({ data }: { data: DepartmentStat[] }) {

    const topConsumers = useMemo(() => {
        return [...data]
            .sort((a, b) => (b.petrolVolume + b.dieselVolume) - (a.petrolVolume + a.dieselVolume))
            .slice(0, 50)
            .map((d, index) => ({
                name: `#${index + 1} ${d.division || d.id}`, // Rank + Division
                value: d.petrolVolume + d.dieselVolume,
                petrol: d.petrolVolume,
                diesel: d.dieselVolume
            }));
    }, [data]);

    const topFrequency = useMemo(() => {
        return [...data]
            .sort((a, b) => b.count - a.count)
            .slice(0, 50)
            .map((d, index) => ({
                name: `#${index + 1} ${d.division || d.id}`, // Rank + Division
                value: d.count
            }));
    }, [data]);

    const ITEM_HEIGHT = 50;
    const VISIBLE_ITEMS = 10;
    const CONTAINER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

    // Custom Tick Component with strict Flexbox Layout for 15% | 25% Split
    const AXIS_WIDTH = 160;

    // Width ratio within the axis area (which is 40% of total)
    // Rank is 15% of total, so 15/40 of axis = 37.5%
    // Name is 25% of total, so 25/40 of axis = 62.5%

    const CustomYAxisTick = (props: any) => {
        const { x, y, payload } = props;
        const value = payload.value as string;

        const firstSpaceIndex = value.indexOf(' ');
        const rank = value.substring(0, firstSpaceIndex).replace('#', '');
        const name = value.substring(firstSpaceIndex + 1);

        return (
            <foreignObject x={x - AXIS_WIDTH} y={y - 21} width={AXIS_WIDTH - 10} height={42}>
                <div className="flex items-center w-full h-full text-xs">
                    {/* Rank Column: 15% of Total Width (37.5% of Axis) */}
                    <div className="w-[37.5%] text-zinc-500 font-medium pl-2 flex items-center h-full">
                        #{rank}
                    </div>

                    {/* Name Column: 25% of Total Width (62.5% of Axis) */}
                    <div className="w-[62.5%] font-bold text-black whitespace-normal leading-[1.1] flex items-center text-[10px] pr-1" title={name}>
                        <span className="line-clamp-3">{name}</span>
                    </div>
                </div>
            </foreignObject>
        );
    };

    const renderScrollableChart = (data: any[], unit: string) => {
        const totalHeight = data.length * ITEM_HEIGHT;

        return (
            <div className="w-full relative border border-zinc-100 rounded-md bg-zinc-50/50">
                <div
                    className="overflow-y-auto pr-4 custom-scrollbar"
                    style={{ height: `${CONTAINER_HEIGHT}px` }}
                >
                    <div style={{ height: `${totalHeight}px`, width: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                layout="vertical"
                                data={data}
                                margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
                                barGap={2}
                            >
                                <XAxis type="number" hide />
                                <YAxis
                                    type="category"
                                    dataKey="name"
                                    tick={<CustomYAxisTick />}
                                    width={160} // Adjusted to 40% of container width (approx)
                                    axisLine={false}
                                    tickLine={false}
                                    interval={0} // Force show all ticks
                                />
                                <Tooltip
                                    cursor={{ fill: '#F4F4F5' }}
                                    contentStyle={{ borderRadius: '0px', border: '1px solid #E4E4E7', boxShadow: 'none' }}
                                    itemStyle={{ color: '#000000', fontSize: '12px', fontWeight: 'bold' }}
                                    formatter={(value: any) => [`${Number(value).toLocaleString()} ${unit}`, 'Total']}
                                    labelFormatter={(label) => label.substring(label.indexOf(' ') + 1)} // Clean label in tooltip
                                />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={42} background={{ fill: '#f4f4f5' }}>
                                    {data.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={index < 3 ? '#FDE047' : '#000000'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        );
    };

    const volumeRef = useRef<HTMLDivElement>(null);
    const frequencyRef = useRef<HTMLDivElement>(null);

    return (
        <div className="industrial-grid">
            {/* Top Consumption (Volume) */}
            <Card className="monumental-card bg-white col-span-1 md:col-span-2" ref={volumeRef}>
                <CardHeader className="px-0 pt-0 pb-6 border-b border-border pl-0 mb-6 flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-lg font-extrabold uppercase tracking-tight">Top 50 Consumers (Volume)</CardTitle>
                        <p className="text-xs text-muted-foreground font-medium tracking-wide mt-1">Sort: Highest Total Liters</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <ChartExportButton targetRef={volumeRef} fileName="top_50_consumers_volume" />
                        <div className="bg-yellow-400 text-black text-[10px] font-bold px-2 py-1 uppercase tracking-widest rounded-sm">
                            Top {topConsumers.length}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                    {renderScrollableChart(topConsumers, 'L')}
                </CardContent>
            </Card>

            {/* Top Frequency (Refills) */}
            <Card className="monumental-card bg-white col-span-1 md:col-span-2" ref={frequencyRef}>
                <CardHeader className="px-0 pt-0 pb-6 border-b border-border pl-0 mb-6 flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-lg font-extrabold uppercase tracking-tight">Most Frequent Refills</CardTitle>
                        <p className="text-xs text-muted-foreground font-medium tracking-wide mt-1">Sort: Highest Transaction Count</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <ChartExportButton targetRef={frequencyRef} fileName="most_frequent_refills" />
                        <div className="bg-black text-white text-[10px] font-bold px-2 py-1 uppercase tracking-widest rounded-sm">
                            Top {topFrequency.length}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                    {renderScrollableChart(topFrequency, 'Refills')}
                </CardContent>
            </Card>
        </div>
    );
}
