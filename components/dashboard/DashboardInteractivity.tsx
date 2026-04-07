"use client";

import { useState } from "react";
import { IndustrialKPI } from "./IndustrialKPI";
import { StatusProgressWidget } from "./StatusProgressWidget";
import { FocusedChart } from "./Charts";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Fuel, Droplets, Wallet, Activity } from "lucide-react";
import { ActiveUnitsModal } from "@/components/dashboard/ActiveUnitsModal";
import { AvgPriceModal } from "@/components/dashboard/AvgPriceModal";
import { TotalSpendModal } from "@/components/dashboard/TotalSpendModal";
import { TotalVolumeModal } from "@/components/dashboard/TotalVolumeModal";

export function DashboardInteractivity({
    data,
    currencySymbol
}: {
    data: any,
    currencySymbol: string
}) {
    const [selectedFuel, setSelectedFuel] = useState<string | null>(null);
    const [showActiveUnitsModal, setShowActiveUnitsModal] = useState(false);
    const [showAvgPriceModal, setShowAvgPriceModal] = useState(false);
    const [showTotalSpendModal, setShowTotalSpendModal] = useState(false);
    const [showTotalVolumeModal, setShowTotalVolumeModal] = useState(false);

    // Calculate aggregated metrics for status widget
    const petrolVol = data.kpi.petrol || 0;
    const dieselVol = data.kpi.diesel || 0;
    const totalVol = petrolVol + dieselVol;

    // Calculate percentages
    const petrolPct = totalVol > 0 ? Math.round((petrolVol / totalVol) * 100) : 0;
    const dieselPct = totalVol > 0 ? Math.round((dieselVol / totalVol) * 100) : 0;

    return (
        <div className="space-y-8">
            <div className="industrial-grid">
                {/* 1. Total Sales (Spend) */}
                <div onClick={() => setShowTotalSpendModal(true)} className="cursor-pointer">
                    <IndustrialKPI
                        label="TOTAL SPEND"
                        value={`${currencySymbol}${data.kpi.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                        icon={Wallet}
                        trend={{ value: 12, direction: 'up' }}
                        accent={true}
                    />
                </div>

                {/* 2. Units Sold (Volume) */}
                <div onClick={() => setShowTotalVolumeModal(true)} className="cursor-pointer">
                    <IndustrialKPI
                        label="TOTAL VOLUME"
                        value={`${totalVol.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                        subValue="Liters Dispensed"
                        icon={Droplets}
                    />
                </div>

                {/* 3. Avg Price (Implied) */}
                <div onClick={() => setShowAvgPriceModal(true)} className="cursor-pointer">
                    <IndustrialKPI
                        label="AVG PRICE / L"
                        value={`${currencySymbol}${(data.kpi.actualAvgPrice || 0).toFixed(2)}`}
                        icon={Activity}
                        trend={{
                            value: Math.abs(data.kpi.priceDeviation || 0),
                            direction: (data.kpi.priceDeviation || 0) >= 0 ? 'up' : 'down'
                        }}
                        bottomTrend={true}
                    />
                </div>

                {/* 4. Active Vehicles */}
                <div onClick={() => setShowActiveUnitsModal(true)} className="cursor-pointer">
                    <IndustrialKPI
                        label="ACTIVE UNITS"
                        value={(data.kpi.activeUnitsCount || 0).toLocaleString()}
                        subValue="Fleet Vehicles"
                        icon={Fuel}
                        accent={true}
                    />
                </div>
            </div>

            {/* Status Widget Row */}
            <div className="grid gap-6 md:grid-cols-2">
                <StatusProgressWidget
                    petrolPercentage={petrolPct}
                    dieselPercentage={dieselPct}
                />
                {/* Placeholder for future "Total Leads" chart or similar */}
                <div className="hidden md:block"></div>
            </div>

            <Dialog open={!!selectedFuel} onOpenChange={(open) => !open && setSelectedFuel(null)}>
                <DialogContent className="w-[95vw] max-w-[95vw] rounded-3xl p-4 md:p-8 bg-white/95 backdrop-blur-xl border-white/20">
                    <DialogHeader>
                        <div className="flex items-center gap-3 mb-2">
                            <div className={`p-2 rounded-xl bg-black/5`}>
                                <Activity className="h-6 w-6 text-black" />
                            </div>
                            <div>
                                <DialogTitle className="text-2xl font-bold text-foreground">
                                    Analysis Mode: {selectedFuel}
                                </DialogTitle>
                                <DialogDescription className="text-muted-foreground">
                                    Granular daily consumption analysis for the selected period.
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    {selectedFuel && (
                        <FocusedChart
                            data={data.daily}
                            fuelType={selectedFuel}
                            currencySymbol={currencySymbol}
                        />
                    )}
                </DialogContent>
            </Dialog>

            <ActiveUnitsModal
                open={showActiveUnitsModal}
                onOpenChange={setShowActiveUnitsModal}
                activeUnitsList={data.activeUnitsList || []}
                top20Scatter={data.top20Scatter || []}
            />

            <AvgPriceModal
                open={showAvgPriceModal}
                onOpenChange={setShowAvgPriceModal}
                data={data.dailyAvgPriceData || []}
                currencySymbol={currencySymbol}
            />

            <TotalSpendModal
                open={showTotalSpendModal}
                onOpenChange={setShowTotalSpendModal}
                data={data.dailySpendData || []}
                currencySymbol={currencySymbol}
                totalSpend={data.kpi.totalCost}
                maxSpend={data.kpi.maxDailySpend || 0}
                avgSpend={data.kpi.avgDailySpend || 0}
            />

            <TotalVolumeModal
                open={showTotalVolumeModal}
                onOpenChange={setShowTotalVolumeModal}
                data={data.dailyVolumeData || []}
            />

            <TotalSpendModal
                open={showTotalSpendModal}
                onOpenChange={setShowTotalSpendModal}
                data={data.dailySpendData || []}
                currencySymbol={currencySymbol}
            />
        </div>
    );
}
