"use client";

import { useState } from "react";
import { Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useRouter } from "next/navigation";

export function FileUpload() {
    const [uploading, setUploading] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const router = useRouter();

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        setStatus('idle');

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/ingest', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (response.ok) {
                setStatus('success');
                setMessage(`Successfully imported ${data.count} transactions!`);
                // Refresh the page to show new data
                setTimeout(() => {
                    router.refresh();
                }, 1500);
            } else {
                setStatus('error');
                setMessage(data.error || 'Upload failed');
            }
        } catch (error) {
            setStatus('error');
            setMessage('Network error occurred');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="relative">
            <input
                type="file"
                id="file-upload"
                className="hidden"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                disabled={uploading}
            />
            <label htmlFor="file-upload">
                <Button
                    asChild
                    className="bg-black hover:bg-yellow-400 hover:text-black hover:border-black text-white shadow-sm rounded-none border border-zinc-800 font-extrabold uppercase tracking-widest pl-6 pr-6 h-12 transition-all duration-300"
                    disabled={uploading}
                >
                    <span className="cursor-pointer flex items-center gap-3">
                        <Upload className="h-4 w-4" />
                        {uploading ? 'PROCESSING...' : 'UPLOAD EXCEL'}
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
        </div>
    );
}
