import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

/**
 * Maps standard tank numbers to Fuel Types based on TankDefinition.
 */
export async function getFuelTypeMap() {
    const defs = await prisma.tankDefinition.findMany();
    const map: Record<string, string> = {};
    defs.forEach((d) => {
        map[d.tankNo] = d.fuelType;
    });
    return map;
}

export async function processExcelFile(buffer: Buffer, originalFileName: string = "uploaded_file.csv") {
    // 1. Get System Settings for Localization
    const settings = await (prisma as any).systemSettings.findFirst({ where: { id: 'global' } });
    const fuelRate = settings?.fuelRate || 19.95;

    // 2. Save File Physically
    const uploadId = uuidv4();
    const storageDir = path.join(process.cwd(), "public/uploads");
    const safeFileName = `${uploadId}_${originalFileName.replace(/\s+/g, '_')}`;
    const filePath = path.join(storageDir, safeFileName);
    await fs.writeFile(filePath, buffer);

    // 3. Read Workbook
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet);

    const fuelMap = await getFuelTypeMap();
    const transactions: any[] = [];
    const errors: any[] = [];
    const dailyAggMap: Record<string, { date: Date, fuelType: string, vol: number, cost: number, count: number }> = {};

    for (const row of jsonData as any[]) {
        try {
            // Normalize keys (trim and case-insensitive check)
            const rowData: Record<string, any> = {};
            Object.keys(row).forEach(key => {
                rowData[key.trim()] = row[key];
            });

            const tankNo = String(rowData["Tank"] || rowData["Store No"] || rowData["Store"] || "");
            if (!tankNo || tankNo.toLowerCase() === 'undefined') continue;

            const fuelType = fuelMap[tankNo] || "Unknown";

            // Date Parsing - Extremely robust
            const rawDate = rowData["Issue Date"] ?? rowData["Trans Date"] ?? rowData["Date"] ?? rowData["date"];
            let transDate: Date;

            if (typeof rawDate === 'number') {
                const dateStr = String(rawDate);
                if (dateStr.length === 8 && /^\d+$/.test(dateStr)) {
                    transDate = new Date(
                        parseInt(dateStr.substring(0, 4)),
                        parseInt(dateStr.substring(4, 6)) - 1,
                        parseInt(dateStr.substring(6, 8))
                    );
                } else {
                    // Excel Date Serial
                    transDate = new Date((rawDate - 25569) * 86400 * 1000);
                }
            } else {
                const dateStr = String(rawDate || "").trim();
                if (dateStr.length === 8 && /^\d+$/.test(dateStr)) {
                    transDate = new Date(
                        parseInt(dateStr.substring(0, 4)),
                        parseInt(dateStr.substring(4, 6)) - 1,
                        parseInt(dateStr.substring(6, 8))
                    );
                } else {
                    transDate = new Date(dateStr);
                }
            }

            if (isNaN(transDate.getTime())) {
                throw new Error(`Invalid Date Format: ${rawDate}`);
            }

            const transQty = Math.abs(parseFloat(String(rowData["Issue Qty"] || rowData["Trans Qty"] || rowData["Qty"] || "0")));
            if (transQty === 0) continue; // Skip empty rows

            // DYNAMIC COST CALCULATION
            let transAmt = Math.abs(parseFloat(String(rowData["Issue Cost"] || rowData["Trans Amt"] || rowData["Cost"] || rowData["Amt"] || "0")));
            if (transAmt === 0 && transQty > 0) {
                transAmt = transQty * fuelRate;
            }

            const vehicleId = String(rowData["Fleet Unit"] || rowData["Fleet No"] || rowData["Vehicle"] || "UNKNOWN").trim();

            const transTypeRaw = String(rowData["Trans Type"] || rowData["Type"] || "FIS").toUpperCase(); // Default to FIS if missing, or maybe Issue?
            const isIssue = transTypeRaw === 'FIS';

            // Item Logic (Optional, can be used for double-verification)
            // const itemNo = String(rowData["Item No"] || "");
            // const itemDesc = String(rowData["Item Desc"] || "");

            const txObj = {
                storeNo: tankNo,
                pumpNo: String(rowData["Pump"] || ""),
                transDate: transDate,
                transRefNo: String(rowData["Trans Ref No"] || rowData["Reference No"] || rowData["Ref No"] || rowData["Trans No"] || ""),
                issueTime: String(rowData["Issue Time"] || rowData["Time"] || rowData["Issue"] || ""),
                transVoteNo: String(rowData["Trans Vote No"] || rowData["Issue Vote"] || rowData["Vote"] || ""),
                transQty: transQty,
                transAmt: transAmt,
                vehicleId: vehicleId,
                fleetUnit: vehicleId,
                fleetEI: String(rowData["Fleet EI"] || ""),
                fleetReading: String(rowData["Fleet Reading"] || rowData["Odometer"] || ""),
                jobNo: String(rowData["Job No"] || ""),
                activity: String(rowData["Activity"] || ""),
                itemCat: String(rowData["Category"] || rowData["Item Cat"] || ""),
                fuelType: fuelType,
                isIssue: isIssue, // Strict determination
                transType: transTypeRaw, // Store actual code (FIS/FRE)
            };

            transactions.push(txObj);

        } catch (e: any) {
            console.warn(`[Ingestion] Skipping row due to error: ${e.message}`, row);
            errors.push({ row, error: e.message });
        }
    }

    let insertedCount = 0;
    // 4. Intelligent Insertion with Duplicate Detection (SQLite INSERT OR IGNORE)
    for (const tx of transactions) {
        const rowsAffected = await (prisma as any).$executeRawUnsafe(
            `INSERT OR IGNORE INTO FuelTransaction (id, storeNo, pumpNo, transDate, transRefNo, issueTime, transVoteNo, transQty, transAmt, vehicleId, fleetUnit, fleetEI, fleetReading, jobNo, activity, itemCat, transType, fuelType, isIssue)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            uuidv4(),
            tx.storeNo,
            tx.pumpNo,
            tx.transDate.toISOString(),
            tx.transRefNo,
            tx.issueTime,
            tx.transVoteNo,
            tx.transQty,
            tx.transAmt,
            tx.vehicleId,
            tx.fleetUnit,
            tx.fleetEI,
            tx.fleetReading,
            tx.jobNo,
            tx.activity,
            tx.itemCat,
            tx.transType,
            tx.fuelType,
            tx.isIssue ? 1 : 0
        );

        if (rowsAffected > 0) {
            insertedCount++;
            // Calculate aggregations only for new records
            const dateKey = tx.transDate.toISOString().split('T')[0];
            const key = `${dateKey}_${tx.fuelType}`;
            if (!dailyAggMap[key]) {
                dailyAggMap[key] = { date: tx.transDate, fuelType: tx.fuelType, vol: 0, cost: 0, count: 0 };
            }
            dailyAggMap[key].vol += tx.transQty;
            dailyAggMap[key].cost += tx.transAmt;
            dailyAggMap[key].count += 1;
        }
    }

    // 5. Update Aggregates
    for (const key in dailyAggMap) {
        const agg = dailyAggMap[key];
        await prisma.dailyFuelStats.upsert({
            where: { date_fuelType: { date: agg.date, fuelType: agg.fuelType } },
            update: {
                totalVolume: { increment: agg.vol },
                totalCost: { increment: agg.cost },
                transactionCount: { increment: agg.count },
            },
            create: {
                date: agg.date,
                fuelType: agg.fuelType,
                totalVolume: agg.vol,
                totalCost: agg.cost,
                transactionCount: agg.count,
                averageVolume: agg.vol / agg.count
            }
        });
    }

    await (prisma as any).uploadedFile.create({
        data: {
            id: uploadId,
            fileName: originalFileName,
            filePath: `/uploads/${safeFileName}`,
            fileSize: buffer.length,
            rowCount: insertedCount
        }
    });

    return {
        count: insertedCount,
        totalProcessed: transactions.length,
        duplicates: transactions.length - insertedCount,
        errors: errors.length
    };
}
