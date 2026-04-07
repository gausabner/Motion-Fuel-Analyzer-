import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface IndustrialKPIProps {
    label: string;
    value: string | number;
    icon: LucideIcon;
    subValue?: string;
    trend?: { value: number; direction: 'up' | 'down' };
    accent?: boolean;
    className?: string;
    onClick?: () => void;
    bottomTrend?: boolean;
}

export function IndustrialKPI({ label, value, icon: Icon, subValue, trend, accent, className, onClick, bottomTrend }: IndustrialKPIProps) {
    return (
        <div
            onClick={onClick}
            className={cn(
                "monumental-card group hover:border-black transition-colors duration-300 relative overflow-hidden",
                accent && "border-yellow-400 border-2",
                onClick && "cursor-pointer",
                className
            )}>
            <div className="flex flex-col h-full justify-between relative z-10">
                <div className="flex items-start justify-between mb-2">
                    <span className="text-[10px] md:text-xs font-bold text-zinc-500 uppercase tracking-widest truncate pr-2">{label}</span>
                    <Icon className={cn(
                        "w-4 h-4 md:w-5 md:h-5 group-hover:text-yellow-500 transition-colors shrink-0",
                        accent ? "text-black" : "text-black"
                    )} />
                </div>

                <div>
                    <div className="flex items-baseline gap-2 flex-wrap max-w-full">
                        <div className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-extrabold tracking-tight text-black mt-1 break-all">
                            {value}
                        </div>
                        {trend && !bottomTrend && (
                            <div className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-sm flex items-center whitespace-nowrap",
                                trend.direction === 'up' ? "bg-black text-white" : "bg-zinc-100 text-zinc-500"
                            )}>
                                {trend.direction === 'up' ? '+' : ''}{trend.value}%
                            </div>
                        )}
                    </div>

                    {trend && bottomTrend && (
                        <div className="mt-2">
                            <div className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-sm inline-flex items-center whitespace-nowrap",
                                trend.direction === 'up' ? "bg-black text-white" : "bg-zinc-100 text-zinc-500"
                            )}>
                                {trend.direction === 'up' ? '+' : ''}{trend.value}%
                            </div>
                        </div>
                    )}

                    {subValue && (
                        <div className="mt-1 text-[10px] md:text-xs font-bold text-zinc-400 uppercase tracking-wider">
                            {subValue}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
