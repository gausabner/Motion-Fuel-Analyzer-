import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
    const types = await prisma.fuelTransaction.groupBy({
        by: ['fuelType'],
        _count: true
    });
    console.log('Distinct Fuel Types:', types);
}

check()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
