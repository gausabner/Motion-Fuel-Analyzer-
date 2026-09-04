import { cn } from "@/lib/utils";

interface StatusProgressWidgetProps {
    petrolPercentage: number;
    dieselPercentage: number;
    className?: string;
}

// Data palette: petrol = sky, diesel = deep blue (UI_Redesign_Plan.pdf §05)
export function StatusProgressWidget({ petrolPercentage, dieselPercentage, className }: StatusProgressWidgetProps) {
    return (
        <div className={cn("monumental-card col-span-full", className)}>
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-6">Fuel type split</h3>

            <div className="flex items-end justify-between mb-2">
                <div>
                    <span className="text-2xl font-extrabold tabular-nums text-[#60A5FA]">{petrolPercentage}%</span>
                    <span className="text-xs font-bold text-muted-foreground ml-2 uppercase">Petrol</span>
                </div>
                <div className="text-right">
                    <span className="text-2xl font-extrabold tabular-nums text-[#1D4ED8]">{dieselPercentage}%</span>
                    <span className="text-xs font-bold text-muted-foreground ml-2 uppercase">Diesel</span>
                </div>
            </div>

            <div className="h-3 w-full bg-muted rounded-full overflow-hidden flex">
                <div
                    className="h-full bg-[#60A5FA] rounded-l-full"
                    style={{ width: `${petrolPercentage}%` }}
                />
                <div
                    className="h-full bg-[#1D4ED8] rounded-r-full"
                    style={{ width: `${dieselPercentage}%` }}
                />
            </div>

            <div className="mt-4 flex justify-between text-xs font-medium text-muted-foreground">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-[#60A5FA] rounded-full"></div>
                    <span>Petrol volume</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-[#1D4ED8] rounded-full"></div>
                    <span>Diesel volume</span>
                </div>
            </div>
        </div>
    );
}
