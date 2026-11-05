"use client";

import { useState } from "react";
import { IndustrialKPI } from "./IndustrialKPI";
import { fmtMoneyCompact, fmtLitres, fmtPricePerLitre } from "@/lib/format";
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
                <IndustrialKPI
                    label="Total spend"
                    value={fmtMoneyCompact(data.kpi.totalCost, currencySymbol)}
                    icon={Wallet}
                    accent={true}
                    onClick={() => setShowTotalSpendModal(true)}
                />

                {/* 2. Units Sold (Volume) */}
                <IndustrialKPI
                    label="Total volume"
                    value={fmtLitres(totalVol)}
                    subValue="Dispensed to fleet"
                    icon={Droplets}
                    onClick={() => setShowTotalVolumeModal(true)}
                />

                {/* 3. Avg Price (Implied) */}
                <IndustrialKPI
                    label="Avg price / L"
                    value={fmtPricePerLitre(data.kpi.actualAvgPrice || 0, currencySymbol)}
                    icon={Activity}
                    trend={{
                        value: Math.abs(data.kpi.priceDeviation || 0),
                        direction: (data.kpi.priceDeviation || 0) >= 0 ? 'up' : 'down',
                        sentiment: (data.kpi.priceDeviation || 0) >= 0 ? 'bad' : 'good',
                        label: 'vs set rate'
                    }}
                    bottomTrend={true}
                    onClick={() => setShowAvgPriceModal(true)}
                />

                {/* 4. Active Vehicles */}
                <IndustrialKPI
                    label="Active units"
                    value={(data.kpi.activeUnitsCount || 0).toLocaleString()}
                    subValue="Fleet vehicles"
                    icon={Fuel}
                    accent={true}
                    onClick={() => setShowActiveUnitsModal(true)}
                />
            </div>

            {/* Status Widget Row */}
            <div className="grid gap-4 md:grid-cols-2">
                <StatusProgressWidget
                    petrolPercentage={petrolPct}
                    dieselPercentage={dieselPct}
                />
                {/* Placeholder for future "Total Leads" chart or similar */}
                <div className="hidden md:block"></div>
            </div>

            <Dialog open={!!selectedFuel} onOpenChange={(open) => !open && setSelectedFuel(null)}>
                <DialogContent className="w-[95vw] max-w-[95vw] rounded-3xl p-4 md:p-8 bg-card/95 backdrop-blur-xl border-white/20">
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
