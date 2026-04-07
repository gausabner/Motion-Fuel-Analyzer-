import { cn } from "@/lib/utils";

interface StatusProgressWidgetProps {
    petrolPercentage: number;
    dieselPercentage: number;
    className?: string;
}

export function StatusProgressWidget({ petrolPercentage, dieselPercentage, className }: StatusProgressWidgetProps) {
    return (
        <div className={cn("monumental-card col-span-full", className)}>
            <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-6">Fuel Type Split</h3>

            <div className="flex items-end justify-between mb-2">
                <div>
                    <span className="text-2xl font-bold text-black">{petrolPercentage}%</span>
                    <span className="text-xs font-bold text-zinc-400 ml-2 uppercase">Petrol</span>
                </div>
                <div className="text-right">
                    <span className="text-2xl font-bold text-black">{dieselPercentage}%</span>
                    <span className="text-xs font-bold text-zinc-400 ml-2 uppercase">Diesel</span>
                </div>
            </div>

            <div className="h-4 w-full bg-zinc-100 rounded-sm overflow-hidden flex">
                <div
                    className="h-full bg-black"
                    style={{ width: `${petrolPercentage}%` }}
                />
                <div
                    className="h-full bg-yellow-400"
                    style={{ width: `${dieselPercentage}%` }}
                />
            </div>

            <div className="mt-4 flex justify-between text-xs font-medium text-zinc-400">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-black rounded-full"></div>
                    <span>Petrol Volume</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                    <span>Diesel Volume</span>
                </div>
            </div>
        </div>
    );
}
