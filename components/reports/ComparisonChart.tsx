"use client";

import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";
import { useChartTheme, AXIS, tooltipStyles } from "@/lib/chart-theme";


export function ComparisonChart({
    data,
    aLabel,
    bLabel,
}: {
    data: { name: string; a: number; b: number }[];
    aLabel: string;
    bLabel: string;
}) {
    const chart = useChartTheme();
    const tip = tooltipStyles(chart);

    // Truncate long labels for the axis; full name shows in the tooltip.
    const short = (s: string) => (s.length > 22 ? s.slice(0, 21) + "…" : s);
    const chartData = data.map(d => ({ ...d, label: short(d.name) }));
    const height = Math.max(200, chartData.length * 44 + 40);

    return (
        <div style={{ width: "100%", height }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }} barGap={2}>
                    <CartesianGrid horizontal={false} stroke={chart.grid} strokeOpacity={0.7} />
                    <XAxis type="number" tick={{ fontSize: AXIS.tickSize, fill: chart.axis }} axisLine={false} tickLine={false}
                        tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
                    <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: AXIS.tickSize, fill: chart.axis }} axisLine={false} tickLine={false} interval={0} />
                    <Tooltip
                        contentStyle={tip.contentStyle}
                        labelStyle={tip.labelStyle}
                        itemStyle={{ fontSize: "12px", fontWeight: 700 }}
                        formatter={(value: any, name: any) => [`${Number(value).toLocaleString()} L`, String(name)]}
                        labelFormatter={(_: any, payload: any) => payload?.[0]?.payload?.name ?? ""}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px", fontWeight: 600 }} />
                    <Bar dataKey="a" name={aLabel} fill={chart.petrol} radius={[0, 3, 3, 0]} maxBarSize={16} />
                    <Bar dataKey="b" name={bLabel} fill={chart.diesel} radius={[0, 3, 3, 0]} maxBarSize={16} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
