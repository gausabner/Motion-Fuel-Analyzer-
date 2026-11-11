"use client";

import { FileUpload } from "@/components/dashboard/FileUpload";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { RecentUploads } from "@/components/dashboard/RecentUploads";
import { UploadTemplates } from "@/components/dashboard/UploadTemplates";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CloudUpload } from "lucide-react";

export default function IngestionPage() {
    return (
        <div className="flex flex-col gap-3.5">
            <PageHeader
                title="Uploads"
                scope="Excel or CSV exports from the fuel system. Rows already loaded are skipped."
            />

            <UploadTemplates />

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card className="monumental-card bg-card col-span-1 md:col-span-2">
                    <CardHeader className="pb-4 border-b border-border">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-accent rounded-lg">
                                <CloudUpload className="h-5 w-5 text-brand" />
                            </div>
                            <div>
                                <CardTitle className="text-lg font-semibold tracking-tight">Data import</CardTitle>
                                <CardDescription className="font-medium text-xs mt-1">Supported formats: .xlsx, .xls, .csv</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground mb-6 max-w-lg">
                            Upload the fuel system's report exports here. Column headings are matched automatically and rows already loaded are skipped.
                        </p>

                        <div className="flex items-center gap-4">
                            <FileUpload />
                        </div>

                        <div className="mt-8 p-4 bg-muted/40 ">
                            <h4 className="text-xs font-semibold text-foreground mb-2">Required Columns</h4>
                            <div className="flex flex-wrap gap-2">
                                {["Trans Date", "Vehicle ID", "Fuel Type", "Quantity", "Amount", "Odometer"].map((col) => (
                                    <span key={col} className="text-xs font-mono font-medium px-2 py-1 bg-card border border-border rounded-[10px] text-muted-foreground">
                                        {col}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <RecentUploads />
        </div>
    );
}
