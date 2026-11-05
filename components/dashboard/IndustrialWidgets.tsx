"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Fuel, Droplets, Wallet, CarFront } from "lucide-react";

interface IndustrialKPIProps {
    label: string;
    value: string;
    subValue?: string;
    trend?: { value: number; direction: 'up' | 'down' };
    icon: any;
    accent?: boolean; // If true, use Yellow background
}

export function IndustrialKPI({ label, value, subValue, trend, icon: Icon, accent = false }: IndustrialKPIProps) {
    return (
        <div className={cn(
            "monumental-card flex flex-col justify-between h-full min-h-[160px] transition-all hover:-translate-y-1 duration-300 overflow-hidden",
            accent ? "bg-accent border-accent" : "bg-card"
        )}>
            <div className="flex justify-between items-start">
                <div className={cn(
                    "p-2 rounded-lg",
                    accent ? "bg-accent text-primary" : "bg-muted text-foreground"
                )}>
                    <Icon className="h-5 w-5" />
                </div>
                {trend && (
                    <div className={cn(
                        "flex items-center text-xs font-bold px-2 py-1 rounded-full",
                        trend.direction === 'up' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    )}>
                        {trend.direction === 'up' ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
                        {trend.value}%
                    </div>
                )}
            </div>

            <div className="mt-4">
                <p className={cn(
                    "text-xs font-bold uppercase tracking-widest mb-1",
                    accent ? "text-muted-foreground" : "text-muted-foreground"
                )}>
                    {label}
                </p>
                <h3 className={cn(
                    "text-xl md:text-3xl font-extrabold tracking-tight",
                    accent ? "text-foreground" : "text-foreground"
                )}>
                    {value}
                </h3>
                {subValue && (
                    <p className={cn(
                        "text-sm font-medium mt-1",
                        accent ? "text-muted-foreground" : "text-muted-foreground"
                    )}>
                        {subValue}
                    </p>
                )}
            </div>
        </div>
    );
}

export function StatusWidget({ petrolVol, dieselVol, totalVol }: { petrolVol: number, dieselVol: number, totalVol: number }) {
    const petrolPercent = totalVol > 0 ? (petrolVol / totalVol) * 100 : 0;
    const dieselPercent = totalVol > 0 ? (dieselVol / totalVol) * 100 : 0;

    return (
        <div className="monumental-card bg-card">
            <h3 className="text-lg font-bold mb-6 border-b border-border pb-2">Units per Status</h3>

            {/* Numeric Grid Removed for Cleaner UI */}
            <div className="mb-4"></div>

            {/* Progress Bar "Hudson Style" */}
            <div className="h-12 w-full flex rounded-none overflow-hidden mt-auto">
                <div
                    className="h-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground transition-all duration-500"
                    style={{ width: `${petrolPercent}%` }}
                >
                    {petrolPercent > 10 && `PETROL ${petrolPercent.toFixed(0)}%`}
                </div>
                <div
                    className="h-full bg-foreground flex items-center justify-center text-xs font-bold text-background transition-all duration-500"
                    style={{ width: `${dieselPercent}%` }}
                >
                    {dieselPercent > 10 && `DIESEL ${dieselPercent.toFixed(0)}%`}
                </div>
            </div>

            <div className="flex justify-between mt-2 px-1">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-accent rounded-sm"></div>
                    <span className="text-xs font-medium text-muted-foreground">Petrol Utilization</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-foreground rounded-sm"></div>
                    <span className="text-xs font-medium text-muted-foreground">Diesel Utilization</span>
                </div>
            </div>
        </div>
    );
}
