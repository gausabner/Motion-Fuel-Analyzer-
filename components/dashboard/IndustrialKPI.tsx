import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface IndustrialKPIProps {
    label: string;
    value: string | number;
    icon: LucideIcon;
    subValue?: string;
    /** Percentage change. `sentiment` decides colour: consumption/cost rising is usually 'bad'. */
    trend?: { value: number; direction: 'up' | 'down'; sentiment?: 'good' | 'bad' | 'neutral'; label?: string };
    accent?: boolean;
    className?: string;
    onClick?: () => void;
    bottomTrend?: boolean;
}

function TrendBadge({ trend }: { trend: NonNullable<IndustrialKPIProps['trend']> }) {
    const sentiment = trend.sentiment ?? 'neutral';
    return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className={cn(
                "text-xs font-bold px-1.5 py-0.5 rounded-md inline-flex items-center gap-0.5",
                sentiment === 'good' && "bg-emerald-100 text-emerald-700",
                sentiment === 'bad' && "bg-red-100 text-red-700",
                sentiment === 'neutral' && "bg-muted text-muted-foreground",
            )}>
                {trend.direction === 'up' ? '▲' : '▼'} {trend.value}%
            </span>
            {trend.label && <span className="text-xs text-muted-foreground">{trend.label}</span>}
        </span>
    );
}

export function IndustrialKPI({ label, value, icon: Icon, subValue, trend, accent, className, onClick, bottomTrend }: IndustrialKPIProps) {
    // A card that opens a detail modal is a button, not a clickable div. As a div
    // it took no focus and no Enter/Space, so the four dashboard drill-downs were
    // reachable by mouse only. The element only becomes interactive when there is
    // somewhere to go, so static KPIs stay out of the tab order.
    const Root = onClick ? "button" : "div";
    const interactive = onClick
        ? {
            type: "button" as const,
            onClick,
            "aria-label": `${label}: ${value}. View breakdown`,
        }
        : {};

    return (
        <Root
            {...interactive}
            className={cn(
                "monumental-card group relative overflow-hidden @container",
                "[transition:border-color_180ms_ease,box-shadow_180ms_ease,transform_160ms_var(--ease-out-soft)]",
                "[@media(hover:hover){&:hover}]:border-primary/50",
                accent && "border-primary/40",
                onClick && [
                    "cursor-pointer w-full text-left",
                    // These open a drill-down modal, so the press has to be felt
                    // before the dialog has mounted anything.
                    "active:scale-[0.985] motion-reduce:active:scale-100",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                ],
                className
            )}>
            <div className="flex flex-col h-full justify-between relative z-10 gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center shrink-0">
                        <Icon className="w-[18px] h-[18px] text-primary" />
                    </div>
                    <div className="min-w-0">
                        <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest text-balance">{label}</span>
                        {subValue && (
                            <span className="block text-xs text-muted-foreground/80 line-clamp-2">{subValue}</span>
                        )}
                    </div>
                </div>

                <div>
                    <div className="flex items-baseline gap-2 flex-wrap max-w-full">
                        <div className="text-lg @[170px]:text-xl @[230px]:text-2xl @[310px]:text-3xl font-extrabold tracking-tight text-foreground tabular-nums break-words">
                            {value}
                        </div>
                        {trend && !bottomTrend && <TrendBadge trend={trend} />}
                    </div>
                    {trend && bottomTrend && (
                        <div className="mt-2">
                            <TrendBadge trend={trend} />
                        </div>
                    )}
                </div>
            </div>
        </Root>
    );
}
