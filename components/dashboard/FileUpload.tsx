"use client";

import { useState } from "react";
import { Upload, CheckCircle2, AlertCircle, FileSpreadsheet, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

type SheetPreview = {
    name: string;
    isEligible: boolean;
    missingColumns: string[];
};

export function FileUpload() {
    const [uploading, setUploading] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [previewSheets, setPreviewSheets] = useState<SheetPreview[]>([]);
    const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const router = useRouter();

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setSelectedFile(file);
        setUploading(true);
        setStatus('idle');

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/ingest/preview', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setPreviewSheets(data.sheets);
                // Pre-select all eligible sheets
                const eligibleSheets = data.sheets.filter((s: SheetPreview) => s.isEligible).map((s: SheetPreview) => s.name);
                setSelectedSheets(eligibleSheets);
                setShowModal(true);
            } else {
                setStatus('error');
                setMessage(data.error || 'Failed to preview file');
            }
        } catch (error) {
            setStatus('error');
            setMessage('Network error occurred during preview');
        } finally {
            setUploading(false);
            // Reset input so the same file can be selected again
            e.target.value = '';
        }
    };

    const handleImport = async () => {
        if (!selectedFile || selectedSheets.length === 0) return;

        setShowModal(false);
        setUploading(true);
        setStatus('idle');

        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('selectedSheets', JSON.stringify(selectedSheets));

        try {
            const response = await fetch('/api/ingest', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (response.ok) {
                setStatus('success');
                const dupNote = data.duplicates > 0 ? ` (${data.duplicates} duplicate${data.duplicates === 1 ? '' : 's'} skipped)` : '';
                setMessage(`Successfully imported ${data.count} transactions!${dupNote}`);
                setTimeout(() => {
                    router.refresh();
                }, 1500);
            } else {
                setStatus('error');
                setMessage(data.error || 'Upload failed');
            }
        } catch (error) {
            setStatus('error');
            setMessage('Network error occurred during import');
        } finally {
            setUploading(false);
            setSelectedFile(null);
        }
    };

    const toggleSheetSelection = (sheetName: string) => {
        setSelectedSheets(prev => 
            prev.includes(sheetName) 
                ? prev.filter(name => name !== sheetName)
                : [...prev, sheetName]
        );
    };

    return (
        <div className="relative">
            <input
                type="file"
                id="file-upload"
                className="hidden"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                disabled={uploading}
            />
            <label htmlFor="file-upload">
                <Button
                    asChild
                    className="h-11 px-6 font-semibold"
                    disabled={uploading}
                >
                    <span className="cursor-pointer flex items-center gap-2">
                        <Upload className="h-4 w-4" />
                        {uploading && !showModal ? 'Processing…' : 'Upload data'}
                    </span>
                </Button>
            </label>

            {status !== 'idle' && (
                <Card className={`absolute top-12 right-0 p-3 min-w-[250px] shadow-lg z-50 ${status === 'success' ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'
                    }`}>
                    <div className="flex items-center gap-2">
                        {status === 'success' ? (
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : (
                            <AlertCircle className="h-5 w-5 text-red-600" />
                        )}
                        <p className={`text-sm font-medium ${status === 'success' ? 'text-green-800' : 'text-red-800'
                            }`}>
                            {message}
                        </p>
                    </div>
                </Card>
            )}

            <Dialog open={showModal} onOpenChange={setShowModal}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Select Sheets to Import</DialogTitle>
                        <DialogDescription>
                            {previewSheets.length === 1
                                ? 'Review the sheet found in your file before importing. Sheets missing required columns cannot be imported.'
                                : 'We found multiple sheets in your file. Select the ones you want to import. Sheets missing required columns cannot be imported.'}
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto">
                        {previewSheets.map((sheet, index) => (
                            <div key={index} className={`flex items-start space-x-3 p-3 rounded-md border ${sheet.isEligible ? 'bg-muted/40 border-border' : 'bg-red-50 border-red-100 opacity-70'}`}>
                                <div className="mt-1">
                                    <Checkbox 
                                        id={`sheet-${index}`} 
                                        checked={selectedSheets.includes(sheet.name)}
                                        onCheckedChange={() => toggleSheetSelection(sheet.name)}
                                        disabled={!sheet.isEligible}
                                    />
                                </div>
                                <div className="flex-1">
                                    <Label 
                                        htmlFor={`sheet-${index}`}
                                        className="text-sm font-semibold flex items-center gap-2 cursor-pointer"
                                    >
                                        <FileSpreadsheet className="h-4 w-4" />
                                        {sheet.name}
                                    </Label>
                                    {!sheet.isEligible && (
                                        <div className="mt-1 flex items-center gap-1 text-xs text-red-600 font-medium">
                                            <XCircle className="h-3 w-3" />
                                            Missing: {sheet.missingColumns.join(', ')}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowModal(false)} disabled={uploading}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleImport} 
                            disabled={uploading || selectedSheets.length === 0}
                            className="font-semibold"
                        >
                            {uploading ? 'Importing...' : `Import ${selectedSheets.length} Sheet(s)`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
