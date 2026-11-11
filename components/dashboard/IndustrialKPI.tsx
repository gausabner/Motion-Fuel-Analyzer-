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

/**
 * KPI tile: label and an ink icon disc, the figure, then a delta pill that
 * says whether the change is good or bad and against what. When the tile opens
 * a breakdown it is a real button, so it takes focus and Enter.
 */
export function IndustrialKPI({ label, value, icon: Icon, subValue, trend, className, onClick }: IndustrialKPIProps) {
    const Root = onClick ? "button" : "div";
    const interactive = onClick
        ? { type: "button" as const, onClick, "aria-label": `${label}: ${value}. View breakdown` }
        : {};
    const tone = trend ? ({ good: "good", bad: "bad", neutral: "flat" } as const)[trend.sentiment ?? "neutral"] : null;

    return (
        <Root {...interactive} className={cn("kpi", className)}>
            <div className="kpi-h">
                <span className="text-balance">{label}</span>
                <span className="disc"><Icon aria-hidden="true" /></span>
            </div>
            <div className="kpi-v">{value}</div>
            {subValue && <p className="ctx line-clamp-2">{subValue}</p>}
            {trend && tone && (
                <div className="kpi-f">
                    <span className={`delta ${tone}`}>{trend.direction === "up" ? "+" : "−"}{trend.value}%</span>
                    {trend.label && <span className="ctx">{trend.label}</span>}
                </div>
            )}
        </Root>
    );
}
