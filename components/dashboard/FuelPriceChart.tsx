"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useChartTheme, AXIS, tooltipStyles } from "@/lib/chart-theme";
import {
    LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import type { FlowBucket } from "@/lib/fuel-flow";

/**
 * Purchase price against issue price, per litre. The gap is the point: where the
 * issue line sits below the purchase line, fuel is being charged out for less
 * than it cost to buy.
 */
export function FuelPriceChart({ data, currency = "N$" }: { data: FlowBucket[]; currency?: string }) {
    const chart = useChartTheme();
    const tip = tooltipStyles(chart);
    const rows = data
        .filter(b => b.receivedLitres > 0 || b.issuedLitres > 0)
        .map(b => ({
            name: b.key,
            Purchase: b.receivedLitres > 0 ? Number((b.receivedCost / b.receivedLitres).toFixed(2)) : null,
            Issue: b.issuedLitres > 0 ? Number((b.issuedValue / b.issuedLitres).toFixed(2)) : null,
        }));

    const underRecovered = rows.filter(r => r.Purchase !== null && r.Issue !== null && r.Issue < r.Purchase).length;

    return (
        <Card className="monumental-card">
            <CardHeader>
                <CardTitle>Price per litre — bought vs charged</CardTitle>
                <CardDescription>
                    What fuel cost to buy, against what the fleet was charged for it.
                    {underRecovered > 0 && (
                        <span className="block mt-1 text-warn font-medium">
                            {underRecovered} period{underRecovered === 1 ? "" : "s"} where fuel was issued below its purchase price.
                        </span>
                    )}
                </CardDescription>
            </CardHeader>
            <CardContent>
                {rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">No pricing data in this period.</p>
                ) : (
                    <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                            <CartesianGrid vertical={false} stroke={chart.grid} strokeOpacity={0.7} />
                            <XAxis dataKey="name" tick={{ fontSize: AXIS.tickSize, fill: chart.axis }} stroke={chart.grid} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
                            <YAxis
                                tick={{ fontSize: AXIS.tickSize, fill: chart.axis }}
                                axisLine={false}
                                tickLine={false}
                                domain={["auto", "auto"]}
                                tickFormatter={(v) => `${currency}${Number(v).toFixed(0)}`}
                                width={52}
                            />
                            <Tooltip
                                formatter={(value: any, name: any) => [`${currency}${Number(value).toFixed(2)}/L`, name]}
                                contentStyle={tip.contentStyle}
                                labelStyle={tip.labelStyle}
                                itemStyle={tip.itemStyle}
                                cursor={tip.cursor}
                            />
                            <Legend wrapperStyle={{ fontSize: 12, color: chart.axis }} iconType="plainline" iconSize={14} />
                            {/* Purchase is what the depot paid, Issue what the fleet was
                                charged — two measures, so two hues from the shared set. */}
                            <Line type="monotone" dataKey="Purchase" stroke={chart.diesel} strokeWidth={2} dot={false} connectNulls />
                            <Line type="monotone" dataKey="Issue" stroke={chart.petrol} strokeWidth={2} dot={false} connectNulls />
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}
