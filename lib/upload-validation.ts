// Guard rails for uploaded spreadsheets, applied before the buffer ever reaches
// the XLSX parser (which has had prototype-pollution / ReDoS CVEs on untrusted input).

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED_EXT = [".xlsx", ".xls", ".csv"];
const ALLOWED_MIME = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
    "application/csv",
    "application/octet-stream", // browsers sometimes send this for .xlsx
    "", // some clients omit the type
];

/** Returns an error message if the file is invalid, or null if acceptable. */
export function validateUploadFile(file: File | null): string | null {
    if (!file) return "No file provided";
    if (file.size === 0) return "File is empty";
    if (file.size > MAX_UPLOAD_BYTES) {
        return `File exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit`;
    }
    const name = (file.name || "").toLowerCase();
    if (!ALLOWED_EXT.some(ext => name.endsWith(ext))) {
        return "Unsupported file type — only .xlsx, .xls and .csv are allowed";
    }
    if (file.type && !ALLOWED_MIME.includes(file.type)) {
        return "Unsupported content type";
    }
    return null;
}
