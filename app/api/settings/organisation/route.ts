import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/auth";
import { getOrganisation } from "@/lib/organisation";

/** A logo is stored inline, so it is kept small: about 300 KB of image once base64-encoded. */
const MAX_LOGO_CHARS = 420_000;

const schema = z.object({
    orgName: z.string().trim().max(120),
    orgLogo: z.string().max(MAX_LOGO_CHARS, "The logo file is too large.")
        .refine(v => v === "" || /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v), "The logo must be a PNG or JPEG image."),
    signatoryName: z.string().trim().max(80),
    signatoryTitle: z.string().trim().max(80),
    reportFooter: z.string().trim().max(160),
    financialYearStartMonth: z.coerce.number().int().min(1).max(12),
});

export async function GET() {
    const user = await requireSession();
    if (user instanceof NextResponse) return user;
    return NextResponse.json({ organisation: await getOrganisation() });
}

export async function POST(req: Request) {
    const user = await requireRole();
    if (user instanceof NextResponse) return user;
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        const first = parsed.error.issues[0]?.message;
        return NextResponse.json({ error: first && !/^(Invalid|Expected|String)/.test(first) ? first : "One of the organisation details is not valid." }, { status: 400 });
    }
    const d = parsed.data;
    const data = {
        orgName: d.orgName || null, orgLogo: d.orgLogo || null,
        signatoryName: d.signatoryName || null, signatoryTitle: d.signatoryTitle || null,
        reportFooter: d.reportFooter || null, financialYearStartMonth: d.financialYearStartMonth,
    };
    try {
        await prisma.systemSettings.upsert({ where: { id: "global" }, update: data, create: { id: "global", ...data } });
        return NextResponse.json({ organisation: await getOrganisation() });
    } catch {
        return NextResponse.json({ error: "The organisation details could not be saved." }, { status: 500 });
    }
}
