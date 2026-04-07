import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
    console.log('Rebuilding Daily Stats...');

    // 1. Clear existing stats
    await prisma.dailyFuelStats.deleteMany({});
    console.log('Cleared DailyFuelStats.');

    // 2. Aggregate from Transactions
    // We need to group by date and fuelType
    // Prisma groupBy is perfect for this.

    const aggs = await prisma.fuelTransaction.groupBy({
        by: ['transDate', 'fuelType'],
        _sum: {
            transQty: true,
            transAmt: true,
        },
        _count: {
            id: true
        }
    });

    console.log(`Found ${aggs.length} daily aggregations.`);

    for (const agg of aggs) {
        if (!agg.transDate || !agg.fuelType) continue;

        const vol = agg._sum.transQty || 0;
        const cost = agg._sum.transAmt || 0;
        const count = agg._count.id;

        await prisma.dailyFuelStats.create({
            data: {
                date: agg.transDate,
                fuelType: agg.fuelType,
                totalVolume: vol,
                totalCost: cost,
                transactionCount: count,
                averageVolume: count > 0 ? vol / count : 0
            }
        });
    }

    console.log('Daily Stats Rebuild Complete.');
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
