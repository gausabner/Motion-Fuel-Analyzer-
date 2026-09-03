import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { resolveVotesByPrefix } from "@/lib/vote-resolution";

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

/**
 * Excel saves long vote numbers in scientific notation (6 significant digits),
 * e.g. 4520151100655 arrives as 4520150000000. Build a map from the rounded
 * form back to the registered vote so imports self-heal — but only when the
 * mapping is unambiguous (exactly one registry vote rounds to that value).
 */
async function getVoteRepairMap() {
    const roundTo6Sig = (v: string) => {
        const n = Number(v);
        if (!isFinite(n) || n <= 0) return null;
        const exp = Math.floor(Math.log10(n));
        const factor = Math.pow(10, exp - 5);
        return String(Math.round(n / factor) * factor);
    };
    const ccs = await prisma.costCentre.findMany({ select: { voteNo: true } });
    const candidates: Record<string, string[]> = {};
    for (const { voteNo } of ccs) {
        const key = roundTo6Sig(voteNo);
        if (!key || key === voteNo) continue;
        (candidates[key] = candidates[key] || []).push(voteNo);
    }
    const map: Record<string, string> = {};
    for (const [rounded, votes] of Object.entries(candidates)) {
        if (votes.length === 1) map[rounded] = votes[0];
    }
    return map;
}

export async function processExcelFile(buffer: Buffer, originalFileName: string = "uploaded_file.csv", selectedSheets?: string[]) {
    // 1. Get System Settings for Localization
    const settings = await (prisma as any).systemSettings.findFirst({ where: { id: 'global' } });
    const fuelRate = settings?.fuelRate || 19.95;

    // 2. Save the raw file to NON-PUBLIC storage (never under public/, which
    //    Next.js would serve unauthenticated). On-disk name is UUID + a
    //    sanitized extension only; the original name lives in the DB and is
    //    served back through the authenticated /api/uploads/[id] route.
    const uploadId = uuidv4();
    const storageDir = path.join(process.cwd(), "storage/uploads");
    const ext = (path.extname(originalFileName).toLowerCase().match(/^\.(xlsx|xls|csv)$/)?.[0]) || ".dat";
    const diskName = `${uploadId}${ext}`;
    const filePath = path.join(storageDir, diskName);
    await fs.mkdir(storageDir, { recursive: true });
    await fs.writeFile(filePath, buffer);

    // 3. Read Workbook
    const workbook = XLSX.read(buffer, { type: "buffer" });
    
    const sheetsToProcess = selectedSheets && selectedSheets.length > 0 
        ? selectedSheets 
        : [workbook.SheetNames[0]];

    const fuelMap = await getFuelTypeMap();
    const voteRepairMap = await getVoteRepairMap();
    const transactions: any[] = [];
    const errors: any[] = [];
    const dailyAggMap: Record<string, { date: Date, fuelType: string, vol: number, cost: number, count: number }> = {};

    for (const sheetName of sheetsToProcess) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;
        
        const jsonData = XLSX.utils.sheet_to_json(sheet);

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
                transVoteNo: (() => {
                    const raw = String(rowData["Trans Vote No"] || rowData["Issue Vote"] || rowData["Vote"] || "");
                    // Repair Excel scientific-notation degradation against the registry
                    return voteRepairMap[raw] || raw;
                })(),
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
    }

    let insertedCount = 0;
    // 4. Insert with duplicate detection via the Prisma query builder (fully
    //    parameterized — no raw SQL). The @@unique index on
    //    (transDate, transRefNo, vehicleId, issueTime) throws P2002 on a dup,
    //    which we treat as "skip", matching the old INSERT OR IGNORE behaviour.
    for (const tx of transactions) {
        let inserted = false;
        try {
            await prisma.fuelTransaction.create({
                data: {
                    storeNo: tx.storeNo,
                    pumpNo: tx.pumpNo,
                    transDate: tx.transDate,
                    transRefNo: tx.transRefNo,
                    issueTime: tx.issueTime,
                    transVoteNo: tx.transVoteNo,
                    transQty: tx.transQty,
                    transAmt: tx.transAmt,
                    vehicleId: tx.vehicleId,
                    fleetUnit: tx.fleetUnit,
                    fleetEI: tx.fleetEI,
                    fleetReading: tx.fleetReading,
                    jobNo: tx.jobNo,
                    activity: tx.activity,
                    itemCat: tx.itemCat,
                    transType: tx.transType,
                    fuelType: tx.fuelType,
                    isIssue: tx.isIssue,
                },
            });
            inserted = true;
        } catch (e: any) {
            if (e?.code !== "P2002") throw e; // rethrow anything that isn't a duplicate
        }

        if (inserted) {
            insertedCount++;
            // Daily consumption stats track FIS (issues) only — FRE and other
            // stock movements into tanks are not fleet consumption.
            if (!tx.isIssue) continue;
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

    // 6. Prefix self-heal — register derived cost centres for any vote in this
    // batch whose 7-digit division prefix maps unambiguously to one division.
    // Keeps new uploads resolving without changing the transactions' own codes.
    let votesResolved = 0;
    try {
        const batchVotes = transactions.map(t => t.transVoteNo).filter(Boolean);
        const res = await resolveVotesByPrefix(batchVotes);
        votesResolved = res.created.length;
        if (votesResolved > 0) {
            console.log(`[Ingestion] Prefix-resolved ${votesResolved} new vote code(s):`,
                res.created.map(c => `${c.voteNo}→${c.division}`).join(', '));
        }
    } catch (e: any) {
        console.warn(`[Ingestion] Prefix resolution skipped: ${e.message}`);
    }

    await (prisma as any).uploadedFile.create({
        data: {
            id: uploadId,
            fileName: originalFileName,
            filePath: `storage/uploads/${diskName}`,
            fileSize: buffer.length,
            rowCount: insertedCount
        }
    });

    return {
        count: insertedCount,
        totalProcessed: transactions.length,
        duplicates: transactions.length - insertedCount,
        errors: errors.length,
        votesResolved
    };
}
