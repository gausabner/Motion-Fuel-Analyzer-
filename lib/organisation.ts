import { prisma } from "@/lib/prisma";

/** Organisation details an administrator sets once; they appear on every PDF and drive the financial-year presets. */
export type Organisation = {
    orgName: string;
    /** PNG or JPEG data URL, or "" when none is set. */
    orgLogo: string;
    signatoryName: string;
    signatoryTitle: string;
    reportFooter: string;
    /** 1 = January … 12 = December. */
    financialYearStartMonth: number;
};

export const ORGANISATION_DEFAULTS: Organisation = {
    orgName: "", orgLogo: "", signatoryName: "", signatoryTitle: "", reportFooter: "", financialYearStartMonth: 1,
};

export async function getOrganisation(): Promise<Organisation> {
    try {
        const row = await prisma.systemSettings.findFirst({ where: { id: "global" } });
        if (!row) return ORGANISATION_DEFAULTS;
        const m = Number(row.financialYearStartMonth);
        return {
            orgName: row.orgName ?? "",
            orgLogo: row.orgLogo ?? "",
            signatoryName: row.signatoryName ?? "",
            signatoryTitle: row.signatoryTitle ?? "",
            reportFooter: row.reportFooter ?? "",
            financialYearStartMonth: m >= 1 && m <= 12 ? m : 1,
        };
    } catch {
        return ORGANISATION_DEFAULTS;
    }
}
