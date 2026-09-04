import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { processExcelFile } from '@/lib/ingestion';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting Full Re-Ingestion...');

    // 1. Clear Database
    console.log('Clearing FuelTransactions...');
    await prisma.fuelTransaction.deleteMany({});
    console.log('Clearing DailyFuelStats...');
    await prisma.dailyFuelStats.deleteMany({});
    console.log('Clearing UploadedFile records...');
    await prisma.uploadedFile.deleteMany({});

    // 2. Read Files
    const uploadsDir = path.join(process.cwd(), 'public/uploads');
    let files: string[] = [];
    try {
        files = await fs.readdir(uploadsDir);
    } catch (e) {
        console.warn('No uploads directory found or empty.', e);
    }

    console.log(`Found ${files.length} files in ${uploadsDir}`);

    // Filter for excel files just in case
    const excelFiles = files.filter(f => f.endsWith('.xlsx') || f.endsWith('.csv') || f.endsWith('.xls'));

    for (const file of excelFiles) {
        console.log(`Processing ${file}...`);
        const filePath = path.join(uploadsDir, file);
        const buffer = await fs.readFile(filePath);

        // We pass the filename. processExcelFile will re-save it with a new UUID. 
        // This effectively duplicates the file on disk (old file remains, new file created).
        // To avoid disk bloat, we could delete the old file after processing, BUT
        // the old file is what we are reading. 
        // Ideally we'd clean up the old file.
        // Let's just let it be for now, disk space is usually cheap. 
        // Or we can delete the *source* file after ingestion since the ingestion creates a *new* managed file.
        // Yes, let's delete the 'stale' source file after successful re-ingestion to keep folder clean.

        try {
            const result = await processExcelFile(buffer, file);
            const n = result.format === "hr640" ? result.created + result.updated : result.count;
            console.log(`  > Ingested ${n} rows (${result.format}).`);

            // Delete the old file to replace it with the new managed one
            await fs.unlink(filePath);
            console.log(`  > Removed old artifact: ${file}`);
        } catch (e) {
            console.error(`  > Failed to process ${file}:`, e);
        }
    }

    console.log('Re-Ingestion Complete.');
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
