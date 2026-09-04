/**
 * Blank workbook templates for the report formats the ingester accepts.
 *
 * Headers are kept here rather than in the download route so they sit next to
 * the parsers that consume them: lib/ingestion.ts routes on these names for
 * HR580, and isHr640Sheet() matches them for HR640. Changing a parser without
 * changing its template will make the template wrong, so keep them together.
 */

export type TemplateKey = "hr580" | "hr640";

export type UploadTemplate = {
    key: TemplateKey;
    /** Sheet name written into the workbook. */
    sheetName: string;
    label: string;
    description: string;
    fileName: string;
    headers: string[];
    /** Realistic rows so the expected formats are obvious — dates especially. */
    sampleRows: (string | number)[][];
    notes: string[];
};

export const UPLOAD_TEMPLATES: Record<TemplateKey, UploadTemplate> = {
    hr580: {
        key: "hr580",
        sheetName: "hr580",
        label: "HR580 — fuel transactions",
        description: "Fuel issued to vehicles and received into tanks. One row per transaction.",
        fileName: "hr580-fuel-transactions-template.xlsx",
        headers: [
            "Tank", "Pump", "Issue Date", "Reference No", "Issue Time", "Issue Vote",
            "Issue Qty", "Issue Cost", "Fleet Unit", "Fleet EI", "Fleet Reading",
            "Job No", "Activity", "Category",
        ],
        sampleRows: [
            [937, 7, 20260828, "F00798", 100100, "5000111100655", 108, 2630.99, "WM2815", 2, 2790700, "", "", ""],
            [940, 3, 20260829, "F00812", 100200, "1500151100655", 128, 3118.21, "WM2811", 2, 2356170, "", "", ""],
        ],
        notes: [
            "Issue Date is yyyymmdd, for example 20260828.",
            "Tank must not be padded with spaces — 937, not '937      '.",
            "Issue Vote is the 12 or 13 digit vote number the fuel is booked to.",
            "Fleet Unit is the vehicle. Leave it as UNKNOWN only when genuinely unattributed.",
            "Duplicate rows are skipped automatically on re-upload.",
        ],
    },
    hr640: {
        key: "hr640",
        sheetName: "hr640",
        label: "HR640 — fuel deliveries",
        description: "Fuel purchase orders and their goods-received notes. One row per order line.",
        fileName: "hr640-fuel-deliveries-template.xlsx",
        headers: [
            "Order No", "O Date", "Supp ref", "Supp name", "Item", "Item Desc",
            "Order Qty", "Ord Cost", "GRN Qty", "GRN Cost",
        ],
        sampleRows: [
            [1274152, 20250704, 2353, "VIVO ENERGY NAMIBIA LTD(SHELL)", 90001, "diesel", 25033, 455132.48, 25033, 455132.48],
            [1274264, 20250708, 2353, "VIVO ENERGY NAMIBIA LTD(SHELL)", 90003, "petrol unleaded", 19522, 363720.24, 0, 0],
        ],
        notes: [
            "O Date is yyyymmdd, for example 20250704.",
            "GRN Qty and GRN Cost are what was actually received. Leave them 0 for an order still outstanding.",
            "Item 90001 is diesel and 90003 is petrol unleaded; the fuel type is read from Item Desc.",
            "Order No plus Item identifies a row. Re-uploading updates it rather than duplicating it.",
            "These are orders, not tank receipts, and are never added to HR580 FRE figures.",
        ],
    },
};

export const isTemplateKey = (v: unknown): v is TemplateKey =>
    v === "hr580" || v === "hr640";
