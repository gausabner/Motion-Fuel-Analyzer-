import { processExcelFile } from "../lib/ingestion";
import fs from "fs";
import path from "path";

async function main() {
    const filePath = path.join(process.cwd(), "sample-data", "February 2026 hr580 Fuel data clean.xlsx");
    
    console.log(`Loading file: ${filePath}`);
    const buffer = fs.readFileSync(filePath);
    
    console.log("Running processExcelFile...");
    try {
        const result = await processExcelFile(buffer, "February 2026 hr580 Fuel data clean.xlsx");
        console.log("Ingestion Result:");
        console.dir(result, { depth: null, colors: true });
        
        if (result.count === 0) {
            console.error("Test resulted in 0 rows inserted.");
            process.exit(1);
        } else if (result.errors > 5) {
            console.error(`Test resulted in too many errors (${result.errors}).`);
            process.exit(1);
        } else {
            console.log("Ingestion test successfully completed!");
        }
    } catch (e: any) {
        console.error("Ingestion threw an exception:", e);
        process.exit(1);
    }
}

main();
