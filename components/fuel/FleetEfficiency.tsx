"use client";

import { ChartCard, DotStrip, type StripClass } from "./charts";
import { useVehiclePanel } from "./VehiclePanel";
import type { UnitEfficiency } from "@/lib/fuel-insights";

/**
 * Consumption by fuel class: one dot per vehicle, a black tick at the class
 * median, and a diamond for each unit burning more than twice that median.
 * Only units with enough odometer evidence are plotted; the rest are counted
 * in the caption rather than guessed at.
 */
export function FleetEfficiency({ units, medians }: { units: UnitEfficiency[]; medians: Record<string, number> }) {
    const { open } = useVehiclePanel();
    const measured = units.filter(u => u.l100 != null);
    const unmeasured = units.length - measured.length;

    const classes: StripClass[] = Object.keys(medians)
        .sort()
        .map(name => ({
            name,
            median: medians[name],
            values: measured
                .filter(u => u.fuel === name)
                .map(u => ({ unit: u.unit, v: u.l100 as number, outlier: (u.ratio ?? 0) >= 2 }))
                .sort((a, b) => b.v - a.v),
        }))
        .filter(c => c.values.length > 0);

    const outliers = measured.filter(u => (u.ratio ?? 0) >= 2).sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0));
    // Scale to the 95th percentile so a single broken odometer cannot flatten every other dot against the axis.
    const sorted = measured.map(u => u.l100 as number).sort((a, b) => a - b);
    const p95 = sorted.length ? sorted[Math.floor((sorted.length - 1) * 0.95)] : 0;
    const max = Math.max(20, Math.ceil((p95 * 1.15) / 10) * 10);

    if (classes.length === 0) {
        return (
            <section className="monumental-card">
                <div className="card-h"><h2>Consumption by fuel type</h2></div>
                <p className="text-[13px] text-muted-foreground">
                    No unit in this selection has two usable odometer readings, so litres per 100 km cannot be worked out. Volumes below are unaffected.
                </p>
            </section>
        );
    }

    return (
        <ChartCard
            title="Consumption by fuel type"
            sub={`${measured.length} units with usable odometer readings · ${unmeasured} without`}
            legend={
                <>
                    <span><i className="sw" style={{ background: "var(--brand)", opacity: 0.42 }} />One vehicle</span>
                    <span><i className="sw" style={{ background: "var(--primary)" }} />Class median</span>
                    <span><i className="sw dia" />More than twice the median</span>
                </>
            }
            table={{
                head: ["Vehicle", "Fuel", "L/100 km", "Class median", "Times median"],
                rows: (outliers.length ? outliers : measured.slice(0, 20)).map(u => [
                    u.unit, u.fuel, (u.l100 as number).toFixed(1), u.classMedian?.toFixed(1) ?? "—", u.ratio ? `${u.ratio.toFixed(1)}×` : "—",
                ]),
            }}
        >
            <p className="bigline">
                {outliers.length === 0
                    ? "No unit is burning more than twice the median for its fuel type."
                    : `${outliers.length} ${outliers.length === 1 ? "unit burns" : "units burn"} more than twice the median for ${outliers.length === 1 ? "its" : "their"} fuel type.`}
                <small>
                    Worked out from consecutive odometer readings, assuming the odometer is recorded in tenths of a kilometre. A very high figure
                    is as likely to be a mistyped reading as heavy use, so open the vehicle before drawing a conclusion.
                </small>
            </p>
            <DotStrip classes={classes} max={max} onOpen={open} ariaLabel="Litres per 100 km for each vehicle, grouped by fuel type" />
        </ChartCard>
    );
}
