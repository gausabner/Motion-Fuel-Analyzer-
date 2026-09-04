"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell
} from "recharts";

interface RankingProps {
    topFreqVehicles: { name: string; value: number }[];
    topCostCentres: { name: string; value: number }[];
}

const PALETTE = {
    purple: '#7c3aed',
    turquoise: '#14b8a6',
    coral: '#f43f5e',
    grid: '#e2e8f0',
    text: '#64748b'
};

export function FleetRankings({ topFreqVehicles, topCostCentres }: RankingProps) {
    return (
        <div className="grid gap-6 md:grid-cols-2">
            {/* Top Frequent Consumers */}
            <Card className="shadow-sm border-0 bg-card/50 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle className="text-lg font-bold text-slate-800">Most Frequent Refills</CardTitle>
                    <CardDescription>Vehicles with the highest number of transaction events</CardDescription>
                </CardHeader>
                <CardContent className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart layout="vertical" data={topFreqVehicles} margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={PALETTE.grid} />
                            <XAxis type="number" tick={{ fontSize: 11, fill: PALETTE.text }} />
                            <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: PALETTE.text }} />
                            <Tooltip
                                cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                            />
                            <Bar dataKey="value" name="Refills" fill={PALETTE.purple} radius={[0, 4, 4, 0]} barSize={20}>
                                {topFreqVehicles.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={index < 3 ? PALETTE.coral : PALETTE.purple} />
                                ))}
                            </Bar>
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
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={PALETTE.grid} />
                            <XAxis type="number" tick={{ fontSize: 11, fill: PALETTE.text }} />
                            <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: PALETTE.text }} />
                            <Tooltip
                                cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                formatter={(value: any) => [`${Number(value).toLocaleString()} L`, 'Volume']}
                            />
                            <Bar dataKey="value" name="Volume" fill={PALETTE.turquoise} radius={[0, 4, 4, 0]} barSize={20}>
                                {topCostCentres.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={index < 3 ? PALETTE.coral : PALETTE.turquoise} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
}
