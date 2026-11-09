"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    ComposedChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import type { FlowBucket, Granularity } from "@/lib/fuel-flow";
import { fmtLitres } from "@/lib/format";
import { useChartTheme, AXIS, axisLitres, tooltipStyles } from "@/lib/chart-theme";

const GRANULARITIES: Granularity[] = ["daily", "monthly", "yearly"];

/**
 * Issued (out to vehicles) against received (deliveries in). The two series are
 * shown side by side and never stacked or summed — they are separate flows, and
 * a month with deliveries but few issues is a real, meaningful pattern.
 */
export function FlowChart({
    data,
    granularity,
}: {
    data: FlowBucket[];
    granularity: Granularity;
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const chart = useChartTheme();
    const tip = tooltipStyles(chart);

    const setGranularity = (g: Granularity) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("granularity", g);
        router.push(`?${params.toString()}`, { scroll: false });
    };

    const rows = data.map(b => ({
        name: b.key,
        Issued: Math.round(b.issuedLitres),
        Received: Math.round(b.receivedLitres),
        deliveries: b.deliveryCount,
    }));

    // Periods where fuel went out but no delivery is on record — a gap worth
    // naming rather than drawing as a confident zero.
    const gapPeriods = data.filter(b => b.issuedLitres > 0 && b.receivedLitres === 0).length;

    return (
        <Card className="monumental-card">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                    <CardTitle>Issued vs received over time</CardTitle>
                    <CardDescription>
                        Fuel issued to vehicles against deliveries received into storage.
                        {gapPeriods > 0 && (
                            <span className="block mt-1 text-amber-600 font-medium">
                                {gapPeriods} {granularity === "daily" ? "day" : granularity === "monthly" ? "month" : "year"}
                                {gapPeriods === 1 ? "" : "s"} show issues with no delivery on record — a reporting gap, not zero stock.
                            </span>
                        )}
                    </CardDescription>
                </div>
                <div className="flex gap-1.5 shrink-0">
                    {GRANULARITIES.map(g => (
                        <Button
                            key={g}
                            variant={g === granularity ? "default" : "outline"}
                            onClick={() => setGranularity(g)}
                            className="h-8 px-3 text-xs capitalize"
                        >
                            {g}
                        </Button>
                    ))}
                </div>
            </CardHeader>
            <CardContent>
                {rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">No data in this period.</p>
                ) : (
                    <ResponsiveContainer width="100%" height={320}>
                        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                            <CartesianGrid vertical={false} stroke={chart.grid} strokeOpacity={0.7} />
                            <XAxis dataKey="name" tick={{ fontSize: AXIS.tickSize, fill: chart.axis }} stroke={chart.grid} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
                            <YAxis tick={{ fontSize: AXIS.tickSize, fill: chart.axis }} axisLine={false} tickLine={false} tickFormatter={axisLitres} width={52} />
                            <Tooltip
                                formatter={(value: any, name: any) => [fmtLitres(Number(value)), name]}
                                contentStyle={tip.contentStyle}
                                labelStyle={tip.labelStyle}
                                itemStyle={tip.itemStyle}
                                cursor={tip.bandCursor}
                            />
                            <Legend wrapperStyle={{ fontSize: 12, color: chart.axis }} iconType="square" iconSize={9} />
                            {/* Issues are slot 1 and receipts slot 3 everywhere in the app,
                                so the same quantity keeps its colour across pages. The
                                Line that used to sit on top of Received drew the same
                                series twice — one encoding is enough. */}
                            <Bar dataKey="Issued" fill={chart.petrol} radius={[3, 3, 0, 0]} maxBarSize={26} />
                            <Bar dataKey="Received" fill={chart.received} radius={[3, 3, 0, 0]} maxBarSize={26} />
                        </ComposedChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}
