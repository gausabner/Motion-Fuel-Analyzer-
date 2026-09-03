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
                "text-[10px] font-bold px-1.5 py-0.5 rounded-md inline-flex items-center gap-0.5",
                sentiment === 'good' && "bg-emerald-100 text-emerald-700",
                sentiment === 'bad' && "bg-red-100 text-red-700",
                sentiment === 'neutral' && "bg-muted text-muted-foreground",
            )}>
                {trend.direction === 'up' ? '▲' : '▼'} {trend.value}%
            </span>
            {trend.label && <span className="text-[10px] text-muted-foreground">{trend.label}</span>}
        </span>
    );
}

export function IndustrialKPI({ label, value, icon: Icon, subValue, trend, accent, className, onClick, bottomTrend }: IndustrialKPIProps) {
    return (
        <div
            onClick={onClick}
            className={cn(
                "monumental-card group hover:border-primary/50 transition-colors duration-300 relative overflow-hidden",
                accent && "border-primary/40",
                onClick && "cursor-pointer",
                className
            )}>
            <div className="flex flex-col h-full justify-between relative z-10 gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center shrink-0">
                        <Icon className="w-[18px] h-[18px] text-primary" />
                    </div>
                    <div className="min-w-0">
                        <span className="block text-[10px] md:text-xs font-semibold text-muted-foreground uppercase tracking-widest truncate">{label}</span>
                        {subValue && (
                            <span className="block text-[10px] md:text-[11px] text-muted-foreground/80 truncate">{subValue}</span>
                        )}
                    </div>
                </div>

                <div>
                    <div className="flex items-baseline gap-2 flex-wrap max-w-full">
                        <div className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-extrabold tracking-tight text-foreground tabular-nums break-all">
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
        </div>
    );
}
