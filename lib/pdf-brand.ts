/**
 * The letterhead, signatory block and page footer shared by every PDF export.
 *
 * The header is printed on white, not on a dark band: the organisation's own
 * logo has to sit on it, and a council report is as likely to be photocopied
 * as read on a screen.
 */

export type PdfOrganisation = {
    orgName: string;
    orgLogo: string;
    signatoryName: string;
    signatoryTitle: string;
    reportFooter: string;
};

const INK: [number, number, number] = [11, 19, 36];
const MUTED: [number, number, number] = [91, 107, 130];
const LINE: [number, number, number] = [226, 232, 241];
const M = 40;

/* eslint-disable @typescript-eslint/no-explicit-any -- jsPDF's document type is loaded dynamically by the callers */

/** Draws the letterhead and returns the y position where content can start. */
export function drawLetterhead(doc: any, org: PdfOrganisation | undefined, title: string, lines: string[]): number {
    const pageWidth = doc.internal.pageSize.getWidth();
    let textX = M;
    const top = 40;

    if (org?.orgLogo) {
        try {
            const props = doc.getImageProperties(org.orgLogo);
            const maxH = 46, maxW = 130;
            const scale = Math.min(maxH / props.height, maxW / props.width);
            const w = props.width * scale, h = props.height * scale;
            doc.addImage(org.orgLogo, props.fileType || "PNG", M, top, w, h);
            textX = M + w + 14;
        } catch { /* an unreadable logo must not stop the report */ }
    }

    let y = top + 10;
    if (org?.orgName) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...MUTED);
        doc.text(org.orgName, textX, y);
        y += 20;
    } else {
        y += 6;
    }
    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(...INK);
    doc.text(title, textX, y);
    y += 16;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...MUTED);
    for (const line of lines.filter(Boolean)) {
        const wrapped = doc.splitTextToSize(line, pageWidth - textX - M) as string[];
        doc.text(wrapped, textX, y);
        y += wrapped.length * 12;
    }
    y = Math.max(y, top + 52) + 4;
    doc.setDrawColor(...INK); doc.setLineWidth(1.5);
    doc.line(M, y, pageWidth - M, y);
    return y + 26;
}

/** "Prepared by" block after the last table; moves to a new page when there is no room. Does nothing when no signatory is set. */
export function drawSignatory(doc: any, org: PdfOrganisation | undefined, afterY: number): void {
    if (!org?.signatoryName && !org?.signatoryTitle) return;
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = afterY + 34;
    if (y > pageHeight - 110) { doc.addPage(); y = 80; }
    doc.setDrawColor(...LINE); doc.setLineWidth(0.8);
    doc.line(M, y, M + 200, y);
    doc.line(M + 240, y, M + 380, y);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...INK);
    if (org.signatoryName) doc.text(org.signatoryName, M, y + 13);
    doc.setFont("helvetica", "normal"); doc.setTextColor(...MUTED);
    if (org.signatoryTitle) doc.text(org.signatoryTitle, M, y + (org.signatoryName ? 25 : 13));
    doc.text("Date", M + 240, y + 13);
    doc.setFontSize(8);
    doc.text("Signature", M, y - 6);
}

/** Footer on every page: the organisation's own line on the left, product and page number on the right. */
export function drawFooters(doc: any, org: PdfOrganisation | undefined): void {
    const pageWidth = doc.internal.pageSize.getWidth();
    const y = doc.internal.pageSize.getHeight() - 20;
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...MUTED);
        if (org?.reportFooter) doc.text(doc.splitTextToSize(org.reportFooter, pageWidth - 2 * M - 150)[0], M, y);
        doc.text(`Motion Fuel Analyzer · page ${i} of ${pageCount}`, pageWidth - M, y, { align: "right" });
    }
}
