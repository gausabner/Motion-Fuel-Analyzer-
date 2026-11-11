import { PageHeader } from "@/components/dashboard/PageHeader";
import { PeriodControl } from "@/components/fuel/PeriodControl";
import { ExceptionsTable } from "@/components/fuel/ExceptionsTable";
import { getExceptions, summariseExceptions } from "@/lib/fuel-insights";
import { rangeLabel } from "@/lib/overview";
import { resolvePeriod } from "@/lib/periods";
import Link from "next/link";
import { fmtLitres, multipleLabel } from "@/lib/format";
import { getRuleSettings } from "@/lib/rule-settings";

export const dynamic = "force-dynamic";

export default async function ExceptionsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
    const p = await resolvePeriod("/dashboard/exceptions", await searchParams);
    const rows = await getExceptions(p.fromDay, p.toDay);
    const s = summariseExceptions(rows);
    const r = await getRuleSettings();
    // The rule list is written from the live settings, so the page never describes a rule that is off.
    const active = [
        r.repeatFillEnabled && `a second fill the same day with under ${r.repeatFillMaxKm} km driven`,
        r.overCapacityEnabled && `a fill more than ${r.overCapacityFactor} times the unit's previous largest`,
        r.noDistanceEnabled && "fuel issued with no distance since the last fill",
        r.classOutlierEnabled && `consumption above ${multipleLabel(r.classOutlierMultiple)} the median for its fuel type`,
        r.odometerBackEnabled && "an odometer that runs backwards",
        r.odometerMissingEnabled && `an odometer missing on ${r.odometerMissingMinFills} or more fills`,
    ].filter(Boolean) as string[];

    return (
        <div className="flex flex-col gap-3.5">
            <PageHeader title="Exceptions" scope={[rangeLabel(p.fromDay, p.toDay), `${s.open} open · ${s.high} high`, `${fmtLitres(s.litresAtRisk)} in question`]}>
                <PeriodControl periods={p.periods} value={p.period} from={p.from} to={p.to} />
            </PageHeader>

            <section className="monumental-card" aria-label="Summary">
                <p className="bigline">
                    {s.open === 0 ? "Nothing is waiting for review in this period." : `${s.open} ${s.open === 1 ? "fill needs" : "fills need"} a second look${s.high ? `, ${s.high} of them urgently` : ""}.`}
                    <small>
                        {active.length === 0
                            ? "Every exception rule is switched off, so nothing is being raised. "
                            : `Each row is raised by a rule on the recorded fills: ${active.join("; ")}. `}
                        After-hours fills are not checked, because the reports carry no usable time of day.{" "}
                        <Link href="/dashboard/settings#exception-rules" className="lnk">Change the rules</Link>
                    </small>
                </p>
            </section>

            <ExceptionsTable rows={rows} />
        </div>
    );
}
