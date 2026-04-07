import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TANK_MAPPING: Record<string, string> = {
    '911': 'Petrol',
    '912': 'Diesel',
    '913': 'Diesel',
    '914': 'Diesel',
    '915': 'Diesel',
    '937': 'Diesel',
    '940': 'Diesel',
    '943': 'Petrol Unleaded'
};

async function fixFuelTypes() {
    console.log('Starting Fuel Type Remediation...');

    // 1. Identify records to fix
    const unknownRecords = await prisma.fuelTransaction.findMany({
        where: {
            OR: [
                { fuelType: 'UNKNOWN' },
                { fuelType: 'unknown' },
                { fuelType: 'Unknown' }
            ]
        },
        select: { id: true, storeNo: true, fuelType: true }
    });

    console.log(`Found ${unknownRecords.length} records with UNKNOWN fuel type.`);

    let updatedCount = 0;
    let skippedCount = 0;

    // 2. Update records
    for (const record of unknownRecords) {
        const correctFuel = TANK_MAPPING[record.storeNo.trim()];

        if (correctFuel) {
            await prisma.fuelTransaction.update({
                where: { id: record.id },
                data: { fuelType: correctFuel }
            });
            updatedCount++;
        } else {
            console.warn(`[WARN] No mapping found for Tank ${record.storeNo} (Record ID: ${record.id})`);
            skippedCount++;
        }
    }

    console.log(`Remediation Complete.`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`Skipped: ${skippedCount}`);

    // 3. Final Verification
    const remaining = await prisma.fuelTransaction.count({
        where: {
            OR: [
                { fuelType: 'UNKNOWN' },
                { fuelType: 'unknown' }
            ]
        }
    });
    console.log(`Remaining UNKNOWN records: ${remaining}`);
}

fixFuelTypes()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
