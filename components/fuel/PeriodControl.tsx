"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DateRange } from "react-day-picker";
import { Seg } from "@/components/ui/Seg";
import { DateRangePicker } from "@/components/dashboard/DateRangePicker";

/**
 * Period switch for briefing-style pages: three presets anchored on the latest
 * month that has data, plus a custom range. Choosing either navigates at once.
 */
export function PeriodControl({ periods, value, from, to }: {
    periods: { key: string; label: string; href: string }[];
    value: string;
    from?: string; to?: string;
}) {
    const router = useRouter(), pathname = usePathname(), sp = useSearchParams();
    const [range, setRange] = useState<DateRange | undefined>(from && to ? { from: new Date(from), to: new Date(to) } : undefined);
    const pick = (r: DateRange | undefined) => {
        setRange(r);
        if (r?.from && r?.to) {
            const p = new URLSearchParams(sp.toString());
            p.set("from", r.from.toISOString()); p.set("to", r.to.toISOString());
            router.push(`${pathname}?${p.toString()}`);
        }
    };
    return (
        <>
            <Seg label="Period" value={value} items={periods.map(p => ({ key: p.key, label: p.label, href: p.href }))} />
            <DateRangePicker dateRange={range} onDateChange={pick} />
        </>
    );
}
