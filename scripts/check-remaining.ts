import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkRemaining() {
    const remaining = await prisma.fuelTransaction.groupBy({
        by: ['storeNo'],
        where: {
            OR: [
                { fuelType: 'UNKNOWN' },
                { fuelType: 'unknown' },
                { fuelType: 'Unknown' }
            ]
        },
        _count: true
    });

    console.log('Remaining Unknown Records by Tank:');
    remaining.forEach(r => {
        console.log(`Tank ${r.storeNo.trim()}: ${r._count}`);
    });

    const total = remaining.reduce((acc, curr) => acc + curr._count, 0);
    console.log(`Total Remaining: ${total}`);
}

checkRemaining()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
