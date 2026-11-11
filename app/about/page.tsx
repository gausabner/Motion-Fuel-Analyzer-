import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicHeader } from "@/components/PublicHeader";

const SECTIONS = [
    {
        title: "What goes in",
        body: "The fuel system's own exports: fuel issues to vehicles and plant, and fuel receipts into the bulk tanks. Files are checked on upload and rows already loaded are rejected, so a report uploaded twice cannot double the figures.",
    },
    {
        title: "What comes out",
        body: "A dashboard that states the month in a sentence, a worklist of fills that broke a rule, consumption for every unit and cost centre, a period-against-period comparison, and receipts set against issues. Every table exports to CSV and every report to PDF.",
    },
    {
        title: "How a fill gets flagged",
        body: "By fixed rules anyone can read: a second fill the same day with almost no distance driven, a fill far larger than the unit has ever taken, fuel issued with no distance since the last fill, consumption at more than twice the median for its fuel type, and odometer readings that are missing or run backwards.",
    },
    {
        title: "What it will not claim",
        body: "The reports carry no tank dips, no time of day and no vehicle capacities. So stock positions are book figures, after-hours fills are not checked, and \"too large\" means larger than that unit's own record. Where the data cannot support a number, the page says so instead of estimating.",
    },
    {
        title: "Who sees what",
        body: "Accounts are approved by an administrator. Everyone approved can read the analysis; uploading reports, mapping vote codes to cost centres and managing users are limited by role.",
    },
];

export default function AboutPage() {
    return (
        <div className="flex min-h-dvh flex-col">
            <PublicHeader backLink />
            <main className="mx-auto w-full max-w-[760px] flex-1 px-4 pb-20 pt-8 sm:px-6">
                <div className="route-enter">
                    <h1 className="text-[clamp(2rem,4.6vw,3rem)] font-semibold leading-[1.06] tracking-[-0.03em] text-balance">How Motion Fuel Analyzer works</h1>
                    <p className="mt-4 max-w-[60ch] text-[17px] leading-relaxed text-muted-foreground">
                        It is an accounting tool for fuel. It shows where the litres went and which records need a person to look at them.
                    </p>
                </div>
                <div className="stagger-tiles mt-9 flex flex-col gap-3.5">
                    {SECTIONS.map(s => (
                        <section key={s.title} className="monumental-card">
                            <h2 className="text-base font-semibold">{s.title}</h2>
                            <p className="mt-1.5 max-w-[68ch] text-[14.5px] leading-relaxed text-muted-foreground">{s.body}</p>
                        </section>
                    ))}
                </div>
                <div className="mt-8">
                    <Link href="/auth/signin"><Button className="h-11 px-6 text-sm">Sign in <ArrowRight className="ml-1.5 h-4 w-4" /></Button></Link>
                </div>
            </main>
        </div>
    );
}
