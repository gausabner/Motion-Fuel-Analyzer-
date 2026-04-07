import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
    const result = await prisma.fuelTransaction.aggregate({
        _min: { transDate: true },
        _max: { transDate: true },
        _count: true,
    });

    console.log('Total records:', result._count);
    console.log('Min Date:', result._min.transDate);
    console.log('Max Date:', result._max.transDate);

    // Check for Q4 2023
    const count2023Q4 = await prisma.fuelTransaction.count({
        where: {
            transDate: {
                gte: new Date('2023-10-01'),
                lte: new Date('2023-12-31')
            }
        }
    });
    console.log('Records in Q4 2023:', count2023Q4);

    // Check for Q4 2024
    const count2024Q4 = await prisma.fuelTransaction.count({
        where: {
            transDate: {
                gte: new Date('2024-10-01'),
                lte: new Date('2024-12-31')
            }
        }
    });
    console.log('Records in Q4 2024:', count2024Q4);

    // Check for any records in late 2025 specifically
    const count2025 = await prisma.fuelTransaction.count({
        where: {
            transDate: {
                gte: new Date('2025-01-01'),
                lte: new Date('2025-12-31')
            }
        }
    });
    console.log('Records in 2025:', count2025);

    // Check DailyFuelStats
    const dailyStatsCount = await prisma.dailyFuelStats.count({
        where: {
            date: {
                gte: new Date('2025-10-01'),
                lte: new Date('2025-12-31')
            }
        }
    });
    console.log('DailyFuelStats records in Q4 2025:', dailyStatsCount);

    // Group by Month to see distribution
    const distinctMonths = await prisma.fuelTransaction.findMany({
        select: { transDate: true },
        orderBy: { transDate: 'asc' }
    });

    // Quick aggregation in JS to see years
    const years = distinctMonths.reduce((acc, curr) => {
        const y = new Date(curr.transDate).getFullYear();
        acc[y] = (acc[y] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    console.log('FuelTransaction Count by Year:', years);

    const sample = await prisma.fuelTransaction.findFirst({
        orderBy: { transDate: 'desc' }
    });
    console.log('Latest record:', sample);
}

check()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
