"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import type { FlowBucket, Granularity } from "@/lib/fuel-flow";

const GRANULARITIES: Granularity[] = ["daily", "monthly", "yearly"];
const fmtL = (n: number) => `${Math.round(n).toLocaleString()} L`;

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
                            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} width={44} />
                            <Tooltip
                                formatter={(value: any, name: any) => [fmtL(Number(value)), name]}
                                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                            />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Bar dataKey="Issued" fill="#378ADD" radius={[2, 2, 0, 0]} maxBarSize={26} />
                            <Bar dataKey="Received" fill="#1D9E75" radius={[2, 2, 0, 0]} maxBarSize={26} />
                            <Line type="monotone" dataKey="Received" stroke="#0F6E56" dot={false} strokeWidth={1} legendType="none" />
                        </ComposedChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}
