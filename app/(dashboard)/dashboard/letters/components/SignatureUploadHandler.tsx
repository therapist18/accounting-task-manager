// @ts-nocheck
"use client"

import { toast } from '@/lib/hooks/use-toast';

interface SignatureUploadHandlerProps {
    onSignatureUploaded?: () => void;
    refreshIndividuals?: () => Promise<void>;
    refreshSignatures?: () => Promise<void>;
}

export function useSignatureUploadHandler({ 
    onSignatureUploaded, 
    refreshIndividuals, 
    refreshSignatures 
}: SignatureUploadHandlerProps = {}) {
    
    const handleSignatureUpload = async (signatoryId: string, file: File) => {
        const toastId = toast({
            title: 'Uploading signature...',
            variant: 'default',
        });

        try {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const base64 = reader.result as string;

                const response = await fetch('/api/signature-upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        signatoryId,
                        file: base64,
                        fileName: file.name,
                        fileType: file.type
                    })
                });

                const result = await response.json();

                if (response.ok) {
                    toast({
                        id: toastId.id,
                        title: 'Signature uploaded successfully!',
                        variant: 'default',
                    });

                    // Refresh data if refresh functions are provided
                    if (refreshIndividuals && refreshSignatures) {
                        await Promise.all([
                            refreshIndividuals(),
                            refreshSignatures()
                        ]);
                    }

                    // Call custom callback if provided
                    if (onSignatureUploaded) {
                        onSignatureUploaded();
                    }
                } else {
                    toast({
                        id: toastId.id,
                        title: `Upload failed: ${result.error || 'Unknown error'}`,
                        variant: 'destructive',
                    });
                }
            };
        } catch (error) {
            console.error('Signature upload failed:', error);
            toast({
                id: toastId.id,
                title: `Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                variant: 'destructive',
            });
        }
    };

    return {
        handleSignatureUpload
    };
}

export default useSignatureUploadHandler;
