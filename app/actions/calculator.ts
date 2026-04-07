"use server";

import { getRangeStats } from "@/lib/analytics";
import { prisma } from "@/lib/prisma";

export async function calculateSavingsAction(rangeA: { from: string, to: string }, rangeB: { from: string, to: string }) {
    if (!rangeA.from || !rangeA.to || !rangeB.from || !rangeB.to) {
        return { error: "Please select full dates for both ranges." };
    }

    const settings = await prisma.systemSettings.findFirst({ where: { id: 'global' } });
    const petrolPrice = settings?.petrolPrice || 0;
    const dieselPrice = settings?.dieselPrice || 0;

    const statsA = await getRangeStats(rangeA.from, rangeA.to);
    const statsB = await getRangeStats(rangeB.from, rangeB.to);

    // Calculate Costs based on Settings if explicit cost is missing or for projection
    // For this calculator features, user explicitly asked to use "price set in Settings"

    const calculateCost = (stats: any) => {
        const pCost = stats.petrolVolume * petrolPrice;
        const dCost = stats.dieselVolume * dieselPrice;
        return {
            petrolCost: pCost,
            dieselCost: dCost,
            total: pCost + dCost
        };
    };

    const costA = calculateCost(statsA);
    const costB = calculateCost(statsB);

    return {
        statsA: { ...statsA, ...costA },
        statsB: { ...statsB, ...costB },
        savings: costA.total - costB.total,
        isSaving: costB.total < costA.total,
        prices: { petrol: petrolPrice, diesel: dieselPrice }
    };
}
