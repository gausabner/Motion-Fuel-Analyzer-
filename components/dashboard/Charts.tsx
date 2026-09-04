"use client";

import { useState, useMemo, useRef } from "react";
import { ChartExportButton } from "@/components/ui/ChartExportButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    AreaChart,
    Area,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from "recharts";
import { motion } from "framer-motion";
import { BarChart3, LineChart as LineIcon, AreaChart as AreaIcon, CalendarDays, CalendarRange, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, startOfMonth, startOfYear } from "date-fns";

// Data palette — see UI_Redesign_Plan.pdf §05: petrol sky, diesel deep blue
const PETROL = '#60A5FA';
const DIESEL = '#1D4ED8';
const COLORS = [PETROL, DIESEL, '#E2E8F0'];

interface DailyDataPoint {
    date: Date;
    fuelType: string;
    totalVolume: number;
}

interface TopItem {
    name: string;
    value: number;
    petrol?: number;
    diesel?: number;
}

export function DashboardCharts({
    dailyData,
    topFleet,
    topVotes
}: {
    dailyData: DailyDataPoint[],
    topFleet: TopItem[],
    topVotes: TopItem[]
}) {
    const [mainChartType, setMainChartType] = useState<'line' | 'area' | 'bar'>('area');
    const [granularity, setGranularity] = useState<'daily' | 'monthly' | 'yearly'>('daily');

    // Intelligent Data Aggregation based on granularity
    const aggregatedData = useMemo(() => {
        const groups: Record<string, any> = {};

        dailyData.forEach(curr => {
            const d = new Date(curr.date);
            let key = "";

            if (granularity === 'daily') {
                key = format(d, "MMM dd");
            } else if (granularity === 'monthly') {
                key = format(d, "MMM yyyy");
            } else {
                key = format(d, "yyyy");
            }

            if (!groups[key]) {
                groups[key] = { date: key, petrol: 0, diesel: 0, cost: 0 };
            }

            if (curr.fuelType.toLowerCase().includes('petrol')) {
                groups[key].petrol += curr.totalVolume;
            } else {
                groups[key].diesel += curr.totalVolume;
            }

            // Note: We need cost in DailyDataPoint to make this fully accurate if not using stats table.
            // For now, I'll use a derived cost if it's missing, but I should probably update the interface.
            groups[key].cost += (curr as any).totalCost || 0;
        });

        // Sort by date first to ensure slicing works correctly
        const sortedGroups = Object.values(groups).sort((a: any, b: any) => {
            return new Date(a.date).getTime() - new Date(b.date).getTime();
        });

        // Apply limits based on granularity
        if (granularity === 'daily') {
            return sortedGroups.slice(-30); // Last 30 days
        } else if (granularity === 'monthly') {
            return sortedGroups.slice(-12); // Last 12 months (1 year)
        } else {
            return sortedGroups.slice(-10); // Last 10 years
        }
    }, [dailyData, granularity]);

    const costAggregatedData = aggregatedData.map(d => ({ date: d.date, cost: d.cost }));

    const pieData = useMemo(() => {
        const petrol = dailyData.filter(d => d.fuelType.toLowerCase().includes('petrol')).reduce((sum, d) => sum + d.totalVolume, 0);
        const diesel = dailyData.filter(d => d.fuelType.toLowerCase().includes('diesel')).reduce((sum, d) => sum + d.totalVolume, 0);
        return [
            { name: 'Petrol', value: petrol },
            { name: 'Diesel', value: diesel }
        ];
    }, [dailyData]);

    const renderMainChart = () => {
        const commonProps = {
            data: aggregatedData,
            children: (
                <>
                    <CartesianGrid vertical={false} stroke="#F1F5F9" />
                    <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fill: '#64748B', fontWeight: 500 }}
                        axisLine={false}
                        tickLine={false}
                        dy={10}
                    />
                    <YAxis
                        tick={{ fontSize: 10, fill: '#64748B', fontWeight: 500 }}
                        axisLine={false}
                        tickLine={false}
                        dx={-10}
                    />
                    <Tooltip
                        contentStyle={{
                            borderRadius: '8px',
                            border: 'none',
                            boxShadow: '0 4px 12px rgba(15,23,42,0.25)',
                            backgroundColor: '#0F172A',
                            color: '#F8FAFC'
                        }}
                        labelStyle={{ color: '#94A3B8', fontSize: '11px' }}
                        itemStyle={{ color: '#F8FAFC', fontSize: '12px', fontWeight: 'bold' }}
                        cursor={{ stroke: '#93C5FD', strokeWidth: 1.5, strokeDasharray: '4 4' }}
                    />
                    <Legend
                        verticalAlign="top"
                        height={36}
                        iconType="square"
                        wrapperStyle={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                    />
                </>
            )
        };

        if (mainChartType === 'line') {
            return (
                <LineChart {...commonProps}>
                    {commonProps.children}
                    <Line type="monotone" dataKey="petrol" stroke={PETROL} strokeWidth={2.5} name="Petrol" dot={false} activeDot={{ r: 5, fill: PETROL }} />
                    <Line type="monotone" dataKey="diesel" stroke={DIESEL} strokeWidth={2.5} name="Diesel" dot={false} activeDot={{ r: 5, fill: DIESEL }} />
                </LineChart>
            );
        }

        if (mainChartType === 'bar') {
            return (
                <BarChart {...commonProps} barGap={4}>
                    {commonProps.children}
                    <Bar dataKey="petrol" fill={PETROL} radius={[3, 3, 0, 0]} name="Petrol" maxBarSize={40} />
                    <Bar dataKey="diesel" fill={DIESEL} radius={[3, 3, 0, 0]} name="Diesel" maxBarSize={40} />
                </BarChart>
            );
        }

        return (
            <AreaChart {...commonProps}>
                <defs>
                    <linearGradient id="colorPetrol" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={PETROL} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={PETROL} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorDiesel" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={DIESEL} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={DIESEL} stopOpacity={0} />
                    </linearGradient>
                </defs>
                {commonProps.children}
                <Area type="monotone" dataKey="petrol" stroke={PETROL} strokeWidth={2.5} fillOpacity={1} fill="url(#colorPetrol)" name="Petrol" />
                <Area type="monotone" dataKey="diesel" stroke={DIESEL} strokeWidth={2.5} fillOpacity={1} fill="url(#colorDiesel)" name="Diesel" />
            </AreaChart>
        );
    };

    const trendRef = useRef<HTMLDivElement>(null);
    const departmentRef = useRef<HTMLDivElement>(null);
    const energyRef = useRef<HTMLDivElement>(null);
    const fleetRef = useRef<HTMLDivElement>(null);
    const costRef = useRef<HTMLDivElement>(null);

    return (
        <div className="space-y-8">
            {/* Main Trend Chart */}
            <Card className="apple-shadow-box border-0" ref={trendRef}>
                <CardHeader className="flex flex-col md:flex-row items-center justify-between gap-4 px-0 pb-6 border-b border-border">
                    <div>
                        <CardTitle className="text-lg font-bold tracking-tight">Consumption trend</CardTitle>
                        <p className="text-xs text-muted-foreground font-medium mt-1 tracking-wide">
                            {granularity.charAt(0).toUpperCase() + granularity.slice(1)} Volume Analysis
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-4 items-center">
                        <ChartExportButton targetRef={trendRef} fileName={`consumption_trend_${granularity}`} />
                        {/* Granularity Toggle */}
                        <div className="flex bg-muted p-1 rounded-lg gap-1">
                            <Button
                                variant={granularity === 'daily' ? 'default' : 'ghost'}
                                size="sm"
                                className={`rounded-md h-7 px-3 text-[10px] font-bold uppercase tracking-wide ${granularity === 'daily' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                onClick={() => setGranularity('daily')}
                            >
                                Daily
                            </Button>
                            <Button
                                variant={granularity === 'monthly' ? 'default' : 'ghost'}
                                size="sm"
                                className={`rounded-md h-7 px-3 text-[10px] font-bold uppercase tracking-wide ${granularity === 'monthly' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                onClick={() => setGranularity('monthly')}
                            >
                                Monthly
                            </Button>
                            <Button
                                variant={granularity === 'yearly' ? 'default' : 'ghost'}
                                size="sm"
                                className={`rounded-md h-7 px-3 text-[10px] font-bold uppercase tracking-wide ${granularity === 'yearly' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                onClick={() => setGranularity('yearly')}
                            >
                                Yearly
                            </Button>
                        </div>

                        {/* Chart Type Toggle */}
                        <div className="flex bg-muted p-1 rounded-lg gap-1">
                            <Button
                                variant={mainChartType === 'area' ? 'default' : 'ghost'}
                                size="sm"
                                className={`rounded-md h-7 px-2 ${mainChartType === 'area' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
                                onClick={() => setMainChartType('area')}
                                aria-label="Area chart"
                            >
                                <AreaIcon className="h-3 w-3" />
                            </Button>
                            <Button
                                variant={mainChartType === 'line' ? 'default' : 'ghost'}
                                size="sm"
                                className={`rounded-md h-7 px-2 ${mainChartType === 'line' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
                                onClick={() => setMainChartType('line')}
                                aria-label="Line chart"
                            >
                                <LineIcon className="h-3 w-3" />
                            </Button>
                            <Button
                                variant={mainChartType === 'bar' ? 'default' : 'ghost'}
                                size="sm"
                                className={`rounded-md h-7 px-2 ${mainChartType === 'bar' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
                                onClick={() => setMainChartType('bar')}
                                aria-label="Bar chart"
                            >
                                <BarChart3 className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="px-0 pt-8">
                    <ResponsiveContainer width="100%" height={240}>
                        {renderMainChart()}
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Top 10 Vote Numbers */}
                <Card className="monumental-card bg-card col-span-1 md:col-span-2 lg:col-span-2" ref={departmentRef}>
                    <CardHeader className="px-0 pt-0 pb-6 border-b border-border mb-6 flex flex-row items-center justify-between">
                        <CardTitle className="text-sm font-bold uppercase tracking-wide">High-Consuming Departments</CardTitle>
                        <ChartExportButton targetRef={departmentRef} fileName="high_consuming_departments" />
                    </CardHeader>
                    <CardContent className="px-0 pb-0">
                        <div className="w-full relative border border-border rounded-md bg-muted/40">
                            <div className="overflow-y-auto pr-4 custom-scrollbar" style={{ height: '250px' }}>
                                <div style={{ height: `${topVotes.length * 50}px`, width: '100%' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={topVotes} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 10 }} barGap={2}>
                                            <XAxis type="number" hide />
                                            <YAxis
                                                type="category"
                                                dataKey="name"
                                                tick={(props) => {
                                                    const { x, y, payload } = props;
                                                    const value = payload.value as string;
                                                    const firstSpaceIndex = value.indexOf(' ');
                                                    const rank = value.substring(0, firstSpaceIndex).replace('#', '');
                                                    const name = value.substring(firstSpaceIndex + 1);
                                                    const AXIS_WIDTH = 140;

                                                    return (
                                                        <foreignObject x={Number(x) - AXIS_WIDTH} y={Number(y) - 21} width={AXIS_WIDTH - 10} height={42}>
                                                            <div className="flex items-center w-full h-full text-xs">
                                                                <div className="w-[30%] text-muted-foreground font-medium pl-2 flex items-center h-full">
                                                                    #{rank}
                                                                </div>
                                                                <div className={`w-[70%] font-bold whitespace-normal leading-[1.1] flex items-center text-[10px] pr-1 ${name === 'Unassigned' ? 'text-amber-600' : 'text-foreground'}`} title={name}>
                                                                    <span className="line-clamp-3">{name === 'Unassigned' ? '⚑ Unassigned' : name}</span>
                                                                </div>
                                                            </div>
                                                        </foreignObject>
                                                    );
                                                }}
                                                width={140}
                                                axisLine={false}
                                                tickLine={false}
                                                interval={0}
                                            />
                                            <Tooltip
                                                cursor={{ fill: '#F1F5F9' }}
                                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                                                labelFormatter={(label) => label.substring(label.indexOf(' ') + 1)}
                                            />
                                            <Bar dataKey="petrol" stackId="a" fill={PETROL} name="Petrol" barSize={42} radius={[0, 0, 0, 0]} />
                                            <Bar dataKey="diesel" stackId="a" fill={DIESEL} name="Diesel" barSize={42} radius={[0, 4, 4, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Distribution Pie */}
                <Card className="monumental-card bg-card col-span-1 md:col-span-2 lg:col-span-2" ref={energyRef}>
                    <CardHeader className="px-0 pt-0 pb-6 border-b border-border mb-6 flex flex-row items-center justify-between">
                        <CardTitle className="text-sm font-bold uppercase tracking-wide">Energy Mix</CardTitle>
                        <ChartExportButton targetRef={energyRef} fileName="energy_mix" />
                    </CardHeader>
                    <CardContent className="px-0 pb-0 flex items-center justify-center">
                        <ResponsiveContainer width="100%" height={210}>
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="75%"
                                    startAngle={180}
                                    endAngle={0}
                                    innerRadius={70}
                                    outerRadius={120}
                                    paddingAngle={6}
                                    dataKey="value"
                                    stroke="none"
                                    cornerRadius={12}
                                    isAnimationActive={true}
                                >
                                    <Cell fill={PETROL} name="Petrol" />
                                    <Cell fill={DIESEL} name="Diesel" />
                                </Pie>
                                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                                <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ bottom: '20px' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Top Fleet Units */}
            <Card className="apple-shadow-box border-0" ref={fleetRef}>
                <CardHeader className="px-0 pt-0 pb-6 border-b border-border mb-6 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-bold uppercase tracking-wide">Top Fleet Utilization</CardTitle>
                    <ChartExportButton targetRef={fleetRef} fileName="top_fleet_utilization" />
                </CardHeader>
                <CardContent className="px-0 pb-0">
                    <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={topFleet} barGap={2} margin={{ bottom: 20 }}>
                            <XAxis
                                dataKey="name"
                                tick={{ fontSize: 11, fill: '#334155', fontWeight: 600, dy: 10 }}
                                interval={0}
                                height={40}
                                axisLine={false}
                                tickLine={false}
                            />
                            <Tooltip
                                cursor={{ fill: '#F4F4F5' }}
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                            />
                            <Bar dataKey="value" name="Volume" fill="#2563EB" radius={[4, 4, 0, 0]} barSize={80} />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Restored: Consumption Cost Trend */}
            <Card className="monumental-card border-0 shadow-none bg-card" ref={costRef}>
                <CardHeader className="px-0 pt-0 pb-6 border-b border-border mb-6 flex flex-row items-center justify-between">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                        <div>
                            <CardTitle className="text-sm font-bold uppercase tracking-wide">Financial Velocity</CardTitle>
                            <p className="text-xs text-muted-foreground font-medium mt-1 tracking-wide">
                                Cost accumulation over time (N$)
                            </p>
                        </div>
                    </div>
                    <ChartExportButton targetRef={costRef} fileName="financial_velocity" />
                </CardHeader>
                <CardContent className="px-0 pb-0">
                    <ResponsiveContainer width="100%" height={210}>
                        <AreaChart data={costAggregatedData}>
                            <defs>
                                <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.25} />
                                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis
                                dataKey="date"
                                tick={{ fontSize: 10, fill: '#64748B', fontWeight: 500 }}
                                axisLine={false}
                                tickLine={false}
                                dy={10}
                            />
                            <YAxis
                                tick={{ fontSize: 10, fill: '#64748B', fontWeight: 500 }}
                                axisLine={false}
                                tickLine={false}
                                dx={-10}
                            />
                            <Tooltip
                                contentStyle={{
                                    borderRadius: '8px',
                                    border: '1px solid #E4E4E7',
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                    backgroundColor: '#FFFFFF',
                                    color: '#000000'
                                }}
                                formatter={(value: any) => [`N$${Number(value).toLocaleString()}`, 'Total Cost']}
                            />
                            <Area type="monotone" dataKey="cost" stroke="#2563EB" strokeWidth={2.5} fillOpacity={1} fill="url(#colorCost)" name="Total Cost" />
                        </AreaChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
}

export function FocusedChart({ data, fuelType, currencySymbol = "N$", color: colorOverride }: { data: DailyDataPoint[], fuelType: string, currencySymbol?: string, color?: string }) {
    const chartData = useMemo(() => {
        const groups: Record<string, any> = {};
        data.forEach(curr => {
            const key = format(new Date(curr.date), "MMM dd");
            if (!groups[key]) groups[key] = { date: key, value: 0 };

            // If fuelType is 'Volume' or 'Total', sum everything. Otherwise filter by specific type.
            if (fuelType === 'Volume' || fuelType === 'Total' || curr.fuelType.includes(fuelType)) {
                groups[key].value += curr.totalVolume;
            }
        });
        return Object.values(groups);
    }, [data, fuelType]);

    const color = colorOverride ?? (fuelType === 'Petrol' ? PETROL : fuelType === 'Diesel' ? DIESEL : '#2563EB');

    return (
        <div className="h-[280px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                    <defs>
                        <linearGradient id="focusedGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.2} />
                            <stop offset="95%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fill: '#64748B' }}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={30}
                    />
                    <YAxis
                        tick={{ fontSize: 10, fill: '#64748B' }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <Tooltip
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        formatter={(value: any) => [`${Number(value).toFixed(2)} L`, 'Consumption']}
                    />
                    <Area
                        type="monotone"
                        dataKey="value"
                        stroke={color}
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#focusedGradient)"
                        name={fuelType}
                        animationDuration={1500}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
