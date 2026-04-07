"use client";

import { FileUpload } from "@/components/dashboard/FileUpload";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CloudUpload } from "lucide-react";

export default function IngestionPage() {
    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h2 className="text-3xl font-bold tracking-tight text-black uppercase">Data Ingestion</h2>
                <p className="text-zinc-500 font-medium">Upload manual logs for analysis</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Card className="monumental-card bg-white col-span-1 md:col-span-2">
                    <CardHeader className="pb-4 border-b border-zinc-100">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-black rounded-sm">
                                <CloudUpload className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <CardTitle className="text-lg font-extrabold uppercase tracking-tight">Excel Import</CardTitle>
                                <CardDescription className="font-medium text-xs mt-1">Supported formats: .xlsx, .xls</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <p className="text-sm text-zinc-500 mb-6 max-w-lg">
                            Upload your proprietary fuel log spreadsheets here. The system will automatically map headers to the "Hudson" schema and ingest valid transactions.
                        </p>

                        <div className="flex items-center gap-4">
                            <FileUpload />
                        </div>

                        <div className="mt-8 p-4 bg-zinc-50 rounded-sm border border-zinc-200">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-black mb-2">Required Columns</h4>
                            <div className="flex flex-wrap gap-2">
                                {["Trans Date", "Vehicle ID", "Fuel Type", "Quantity", "Amount", "Odometer"].map((col) => (
                                    <span key={col} className="text-[10px] font-mono font-medium px-2 py-1 bg-white border border-zinc-200 rounded-sm text-zinc-600">
                                        {col}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
