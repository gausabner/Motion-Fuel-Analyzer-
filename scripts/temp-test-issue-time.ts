import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";

const filePath = path.join(process.cwd(), "sample-data", "February 2026 hr580 Fuel data clean.xlsx");
try {
    const buffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet);

    if (jsonData.length > 0) {
        const row = jsonData[0] as any;
        const rowData: Record<string, any> = {};
        Object.keys(row).forEach(key => {
            rowData[key.trim()] = row[key];
        });

        console.log("Extracted row data:");
        console.log(rowData);

        const issueTime = String(rowData["Issue Time"] || rowData["Time"] || rowData["Issue"] || "");
        console.log("Calculated issueTime:", issueTime);
    }
} catch (e: any) {
    console.error("Error reading file:", e.message);
}
