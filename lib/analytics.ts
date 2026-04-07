import { prisma } from "@/lib/prisma";

export async function getFISData(limit = 100, from?: string, to?: string) {
    const where: any = { transType: 'FIS' };
    if (from && to) {
        where.transDate = {
            gte: new Date(from),
            lte: new Date(to)
        };
    }

    return await prisma.fuelTransaction.findMany({
        where,
        orderBy: { transDate: 'desc' },
        take: limit,
    });
}

export async function getFREData(limit = 100, from?: string, to?: string) {
    const where: any = { transType: 'FRE' };
    if (from && to) {
        where.transDate = {
            gte: new Date(from),
            lte: new Date(to)
        };
    }
    return await prisma.fuelTransaction.findMany({
        where,
        orderBy: { transDate: 'desc' },
        take: limit,
    });
}

export async function getDailyConsumption(from?: string, to?: string) {
    const where: any = { transType: 'FIS' }; // Only Include Issues for Consumption
    if (from && to) {
        where.transDate = {
            gte: new Date(from),
            lte: new Date(to)
        };
    }

    // Aggregate by Date and FuelType
    // This returns total Volume and Cost per day per fuel type
    const data = await prisma.fuelTransaction.groupBy({
        by: ['transDate', 'fuelType'],
        where,
        _sum: {
            transQty: true,
            transAmt: true,
        },
        orderBy: { transDate: 'desc' },
    });

    // Transform to friendly format
    return data.map(d => ({
        date: d.transDate,
        fuelType: d.fuelType,
        volume: d._sum.transQty || 0,
        cost: d._sum.transAmt || 0,
    }));
}

export async function getTopFleet(fuelType?: string, from?: string, to?: string) {
    const whereCondition: any = { transType: 'FIS' };
    if (fuelType) {
        whereCondition.fuelType = { contains: fuelType };
    }
    if (from && to) {
        whereCondition.transDate = {
            gte: new Date(from),
            lte: new Date(to)
        };
    }

    const data = await prisma.fuelTransaction.groupBy({
        by: ['vehicleId'],
        where: whereCondition,
        _sum: {
            transQty: true,
            transAmt: true,
        },
        orderBy: {
            _sum: {
                transQty: 'desc'
            }
        },
        take: 10,
    });
    return data.map(d => ({
        vehicleId: d.vehicleId,
        volume: d._sum.transQty || 0,
        cost: d._sum.transAmt || 0,
    }));
}

export async function getGlobalTotals() {
    const data = await prisma.fuelTransaction.groupBy({
        by: ['fuelType'],
        where: { transType: 'FIS' },
        _sum: {
            transQty: true,
        }
    });

    let petrol = 0;
    let diesel = 0;

    for (const d of data) {
        if (d.fuelType.toLowerCase().includes('petrol')) petrol += (d._sum.transQty || 0);
        else if (d.fuelType.toLowerCase().includes('diesel')) diesel += (d._sum.transQty || 0);
    }

    return { petrol, diesel };
}

export async function getCostCentreAnalysis() {
    // We Group by TransVoteNo
    const data = await prisma.fuelTransaction.groupBy({
        by: ['transVoteNo', 'fuelType'],
        where: { transType: 'FIS', transVoteNo: { not: '' } },
        _sum: {
            transQty: true,
            transAmt: true
        }
    });

    // We need to fetch CostCentre details for these Votes
    const votes = [...new Set(data.map(d => d.transVoteNo).filter(Boolean))];
    const costCentres = await prisma.costCentre.findMany({
        where: { voteNo: { in: votes as string[] } }
    });

    const ccMap = new Map(costCentres.map(c => [c.voteNo, c]));

    // Aggregate by Vote (combining fuel types logic if needed, but user asked for split tables or columns)
    // "create a table with petrol consumption of each individual Issue Vote and diesel ..."

    const result = [];

    // Group raw data by Vote First
    const byVote: Record<string, { petrol: number, diesel: number, cc: any }> = {};

    for (const d of data) {
        if (!d.transVoteNo) continue;
        if (!byVote[d.transVoteNo]) {
            byVote[d.transVoteNo] = {
                petrol: 0,
                diesel: 0,
                cc: ccMap.get(d.transVoteNo) || { voteNo: d.transVoteNo, division: 'Unknown', department: 'Unknown' }
            };
        }

        if (d.fuelType.toLowerCase().includes('petrol')) byVote[d.transVoteNo].petrol += (d._sum.transQty || 0);
        else byVote[d.transVoteNo].diesel += (d._sum.transQty || 0);
    }

    return Object.values(byVote).sort((a, b) => (b.petrol + b.diesel) - (a.petrol + a.diesel));
}

export async function getRangeStats(from: string, to: string) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    console.log(`[getRangeStats] Fetching for range: ${fromDate.toISOString()} to ${toDate.toISOString()}`);

    const data = await prisma.fuelTransaction.groupBy({
        by: ['fuelType'],
        where: {
            transType: 'FIS',
            transDate: {
                gte: fromDate,
                lte: toDate
            }
        },
        _sum: {
            transAmt: true,
            transQty: true
        }
    });

    console.log(`[getRangeStats] Raw DB Result:`, JSON.stringify(data, null, 2));

    let petrolVolume = 0;
    let dieselVolume = 0;
    let explicitCost = 0;

    for (const d of data) {
        const type = d.fuelType.toLowerCase();
        if (type.includes('petrol')) {
            petrolVolume += (d._sum.transQty || 0);
        } else if (type.includes('diesel')) {
            dieselVolume += (d._sum.transQty || 0);
        }
        // Unknown or other types are ignored for the specific petrol/diesel breakdown but user might want them?
        // For now, adhering to strict request for "total diesel litres and total petrol litres".

        explicitCost += (d._sum.transAmt || 0);
    }

    return {
        petrolVolume,
        dieselVolume,
        explicitCost
    };
}
