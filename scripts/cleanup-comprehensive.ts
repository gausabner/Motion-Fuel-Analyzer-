import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanup() {
    console.log('Starting comprehensive data cleanup for late 2025...');

    // Use a wider range to catch timezone edge cases, then narrow down if needed.
    // User asked for Oct, Nov, Dec.
    const octStart = new Date('2025-10-01T00:00:00.000Z');
    const decEnd = new Date('2025-12-31T23:59:59.999Z');

    console.log(`Deleting records between ${octStart.toISOString()} and ${decEnd.toISOString()}`);

    try {
        // 1. Delete from DailyFuelStats
        const dailyStats = await prisma.dailyFuelStats.deleteMany({
            where: {
                date: {
                    gte: octStart,
                    lte: decEnd,
                },
            },
        });
        console.log(`Deleted ${dailyStats.count} records from DailyFuelStats.`);

        // 2. Delete from FuelTransaction
        // My previous check said 0, but let's be absolutely sure with a check first.
        const countCheck = await prisma.fuelTransaction.count({
            where: {
                transDate: {
                    gte: octStart,
                    lte: decEnd
                }
            }
        });
        console.log(`Found ${countCheck} matching FuelTransaction records to delete.`);

        const transactions = await prisma.fuelTransaction.deleteMany({
            where: {
                transDate: {
                    gte: octStart,
                    lte: decEnd,
                },
            },
        });
        console.log(`Deleted ${transactions.count} records from FuelTransaction.`);

    } catch (error) {
        console.error('Error deleting records:', error);
    } finally {
        await prisma.$disconnect();
    }
}

cleanup();
