/**
 * Blank workbook templates for the report formats the ingester accepts.
 *
 * Headers are kept here rather than in the download route so they sit next to
 * the parsers that consume them: lib/ingestion.ts routes on these names for
 * HR580, and isHr640Sheet() matches them for HR640. Changing a parser without
 * changing its template will make the template wrong, so keep them together.
 */

export type TemplateKey = "hr580" | "hr640" | "hr940";

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
    /** What the report is, in the data owner's own words. */
    briefing: string[];
    /** Column-by-column meaning, written into the guidance sheet. */
    glossary?: [string, string][];
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
        briefing: [
            "This is consumption data — fuel issued out to vehicles.",
            "Tank holds the fuel tank the fuel came out of. Each tank carries one fuel:",
            "911 petrol · 912 diesel · 913 diesel · 914 diesel · 915 diesel · 937 diesel · 940 diesel · 943 petrol unleaded.",
            "Issue Date is the date fuel was issued to a Fleet Unit, written yyyymmdd — 20250524 is 24 May 2025.",
            "Issue Vote is the department the Fleet Unit belongs to.",
            "Issue Qty is the fuel issued to that Fleet Unit.",
        ],
        glossary: [
            ["Tank", "Fuel tank the fuel was drawn from"],
            ["Pump", "Pump used on that tank"],
            ["Issue Date", "Date of issue, yyyymmdd (20250524 = 24 May 2025)"],
            ["Reference No", "Transaction reference"],
            ["Issue Time", "Time of issue"],
            ["Issue Vote", "Vote number identifying the department the vehicle belongs to"],
            ["Issue Qty", "Litres issued to the vehicle"],
            ["Issue Cost", "Value of the fuel issued"],
            ["Fleet Unit", "The vehicle receiving the fuel"],
            ["Fleet EI", "Fleet equipment indicator"],
            ["Fleet Reading", "Odometer or hour reading at issue"],
            ["Job No", "Job the fuel was booked against, if any"],
            ["Activity", "Activity code, if any"],
            ["Category", "Item category, if any"],
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
        briefing: [
            "This is fuel supply data — what was ordered from the supplier and what was received.",
            "One row is an order line, not a tank receipt, so it is never added to HR580 receipt figures.",
        ],
        glossary: [
            ["Order No", "Unique purchase order (PO) number"],
            ["O Date", "Order date, yyyymmdd (20240821 = 21 Aug 2024)"],
            ["Supp ref", "Supplier reference / account code"],
            ["Supp name", "Supplier's registered name"],
            ["Item", "Internal stock / item code for the product ordered"],
            ["Item Desc", "Free-text description of the item"],
            ["Order Qty", "Quantity originally ordered"],
            ["Ord Cost", "Total cost of the order line (Order Qty x unit price)"],
            ["GRN Qty", "Goods Received Note quantity — how much was actually received"],
            ["GRN Cost", "Cost corresponding to the GRN quantity received"],
        ],
        notes: [
            "O Date is yyyymmdd, for example 20250704.",
            "GRN Qty and GRN Cost are what was actually received. Leave them 0 for an order still outstanding.",
            "Item 90001 is diesel and 90003 is petrol unleaded; the fuel type is read from Item Desc.",
            "Order No plus Item identifies a row. Re-uploading updates it rather than duplicating it.",
            "These are orders, not tank receipts, and are never added to HR580 FRE figures.",
        ],
    },
    hr940: {
        key: "hr940",
        sheetName: "hr940",
        label: "HR940 — fuel deliveries (extended)",
        description: "HR640 plus cancellation, invoiced and returned quantities. One row per order line.",
        fileName: "hr940-fuel-deliveries-extended-template.xlsx",
        headers: [
            "Order No", "O Date", "Supp ref", "Supp name", "Can ord", "Can Item",
            "Item", "Item Desc", "Order Qty", "Ord Cost", "GRN Qty", "GRN Cost",
            "Inv Qty", "Return Qty", "Column1",
        ],
        sampleRows: [
            [1274152, 20250704, 2353, "VIVO ENERGY NAMIBIA LTD(SHELL)", "", "", 90001, "diesel", 25033, 455132.48, 25033, 455132.48, 25033, 0, ""],
            [1274264, 20250708, 2353, "VIVO ENERGY NAMIBIA LTD(SHELL)", "", "", 90003, "petrol unleaded", 19522, 363720.24, 0, 0, 0, 0, ""],
        ],
        briefing: [
            "This is fuel supply data — the same orders as HR640, with more of the order lifecycle.",
            "It is recognised automatically by its extra columns, so it can be uploaded as-is.",
            "One row is an order line, not a tank receipt, so it is never added to HR580 receipt figures.",
        ],
        glossary: [
            ["Order No", "Unique purchase order (PO) number"],
            ["O Date", "Order date, yyyymmdd (20240821 = 21 Aug 2024)"],
            ["Supp ref", "Supplier reference / account code"],
            ["Supp name", "Supplier's registered name"],
            ["Can ord", "Cancelled flag/quantity at order (header) level; blank means not cancelled"],
            ["Can Item", "Cancelled quantity at line-item level; blank means not cancelled"],
            ["Item", "Internal stock / item code for the product ordered"],
            ["Item Desc", "Free-text description of the item"],
            ["Order Qty", "Quantity originally ordered"],
            ["Ord Cost", "Total cost of the order line (Order Qty x unit price)"],
            ["GRN Qty", "Goods Received Note quantity — how much was actually received"],
            ["GRN Cost", "Cost corresponding to the GRN quantity received"],
            ["Inv Qty", "Quantity invoiced by the supplier"],
            ["Return Qty", "Quantity returned to the supplier (damaged or rejected goods)"],
            ["Column1", "Empty/unused export artifact — ignored on import"],
        ],
        notes: [
            "O Date is yyyymmdd, for example 20250704.",
            "GRN Qty and GRN Cost are what was actually received. Leave them 0 for an order still outstanding.",
            "Can ord and Can Item are left blank when nothing was cancelled.",
            "Column1 is ignored entirely — it is a leftover of the export template.",
            "Order No plus Item identifies a row. Re-uploading updates it rather than duplicating it.",
        ],
    },
};

export const isTemplateKey = (v: unknown): v is TemplateKey =>
    v === "hr580" || v === "hr640" || v === "hr940";
