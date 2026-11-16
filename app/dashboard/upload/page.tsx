"use client";

import { FileUpload } from "@/components/dashboard/FileUpload";
import { UPLOAD_TEMPLATES } from "@/lib/upload-templates";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { RecentUploads } from "@/components/dashboard/RecentUploads";
import { UploadTemplates } from "@/components/dashboard/UploadTemplates";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CloudUpload } from "lucide-react";

/** The two report layouts the importer recognises. The column lists come from the same definitions the templates are built from, so this hint cannot drift from what the parser accepts. */
const REPORTS: { key: "hr580" | "hr640"; title: string; note: string }[] = [
    { key: "hr580", title: "HR580 tank report", note: "Fuel issues to vehicles. The raw pipe-delimited export is accepted as it is. Rows with no Tank or no Issue Qty are skipped, and a row whose Issue Date cannot be read is reported." },
    { key: "hr640", title: "HR640 delivery register", note: "Supplier orders and what was received against them." },
];

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

                        <div className="mt-8 flex flex-col gap-4 rounded-tile bg-surface-2 p-4">
                            {REPORTS.map(r => (
                                <div key={r.key}>
                                    <h3 className="text-[13px] font-medium">{r.title}</h3>
                                    <p className="mt-0.5 text-xs text-muted-foreground">{r.note}</p>
                                    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`Columns in the ${r.title}`}>
                                        {UPLOAD_TEMPLATES[r.key].headers.map(col => (
                                            <li key={col} className="mono rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-muted-foreground">{col}</li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                            <p className="text-xs text-muted-foreground">
                                The report is recognised by these headings, not by its file name. The templates above carry the same columns with sample rows.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <RecentUploads />
        </div>
    );
}
