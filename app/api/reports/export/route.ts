import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import {
    getFISData,
    getFREData,
    getDailyConsumption,
    getTopFleet,
    getCostCentreAnalysis,
    getTopVotes,
    getConsumptionSummary,
    getFleetPerformance,
    getDepartmentBreakdown,
} from "@/lib/analytics";
import { toLocalYmd } from "@/lib/date-format";
import { getVehicleAttribution } from "@/lib/vehicle-attribution";

function csvEscape(value: unknown): string {
    let s = String(value ?? "");
    // Neutralize spreadsheet formula injection: a cell beginning with = + - @
    // (or tab/CR) is treated as a formula by Excel/Sheets. Prefix with ' unless
    // it is a plain number (so real negatives like -4338.00 stay numeric).
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

function csvResponse(filename: string, headers: string[], rows: unknown[][]) {
    const content = [
        headers.map(csvEscape).join(","),
        ...rows.map(row => row.map(csvEscape).join(","))
    ].join("\n");
    return new NextResponse(content, {
        headers: {
            "Content-Type": "text/csv;charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
        },
    });
}

// Stored dates are local-midnight instants — format in local time, not UTC.
const fmtDate = (d: any) => toLocalYmd(d);

import { requireSession } from "@/lib/auth";

export async function GET(request: Request) {
    const _auth = await requireSession(); if (_auth instanceof NextResponse) return _auth;
    const { searchParams } = new URL(request.url);
    const report = searchParams.get("report");
    const from = searchParams.get("from") || undefined;
    const to = searchParams.get("to") || undefined;
    const fuelTypeParam = searchParams.get("fuelType") || undefined;
    const departmentParam = searchParams.get("department") || undefined;
    const divisionParam = searchParams.get("division") || undefined;
    const vehicleIdParam = searchParams.get("vehicleId") || undefined;
    const stamp = new Date().toISOString().split("T")[0];
    // Filter set shared by every FIS-derived report so exports match the page.
    const opts = {
        from, to, fuelType: fuelTypeParam,
        department: departmentParam, division: divisionParam, vehicleId: vehicleIdParam,
    };
    // Fuel-pinned report variants ignore the URL's fuelType (the report name wins),
    // so e.g. report=daily-petrol&fuelType=Diesel can't yield a silently empty file.
    const pinned = (fuel: string) => ({ ...opts, fuelType: fuel });

    // ---- Typed report exports (full datasets, date-range aware) ----
    switch (report) {
        case "fis":
        case "fis-petrol":
        case "fis-diesel": {
            // Petrol/Diesel report variants pin the fuel type; the plain "fis"
            // report honours whatever filters the FIS page has active.
            const fuel = report === "fis-petrol" ? "Petrol" : report === "fis-diesel" ? "Diesel" : fuelTypeParam;
            const data = await getFISData(1000000, {
                from, to, fuelType: fuel,
                department: departmentParam, division: divisionParam, vehicleId: vehicleIdParam,
            });
            return csvResponse(`${report}_${stamp}.csv`,
                ["Date", "Issue Vote", "Fleet Unit", "Tank", "Fuel Type", "Volume (L)", "Cost"],
                data.map(tx => [fmtDate(tx.transDate), tx.transVoteNo || "", tx.vehicleId || "", tx.storeNo, tx.fuelType, tx.transQty?.toFixed(2), tx.transAmt?.toFixed(2) ?? "0.00"]));
        }
        case "fre":
        case "fre-petrol":
        case "fre-diesel": {
            const fuel = report === "fre-petrol" ? "Petrol" : report === "fre-diesel" ? "Diesel" : fuelTypeParam;
            // Receipts carry no cost-centre or real vehicle, so department/division/
            // vehicle filters are deliberately NOT applied here (they would zero it out).
            const data = await getFREData(1000000, { from, to, fuelType: fuel });
            return csvResponse(`${report}_${stamp}.csv`,
                ["Date", "Ref No", "Tank", "Fuel Type", "Volume (L)", "Cost"],
                data.map(tx => [fmtDate(tx.transDate), tx.transRefNo || "", tx.storeNo, tx.fuelType, tx.transQty?.toFixed(2), tx.transAmt?.toFixed(2) ?? "0.00"]));
        }
        case "fleet": {
            const data = await getFleetPerformance({
                from, to, fuelType: fuelTypeParam,
                department: departmentParam, division: divisionParam, vehicleId: vehicleIdParam,
            });
            return csvResponse(`fleet_performance_${stamp}.csv`,
                ["Vehicle ID", "Petrol (L)", "Diesel (L)", "Total Cost", "Fills"],
                data.map(u => [u.id, u.petrolVolume.toFixed(2), u.dieselVolume.toFixed(2), u.totalCost.toFixed(2), u.transactionCount]));
        }
        case "departments": {
            const data = await getDepartmentBreakdown({
                from, to, fuelType: fuelTypeParam,
                department: departmentParam, division: divisionParam, vehicleId: vehicleIdParam,
            });
            // % of total is computed over the whole filtered set, matching the page.
            const totalSpend = data.reduce((sum, d) => sum + d.totalCost, 0);
            return csvResponse(`departmental_breakdown_${stamp}.csv`,
                ["Department / Vote", "Division", "Petrol (L)", "Diesel (L)", "Total Cost", "Transactions", "% of Total"],
                data.map(d => [
                    d.id, d.division,
                    d.petrolVolume.toFixed(2), d.dieselVolume.toFixed(2),
                    d.totalCost.toFixed(2), d.count,
                    ((d.totalCost / (totalSpend || 1)) * 100).toFixed(1),
                ]));
        }
        case "vehicle-attribution": {
            const attr = await getVehicleAttribution(vehicleIdParam || "", opts);
            if (!attr) {
                return NextResponse.json({ error: "vehicleId is required for this report" }, { status: 400 });
            }
            // One row per unit/vote pair, so a multi-unit search still exports cleanly.
            const rows: unknown[][] = [];
            const units = attr.unit ? [attr.unit] : [];
            for (const u of units) {
                for (const v of u.votes) {
                    rows.push([
                        u.unitNo, v.voteNo,
                        v.department ?? "UNREGISTERED",
                        v.division ?? "",
                        v.suggestedDepartment ?? "",
                        v.litres.toFixed(2), v.txns,
                        v.department ? "Assigned" : "Unregistered",
                    ]);
                }
            }
            return csvResponse(`unit_attribution_${stamp}.csv`,
                ["Unit", "Issue Vote", "Department", "Division", "Suggested Department", "Litres", "Transactions", "Status"],
                rows);
        }
        case "daily":
        case "daily-petrol":
        case "daily-diesel": {
            const dailyOpts = report === "daily-petrol" ? pinned("Petrol")
                : report === "daily-diesel" ? pinned("Diesel") : opts;
            const data = await getDailyConsumption(dailyOpts);
            return csvResponse(`${report}_consumption_${stamp}.csv`,
                ["Date", "Fuel Type", "Volume (L)", "Cost"],
                data.map(d => [fmtDate(d.date), d.fuelType, d.volume.toFixed(2), d.cost.toFixed(2)]));
        }
        case "top-fleet-petrol":
        case "top-fleet-diesel": {
            const fuel = report === "top-fleet-petrol" ? "Petrol" : "Diesel";
            const data = await getTopFleet(fuel, pinned(fuel));
            return csvResponse(`${report}_${stamp}.csv`,
                ["Rank", "Fleet Unit", "Volume (L)", "Cost"],
                data.map((d, i) => [i + 1, d.vehicleId || "", d.volume.toFixed(2), d.cost.toFixed(2)]));
        }
        case "votes": {
            const data = await getCostCentreAnalysis(opts);
            return csvResponse(`vote_consumption_${stamp}.csv`,
                ["Vote No", "Division", "Department", "Petrol (L)", "Diesel (L)", "Total (L)"],
                data.map(d => [d.cc.voteNo, d.cc.division, d.cc.department, d.petrol.toFixed(2), d.diesel.toFixed(2), (d.petrol + d.diesel).toFixed(2)]));
        }
        case "top-votes-petrol":
        case "top-votes-diesel": {
            const fuel = report === "top-votes-petrol" ? "Petrol" : "Diesel";
            const data = await getTopVotes(fuel as 'Petrol' | 'Diesel', pinned(fuel));
            return csvResponse(`${report}_${stamp}.csv`,
                ["Rank", "Vote No", "Division", "Department", "Volume (L)", "Cost"],
                data.map((d, i) => [i + 1, d.voteNo, d.division, d.department, d.volume.toFixed(2), d.cost.toFixed(2)]));
        }
        case "summary": {
            const s = await getConsumptionSummary(opts);
            return csvResponse(`consumption_summary_${stamp}.csv`,
                ["Fuel Type", "Volume (L)", "Cost", "Transactions"],
                [
                    ["Petrol", s.petrolVolume.toFixed(2), s.petrolCost.toFixed(2), s.petrolCount],
                    ["Diesel", s.dieselVolume.toFixed(2), s.dieselCost.toFixed(2), s.dieselCount],
                    ["Total", (s.petrolVolume + s.dieselVolume).toFixed(2), (s.petrolCost + s.dieselCost).toFixed(2), s.petrolCount + s.dieselCount],
                ]);
        }
    }

    // ---- Legacy raw-transaction export (used by Fuel Logs page) ----
    const vehicleId = searchParams.get("vehicleId");
    const fuelType = searchParams.get("fuelType");
    const department = searchParams.get("department");
    const division = searchParams.get("division");

    const where: any = {};
    if (vehicleId) where.vehicleId = { contains: vehicleId };
    if (fuelType && fuelType !== 'all') where.fuelType = fuelType;

    if (department || division) {
        const ccWhere: any = {};
        if (department) ccWhere.department = { contains: department };
        if (division) ccWhere.division = { contains: division };

        const ccs = await prisma.costCentre.findMany({
            where: ccWhere,
            select: { voteNo: true }
        });
        const validVoteNos = ccs.map(c => c.voteNo);
        where.transVoteNo = { in: validVoteNos };
    }

    const transactions = await prisma.fuelTransaction.findMany({
        where,
        orderBy: { transDate: 'desc' },
    });

    return csvResponse("fuel_report.csv",
        ["Date", "Tank", "Fuel Type", "Type", "Vehicle", "Department", "Quantity", "Amount"],
        transactions.map(tx => [
            new Date(tx.transDate).toLocaleDateString(),
            tx.storeNo,
            tx.fuelType,
            tx.transType,
            tx.vehicleId || "N/A",
            tx.transVoteNo || "N/A",
            tx.transQty.toFixed(2),
            tx.transAmt?.toFixed(2) || "0.00"
        ]));
}
