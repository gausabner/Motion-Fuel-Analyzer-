import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicHeader } from "@/components/PublicHeader";
import { MotionLogo } from "@/components/brand/Logo";

const POINTS = [
    { title: "Words before charts", body: "Each page opens with a sentence that says what changed, then shows the evidence underneath." },
    { title: "Two clicks to the vehicle", body: "Any unit number opens that vehicle's fills, its usual consumption and anything a rule has flagged." },
    { title: "Issues and receipts kept apart", body: "Fuel issued to vehicles and fuel received into storage are compared, never added together." },
];

export default function HomePage() {
    return (
        <div className="flex min-h-dvh flex-col">
            <PublicHeader />
            <main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col justify-center gap-10 px-4 pb-16 pt-6 sm:px-6">
                <section className="route-enter max-w-[720px]">
                    <MotionLogo className="h-auto w-[260px] max-w-full text-foreground" />
                    <h1 className="mt-9 text-[clamp(2.25rem,5.4vw,3.75rem)] font-semibold leading-[1.04] tracking-[-0.03em] text-balance">
                        Every litre the fleet takes, accounted for.
                    </h1>
                    <p className="mt-5 max-w-[56ch] text-[17px] leading-relaxed text-muted-foreground">
                        Motion Fuel Analyzer reads the municipality's fuel issue and receipt reports and turns them into a monthly briefing:
                        what was used, who used it, what it cost, and which fills deserve a second look.
                    </p>
                    <div className="mt-7 flex flex-wrap items-center gap-2.5">
                        <Link href="/auth/signin"><Button className="h-11 px-6 text-sm">Sign in <ArrowRight className="ml-1.5 h-4 w-4" /></Button></Link>
                        <Link href="/about" className="tab !py-[11px]">How it works</Link>
                    </div>
                </section>

                <dl className="grid max-w-[920px] gap-x-10 border-t border-border md:grid-cols-3">
                    {POINTS.map(p => (
                        <div key={p.title} className="border-b border-border py-5 md:border-b-0">
                            <dt className="text-[15px] font-semibold">{p.title}</dt>
                            <dd className="mt-1.5 text-[13.5px] leading-normal text-muted-foreground">{p.body}</dd>
                        </div>
                    ))}
                </dl>
            </main>
        </div>
    );
}
