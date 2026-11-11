import { PageHeader } from "@/components/dashboard/PageHeader";
import { PeriodControl } from "@/components/fuel/PeriodControl";
import { ExceptionsTable } from "@/components/fuel/ExceptionsTable";
import { getExceptions, summariseExceptions } from "@/lib/fuel-insights";
import { rangeLabel } from "@/lib/overview";
import { resolvePeriod } from "@/lib/periods";
import { fmtLitres } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ExceptionsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
    const p = await resolvePeriod("/dashboard/exceptions", await searchParams);
    const rows = await getExceptions(p.fromDay, p.toDay);
    const s = summariseExceptions(rows);

    return (
        <div className="flex flex-col gap-3.5">
            <PageHeader title="Exceptions" scope={[rangeLabel(p.fromDay, p.toDay), `${s.open} open · ${s.high} high`, `${fmtLitres(s.litresAtRisk)} in question`]}>
                <PeriodControl periods={p.periods} value={p.period} from={p.from} to={p.to} />
            </PageHeader>

            <section className="monumental-card" aria-label="Summary">
                <p className="bigline">
                    {s.open === 0 ? "Nothing is waiting for review in this period." : `${s.open} ${s.open === 1 ? "fill needs" : "fills need"} a second look${s.high ? `, ${s.high} of them urgently` : ""}.`}
                    <small>
                        Each row is raised by a fixed rule on the recorded fills: a second fill the same day with almost no distance driven, a fill
                        far larger than the unit has ever taken, fuel issued with no distance since the last fill, consumption at more than twice
                        the median for its fuel type, and odometer readings that are missing or run backwards. After-hours fills are not checked,
                        because the reports carry no usable time of day.
                    </small>
                </p>
            </section>

            <ExceptionsTable rows={rows} />
        </div>
    );
}
