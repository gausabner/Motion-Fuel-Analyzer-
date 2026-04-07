import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkInference() {
    const tanks = ['938', '939'];

    for (const tank of tanks) {
        const validRecords = await prisma.fuelTransaction.findMany({
            where: {
                storeNo: { contains: tank }, // loose match to catch whitespace
                NOT: {
                    OR: [
                        { fuelType: 'UNKNOWN' },
                        { fuelType: 'unknown' },
                        { fuelType: 'Unknown' }
                    ]
                }
            },
            take: 5,
            select: { fuelType: true }
        });

        console.log(`Valid fuel types for Tank ${tank}:`, validRecords.map(r => r.fuelType));
    }
}

checkInference()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
