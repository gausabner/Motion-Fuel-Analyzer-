import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanup() {
    console.log('Starting data cleanup for Oct, Nov, Dec 2025...');

    const startDate = new Date('2025-10-01T00:00:00.000Z');
    const endDate = new Date('2025-12-31T23:59:59.999Z');

    try {
        const result = await prisma.fuelTransaction.deleteMany({
            where: {
                transDate: {
                    gte: startDate,
                    lte: endDate,
                },
            },
        });

        console.log(`Successfully deleted ${result.count} records.`);
    } catch (error) {
        console.error('Error deleting records:', error);
    } finally {
        await prisma.$disconnect();
    }
}

cleanup();
