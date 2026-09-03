"use client";

import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";

// Period A = sky, Period B = deep blue (matches the app data palette).
const A_COLOR = "#93C5FD";
const B_COLOR = "#1D4ED8";

export function ComparisonChart({
    data,
    aLabel,
    bLabel,
}: {
    data: { name: string; a: number; b: number }[];
    aLabel: string;
    bLabel: string;
}) {
    // Truncate long labels for the axis; full name shows in the tooltip.
    const short = (s: string) => (s.length > 22 ? s.slice(0, 21) + "…" : s);
    const chartData = data.map(d => ({ ...d, label: short(d.name) }));
    const height = Math.max(200, chartData.length * 44 + 40);

    return (
        <div style={{ width: "100%", height }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }} barGap={2}>
                    <CartesianGrid horizontal={false} stroke="#F1F5F9" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false}
                        tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
                    <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 10, fill: "#334155" }} axisLine={false} tickLine={false} interval={0} />
                    <Tooltip
                        contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(15,23,42,0.25)", backgroundColor: "#0F172A", color: "#F8FAFC" }}
                        labelStyle={{ color: "#94A3B8", fontSize: "11px" }}
                        itemStyle={{ fontSize: "12px", fontWeight: 700 }}
                        formatter={(value: any, name: any) => [`${Number(value).toLocaleString()} L`, String(name)]}
                        labelFormatter={(_: any, payload: any) => payload?.[0]?.payload?.name ?? ""}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px", fontWeight: 600 }} />
                    <Bar dataKey="a" name={aLabel} fill={A_COLOR} radius={[0, 3, 3, 0]} maxBarSize={16} />
                    <Bar dataKey="b" name={bLabel} fill={B_COLOR} radius={[0, 3, 3, 0]} maxBarSize={16} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
