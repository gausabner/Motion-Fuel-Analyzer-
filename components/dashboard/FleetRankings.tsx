"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from "recharts";
import { useChartTheme, AXIS, tooltipStyles } from "@/lib/chart-theme";

interface RankingProps {
    topFreqVehicles: { name: string; value: number }[];
    topCostCentres: { name: string; value: number }[];
}

export function FleetRankings({ topFreqVehicles, topCostCentres }: RankingProps) {
    // Both charts carry a single series, so one hue is the whole palette. The
    // previous version repainted the top three a different colour, which made
    // colour mean rank — and the bars are already sorted, so position says it.
    const chart = useChartTheme();
    const tip = tooltipStyles(chart);
    return (
        <div className="grid gap-4 md:grid-cols-2">
            {/* Top Frequent Consumers */}
            <Card className="shadow-sm border-0 bg-card/50 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle className="text-lg font-bold text-slate-800">Most Frequent Refills</CardTitle>
                    <CardDescription>Vehicles with the highest number of transaction events</CardDescription>
                </CardHeader>
                <CardContent className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart layout="vertical" data={topFreqVehicles} margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chart.grid} strokeOpacity={0.7} />
                            <XAxis type="number" tick={{ fontSize: AXIS.tickSize, fill: chart.axis }} />
                            <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: AXIS.tickSize, fill: chart.axis }} />
                            <Tooltip
                                cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                            />
                            <Bar dataKey="value" name="Refills" fill={chart.petrol} radius={[0, 4, 4, 0]} barSize={20} />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Top Cost Centres */}
            <Card className="shadow-sm border-0 bg-card/50 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle className="text-lg font-bold text-slate-800">Top Fueling Cost Centres</CardTitle>
                    <CardDescription>Departments consuming the most fleet resources</CardDescription>
                </CardHeader>
                <CardContent className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart layout="vertical" data={topCostCentres} margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chart.grid} strokeOpacity={0.7} />
                            <XAxis type="number" tick={{ fontSize: AXIS.tickSize, fill: chart.axis }} />
                            <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: AXIS.tickSize, fill: chart.axis }} />
                            <Tooltip
                                cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                formatter={(value: any) => [`${Number(value).toLocaleString()} L`, 'Volume']}
                            />
                            <Bar dataKey="value" name="Volume" fill={chart.petrol} radius={[0, 4, 4, 0]} barSize={20} />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
}
