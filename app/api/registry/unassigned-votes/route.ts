import { NextResponse } from "next/server";
import { getUnassignedVotes, getUnassignedSummary } from "@/lib/vote-resolution";

import { requireSession } from "@/lib/auth";

export async function GET() {
    const _auth = await requireSession(); if (_auth instanceof NextResponse) return _auth;
    const [votes, summary] = await Promise.all([
        getUnassignedVotes(),
        getUnassignedSummary(),
    ]);
    return NextResponse.json({ votes, summary });
}
