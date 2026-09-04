import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import type { FuelForecast } from "@/lib/fuel-flow";

const fmtL = (n: number) => `${Math.round(n).toLocaleString()} L`;
const fmtDate = (d: Date | null) =>
    d ? d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

/**
 * Per fuel type, not per tank: the delivery report carries no tank, and the
 * receipts that do only cover four of twelve months.
 */
export function ReplenishmentForecast({
    forecasts,
    leadTimeDays,
    latestIssueDate,
    latestDeliveryDate,
}: {
    forecasts: FuelForecast[];
    leadTimeDays: number | null;
    latestIssueDate: string | null;
    latestDeliveryDate: Date | null;
}) {
    const anyStale = forecasts.some(f => f.status === "stale");

    return (
        <Card className="monumental-card">
            <CardHeader>
                <CardTitle>Replenishment forecast</CardTitle>
                <CardDescription>
                    How long a typical delivery lasts at the measured burn rate.
                    {leadTimeDays !== null && (
                        <> Orders reach the tank after about <span className="font-semibold text-foreground">{leadTimeDays} days</span>, so “order by” allows for that.</>
                    )}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {anyStale && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-xs">
                        <AlertTriangle className="h-3.5 w-3.5 inline mr-1.5 text-amber-600" />
                        Delivery records stop at <span className="font-semibold">{fmtDate(latestDeliveryDate)}</span>, while fuel
                        issues continue to <span className="font-semibold">{latestIssueDate ?? "—"}</span>. The forecast is paused
                        rather than reported as overdue — the silence is almost certainly missing delivery data, not an empty tank.
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                                <th className="py-2 pr-3 font-bold">Fuel</th>
                                <th className="py-2 pr-3 font-bold text-right">Burn rate</th>
                                <th className="py-2 pr-3 font-bold text-right">Typical delivery</th>
                                <th className="py-2 pr-3 font-bold text-right">Cycle</th>
                                <th className="py-2 pr-3 font-bold">Last delivery</th>
                                <th className="py-2 font-bold text-right">Next due</th>
                            </tr>
                        </thead>
                        <tbody>
                            {forecasts.map(f => (
                                <tr key={f.fuelType} className="border-b border-border/50 last:border-0">
                                    <td className="py-2.5 pr-3 font-bold text-foreground">{f.fuelType}</td>
                                    <td className="py-2.5 pr-3 text-right font-mono">{fmtL(f.burnLitresPerDay)}/d</td>
                                    <td className="py-2.5 pr-3 text-right font-mono">{fmtL(f.avgDeliveryLitres)}</td>
                                    <td className="py-2.5 pr-3 text-right font-mono">
                                        {f.cycleDays ? `${f.cycleDays.toFixed(1)} d` : "—"}
                                        {f.observedGapDays !== null && (
                                            <span className="block text-[10px] text-muted-foreground font-sans">
                                                observed {f.observedGapDays.toFixed(1)} d
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-2.5 pr-3 text-muted-foreground">{fmtDate(f.lastDelivery)}</td>
                                    <td className="py-2.5 text-right">
                                        {f.status === "ok" ? (
                                            <>
                                                <span className="font-semibold text-foreground">{fmtDate(f.nextDue)}</span>
                                                {f.orderBy && (
                                                    <span className="block text-[10px] text-muted-foreground">
                                                        order by {fmtDate(f.orderBy)}
                                                    </span>
                                                )}
                                            </>
                                        ) : f.status === "stale" ? (
                                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200">
                                                <HelpCircle className="h-3 w-3 mr-1" /> Awaiting data
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-muted-foreground">
                                                Too few deliveries
                                            </Badge>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <p className="text-[11px] text-muted-foreground">
                    <CheckCircle2 className="h-3 w-3 inline mr-1 text-emerald-600" />
                    Cycle is the typical delivery divided by the measured burn rate. It is shown against the observed gap between
                    deliveries as a cross-check — the two agree closely, which is what gives the figure its confidence. A true
                    “days to empty” is not derivable: recorded deliveries do not span the whole issue history, so live tank
                    stock is unknown.
                </p>
            </CardContent>
        </Card>
    );
}
