// @ts-nocheck
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import { Loader2, FileWarning, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DocxLivePreviewProps {
  file: File | null;
  className?: string;
  style?: React.CSSProperties;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function DocxLivePreview({ file, className, style }: DocxLivePreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const renderPreview = async () => {
      if (!file || !previewRef.current) {
        setError(null);
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        setError('File is too large. Maximum size is 10MB.');
        return;
      }

      if (file.type !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        setError('Please upload a valid .docx file');
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        
        const arrayBuffer = await file.arrayBuffer();
        await renderAsync(arrayBuffer, previewRef.current, undefined, {
          className: 'docx-preview',
          style: 'html,body{height:100%}',
          ignoreLastRenderedPageBreak: true,
        });
      } catch (err) {
        console.error('Error rendering DOCX:', err);
        setError('Failed to render document preview');
      } finally {
        setIsLoading(false);
      }
    };

    renderPreview();
  }, [file]);

  if (!file) {
    return (
      <div className={cn(
        'flex items-center justify-center bg-muted/50 text-muted-foreground',
        'rounded-md border p-8 text-center',
        className
      )} style={style}>
        <div>
          <FileText className="mx-auto h-12 w-12 mb-2 opacity-30" />
          <p>No document selected</p>
          <p className="text-xs mt-1">Upload a .docx file to see a preview</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn(
        'flex flex-col items-center justify-center bg-destructive/10 text-destructive',
        'rounded-md border border-destructive/30 p-8 text-center',
        className
      )} style={style}>
        <FileWarning className="h-8 w-8 mb-2" />
        <p className="font-medium">Preview Unavailable</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className={cn('relative h-full w-full', className)} style={style}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}
      <div 
        ref={previewRef} 
        className="h-full w-full overflow-auto p-4"
        style={{ 
          background: '#fff',
          ...style 
        }}
      />
    </div>
  );
}