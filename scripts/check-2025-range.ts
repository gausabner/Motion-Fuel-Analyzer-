import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check2025() {
    const range = await prisma.fuelTransaction.aggregate({
        _min: { transDate: true },
        _max: { transDate: true },
        where: {
            transDate: {
                gte: new Date('2025-01-01'),
                lte: new Date('2025-12-31')
            }
        }
    });

    console.log('2025 Data Range:', range);
}

check2025()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
