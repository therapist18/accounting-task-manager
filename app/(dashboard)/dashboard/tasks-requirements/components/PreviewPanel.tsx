/**
 * PreviewPanel - displays live preview for HTML templates, or native docx-preview for Word templates
 */

'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, FileText, Eye, Sparkles, ZoomIn, ZoomOut, Maximize, StretchHorizontal, RotateCcw, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface PreviewPanelProps {
  previewContent: string;
  isPreviewLoading: boolean;
  panelClasses: string;
  EDITOR_PREVIEW_STYLES: string;
  templateName?: string;
  documentType?: string;
  isWordTemplate?: boolean;
  docxBuffer?: ArrayBuffer | null;
}

type PreviewFitMode = 'zoom' | 'fit-width' | 'fit-page';

const ZOOM_PRESETS = [25, 50, 75, 100, 125, 150, 200, 300];

export const PreviewPanel = ({
  previewContent,
  isPreviewLoading,
  panelClasses,
  EDITOR_PREVIEW_STYLES,
  templateName,
  documentType,
  isWordTemplate,
  docxBuffer,
}: PreviewPanelProps) => {
  const docxContainerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentWrapperRef = useRef<HTMLDivElement>(null);
  const hasHtmlContent = !isWordTemplate && previewContent && previewContent.trim().length > 0;
  const hasWordContent = isWordTemplate && !!docxBuffer;

  const [fitMode, setFitMode] = useState<PreviewFitMode>('fit-width');
  const [zoomLevel, setZoomLevel] = useState(100);
  const [naturalSize, setNaturalSize] = useState({ width: 800, height: 0 });

  const applyFitMode = useCallback((mode: PreviewFitMode) => {
    setFitMode(mode);
    if (mode === 'zoom') return;

    const container = scrollContainerRef.current;
    if (!container) return;

    requestAnimationFrame(() => {
      const containerWidth = container.clientWidth - 48;
      if (mode === 'fit-width') {
        const scale = Math.min(containerWidth / 800, 1.5);
        const pct = Math.round(scale * 100);
        setZoomLevel(pct);
      } else if (mode === 'fit-page') {
        const containerHeight = container.clientHeight - 48;
        const scaleW = containerWidth / 800;
        const scaleH = containerHeight / 1100;
        const scale = Math.min(scaleW, scaleH, 1.5);
        const pct = Math.round(scale * 100);
        setZoomLevel(pct);
      }
    });
  }, []);

  const setZoom = useCallback((pct: number) => {
    setFitMode('zoom');
    setZoomLevel(Math.max(10, Math.min(400, pct)));
  }, []);

  const zoomIn = useCallback(() => setZoom(zoomLevel + 10), [zoomLevel, setZoom]);
  const zoomOut = useCallback(() => setZoom(zoomLevel - 10), [zoomLevel, setZoom]);
  const resetZoom = useCallback(() => { setFitMode('fit-width'); applyFitMode('fit-width'); }, [applyFitMode]);

  useEffect(() => {
    if (fitMode !== 'zoom') {
      applyFitMode(fitMode);
    }
  }, [fitMode, applyFitMode]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || fitMode === 'zoom') return;

    const observer = new ResizeObserver(() => applyFitMode(fitMode));
    observer.observe(container);
    return () => observer.disconnect();
  }, [fitMode, applyFitMode]);

  // Track the content's untransformed size (ResizeObserver's contentRect ignores CSS
  // transforms) so the scaled wrapper below can reserve exactly the visually-scaled
  // footprint instead of the pre-scale one, which otherwise leaves dead space around
  // zoomed-out content.
  useEffect(() => {
    const el = contentWrapperRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setNaturalSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isWordTemplate, docxBuffer, hasHtmlContent]);

  useEffect(() => {
    if (!isWordTemplate || !docxBuffer || !docxContainerRef.current) return;

    let cancelled = false;

    import('docx-preview').then(({ renderAsync }) => {
      if (cancelled || !docxContainerRef.current) return;
      docxContainerRef.current.innerHTML = '';
      renderAsync(docxBuffer, docxContainerRef.current, undefined, {
        className: 'docx-preview',
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        breakPages: true,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        renderEndnotes: true,
        useBase64URL: true,
      }).catch((err) => {
        console.error('[PreviewPanel] docx-preview error:', err);
      });
    });

    return () => { cancelled = true; };
  }, [docxBuffer, isWordTemplate]);

  const hasNoContent = isWordTemplate ? !docxBuffer && !isPreviewLoading : !hasHtmlContent && !isPreviewLoading;
  if (hasNoContent) return null;

  return (
    <div className={`${panelClasses} border-r relative bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden flex flex-col`}>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-slate-200 shadow-sm">
        <div className="px-3 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg shadow-sm">
                  <FileText className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                    {isWordTemplate ? 'Document Preview' : 'Live Preview'}
                    {isPreviewLoading && (
                      <span className="flex items-center gap-1.5 text-xs text-blue-600">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Generating</span>
                      </span>
                    )}
                  </h3>
                  {templateName && (
                    <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[200px]">
                      {templateName}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {documentType && (
                <Badge variant="outline" className="text-[10px] font-medium bg-slate-50 border-slate-200 mr-1">
                  {documentType}
                </Badge>
              )}

              {/* Fit mode buttons */}
              <div className="flex items-center bg-slate-100/80 p-0.5 rounded-full border border-slate-200/50">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn("h-6 w-6 p-0 rounded-full text-xs transition-all", fitMode === 'fit-width' && "bg-white text-blue-600 shadow-sm border border-slate-200/20")}
                  onClick={() => applyFitMode('fit-width')}
                  title="Fit to width"
                >
                  <StretchHorizontal className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn("h-6 w-6 p-0 rounded-full text-xs transition-all", fitMode === 'fit-page' && "bg-white text-blue-600 shadow-sm border border-slate-200/20")}
                  onClick={() => applyFitMode('fit-page')}
                  title="Fit to page"
                >
                  <Maximize className="h-3 w-3" />
                </Button>
              </div>

              {/* Zoom controls */}
              <div className="flex items-center gap-0.5">
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={zoomOut} title="Zoom out">
                  <ZoomOut className="h-3 w-3" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 px-1.5 min-w-[48px] text-[10px] font-medium tabular-nums">
                      {zoomLevel}%
                      <ChevronDown className="h-2.5 w-2.5 ml-0.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" className="min-w-[100px]">
                    {ZOOM_PRESETS.map(preset => (
                      <DropdownMenuItem key={preset} onClick={() => setZoom(preset)} className="text-xs justify-center tabular-nums">
                        {preset}%
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={zoomIn} title="Zoom in">
                  <ZoomIn className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={resetZoom} title="Reset to fit width">
                  <RotateCcw className="h-3 w-3" />
                </Button>
              </div>

              <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 rounded-md border border-emerald-200 ml-1">
                <Eye className="h-3 w-3 text-emerald-600" />
                <span className="text-[10px] font-medium text-emerald-700">
                  {isWordTemplate ? 'Doc' : 'Live'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {isWordTemplate ? (
        /* Native DOCX rendering via docx-preview */
        <div ref={scrollContainerRef} className="flex-1 overflow-auto bg-slate-100/80 dark:bg-slate-900/80 p-6 md:p-8 flex justify-center items-start">
          {docxBuffer ? (
            <div
              style={{
                width: naturalSize.width * (zoomLevel / 100),
                height: naturalSize.height * (zoomLevel / 100) || undefined,
              }}
            >
              <div
                ref={contentWrapperRef}
                className="transition-transform duration-150 origin-top-left w-[800px]"
                style={{ transform: `scale(${zoomLevel / 100})` }}
              >
                <div
                  ref={docxContainerRef}
                  className="docx-preview-container shadow-2xl rounded-xl border border-slate-200/50 dark:border-slate-800 bg-white w-[800px]"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 px-6 w-full">
              {isPreviewLoading ? (
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              ) : (
                <>
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-full mb-4 shadow-inner">
                    <Sparkles className="h-8 w-8 text-slate-400" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-700 dark:text-slate-350 mb-1">No Document Preview</h4>
                  <p className="text-xs text-slate-500 text-center max-w-xs leading-relaxed">
                    Fill in the form fields to compile and render the Word document preview
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        /* HTML live preview */
        <div ref={scrollContainerRef} className="flex-1 overflow-auto bg-slate-100/80 dark:bg-slate-900/80">
          <div className="max-w-4xl mx-auto p-6 md:p-8">
            {hasHtmlContent ? (
              <div
                style={{
                  width: naturalSize.width * (zoomLevel / 100),
                  height: naturalSize.height * (zoomLevel / 100) || undefined,
                }}
              >
                <div
                  ref={contentWrapperRef}
                  className="transition-transform duration-150 origin-top-left w-[800px]"
                  style={{ transform: `scale(${zoomLevel / 100})` }}
                >
                  <div className="relative">
                    <div
                      className={cn(
                        "bg-white shadow-2xl rounded-xl overflow-hidden",
                        "border border-slate-200/60 dark:border-slate-800/60",
                        "min-h-[11in] px-8 md:px-12 pt-8 pb-8",
                        "w-[800px]",
                        EDITOR_PREVIEW_STYLES
                      )}
                      style={{ whiteSpace: 'pre-wrap' }}
                      dangerouslySetInnerHTML={{ __html: previewContent }}
                      ref={(el) => {
                        if (el) {
                          const firstChild = el.firstElementChild;
                          if (firstChild) {
                            (firstChild as HTMLElement).style.marginTop = '0';
                            (firstChild as HTMLElement).style.paddingTop = '0';
                          }
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 px-6 bg-white dark:bg-slate-900 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-full mb-4 shadow-inner">
                  <Sparkles className="h-8 w-8 text-slate-400" />
                </div>
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-350 mb-1">No Preview Available</h4>
                <p className="text-xs text-slate-500 text-center max-w-xs leading-relaxed">
                  Fill in the form fields to generate a live preview of your HTML template
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
