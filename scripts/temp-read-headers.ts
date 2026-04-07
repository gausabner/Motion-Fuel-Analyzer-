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
        console.log("Headers found:");
        console.log(Object.keys(jsonData[0] as object));
        console.log("\nFirst row sample:");
        console.log(jsonData[0]);
    } else {
        console.log("No data found in the first sheet.");
    }
} catch (e: any) {
    console.error("Error reading file:", e.message);
}
