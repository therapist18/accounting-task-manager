// @ts-nocheck

import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from '@/lib/hooks/use-toast';

interface SignatureUploadDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onUpload: (file: File) => Promise<void>;
    signatoryName: string;
}

export function SignatureUploadDialog({
    isOpen,
    onClose,
    onUpload,
    signatoryName
}: SignatureUploadDialogProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string>('');
    const [isUploading, setIsUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/')) {
            setSelectedFile(file);
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
        }
    };

    const handleUpload = async () => {
        if (!selectedFile) return;

        const toastId = toast({
            title: 'Uploading signature...',
            variant: 'default',
        });

        setIsUploading(true);
        try {
            await onUpload(selectedFile);
            toast({
                id: toastId.id,
                title: 'Signature uploaded successfully!',
                variant: 'default',
            });
            handleClose();
        } catch (error) {
            console.error('Upload failed:', error);
            toast({
                id: toastId.id,
                title: `Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                variant: 'destructive',
            });
        } finally {
            setIsUploading(false);
        }
    };

    const handleClose = () => {
        setSelectedFile(null);
        setPreviewUrl('');
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-sm font-bold">Upload Signature</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="text-xs text-slate-600">
                        Upload signature scan for <span className="font-bold">{signatoryName}</span>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase text-slate-400">Signature Image</Label>
                        <div
                            className={cn(
                                "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
                                isDragging ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-blue-300"
                            )}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleFileSelect}
                                className="hidden"
                                id="signature-upload"
                            />
                            <label
                                htmlFor="signature-upload"
                                className="cursor-pointer flex flex-col items-center gap-2"
                            >
                                {previewUrl ? (
                                    <div className="relative">
                                        <img
                                            src={previewUrl}
                                            alt="Signature preview"
                                            className="max-h-32 max-w-full object-contain"
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="absolute -top-2 -right-2 h-6 w-6 bg-red-500 hover:bg-red-600 text-white rounded-full"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setSelectedFile(null);
                                                setPreviewUrl('');
                                                if (fileInputRef.current) fileInputRef.current.value = '';
                                            }}
                                        >
                                            <X size={12} />
                                        </Button>
                                    </div>
                                ) : (
                                    <>
                                        <Upload className={cn("h-8 w-8", isDragging ? "text-blue-500" : "text-slate-400")} />
                                        <p className={cn("text-xs", isDragging ? "text-blue-600 font-bold" : "text-slate-500")}>
                                            {isDragging ? "Drop signature image here" : "Click or drag to upload signature image"}
                                        </p>
                                        <p className="text-[10px] text-slate-400">PNG, JPG, or JPEG</p>
                                    </>
                                )}
                            </label>
                        </div>
                    </div>

                    {selectedFile && (
                        <div className="text-[10px] text-slate-500">
                            Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button
                        variant="outline"
                        onClick={handleClose}
                        disabled={isUploading}
                        className="text-xs"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleUpload}
                        disabled={!selectedFile || isUploading}
                        className="text-xs"
                    >
                        {isUploading ? (
                            <>
                                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                Uploading...
                            </>
                        ) : (
                            'Upload Signature'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
