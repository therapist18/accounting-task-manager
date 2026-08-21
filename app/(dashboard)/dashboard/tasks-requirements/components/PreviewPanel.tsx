/**
 * PreviewPanel - displays live preview for HTML templates, or native docx-preview for Word templates
 *
 * Chrome (toolbar, canvas, pagination footer, empty states) mirrors the
 * contract modules' shared DocumentViewer (components/contracts/DocumentViewer.tsx)
 * so the template generation workspace reads as the same product family:
 * bordered zoom group, Fit/Fill segmented control, slate page canvas on a
 * gray scroll area, and the docked rounded-full pagination pills.
 */

'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Loader2, Eye, Sparkles, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';
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
// Standard A4 at 96dpi - same page height the contract modules'
// DocumentViewer paginates against, so "Page x / y" here agrees with what
// the printed/exported sheet will look like.
const PAGE_HEIGHT_PX = 1123;

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
  const hasOutput = isWordTemplate ? hasWordContent : hasHtmlContent;

  const [fitMode, setFitMode] = useState<PreviewFitMode>('fit-width');
  const [zoomLevel, setZoomLevel] = useState(100);
  const [naturalSize, setNaturalSize] = useState({ width: 800, height: 0 });

  // Scroll-based page tracking for the docked pagination footer - same
  // math as DocumentViewer's onScroll handler.
  const totalPages = Math.max(1, Math.ceil(naturalSize.height / PAGE_HEIGHT_PX));
  const [currentPage, setCurrentPage] = useState(1);

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

  // Reset the page tracker when the document itself changes.
  useEffect(() => {
    setCurrentPage(1);
    scrollContainerRef.current?.scrollTo({ top: 0 });
  }, [previewContent, docxBuffer]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !hasOutput) return;

    let rafId: number;
    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const page = Math.floor(container.scrollTop / (PAGE_HEIGHT_PX * (zoomLevel / 100))) + 1;
        setCurrentPage(Math.max(1, Math.min(page, totalPages)));
      });
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      container.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafId);
    };
  }, [hasOutput, zoomLevel, totalPages]);

  const scrollToPage = (page: number) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: (page - 1) * PAGE_HEIGHT_PX * (zoomLevel / 100), behavior: 'smooth' });
  };

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

  const zoomRatio = useMemo(() => zoomLevel / 100, [zoomLevel]);

  const emptyState = (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      <div className="p-4 bg-white dark:bg-slate-900 rounded-full mb-4 shadow-sm border border-slate-200/60 dark:border-slate-800">
        <Sparkles className="h-8 w-8 text-slate-300" />
      </div>
      <h4 className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-1">No Preview Available</h4>
      <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
        Fill in the form fields to generate a live preview of the document.
      </p>
    </div>
  );

  return (
    <div className={cn(panelClasses, 'relative overflow-hidden flex flex-col')}>
      {/* Toolbar - same chrome as the contract modules' DocumentViewer */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-200/70 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur z-20">
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Zoom Controls */}
          <div className="flex items-center h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 overflow-hidden shadow-sm shrink-0">
            <button
              onClick={zoomOut}
              title="Zoom out"
              className="px-2 h-full text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  title="Zoom level"
                  className="text-xs font-medium text-slate-600 dark:text-slate-300 w-11 h-full text-center tabular-nums select-none border-x border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  {zoomLevel}%
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="min-w-[100px]">
                {ZOOM_PRESETS.map(preset => (
                  <DropdownMenuItem key={preset} onClick={() => setZoom(preset)} className="text-xs justify-center tabular-nums">
                    {preset}%
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              onClick={zoomIn}
              title="Zoom in"
              className="px-2 h-full text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Sizing Mode: Fit width / Fill height */}
          <div className="flex items-center h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 overflow-hidden shadow-sm shrink-0">
            <button
              onClick={() => applyFitMode('fit-width')}
              title="Fit page to width"
              className={cn(
                "px-2.5 h-full text-[10px] font-bold uppercase tracking-wide transition-colors",
                fitMode === 'fit-width' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300" : "text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
              )}
            >
              Fit
            </button>
            <button
              onClick={() => applyFitMode('fit-page')}
              title="Fill available height"
              className={cn(
                "px-2.5 h-full text-[10px] font-bold uppercase tracking-wide transition-colors border-l border-slate-200 dark:border-slate-700",
                fitMode === 'fit-page' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300" : "text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
              )}
            >
              Fill
            </button>
          </div>

          {/* Leading context */}
          <div className="flex items-center gap-2 min-w-0 pl-1">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
              {isWordTemplate ? 'Document Preview' : 'Live Preview'}
            </h3>
            {isPreviewLoading && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-custom-blue shrink-0" />
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 min-w-0">
          {templateName && (
            <span className="hidden lg:block text-xs text-slate-400 truncate max-w-[200px]">{templateName}</span>
          )}
          {documentType && (
            <Badge variant="outline" className="text-[10px] font-medium bg-slate-50 border-slate-200 hidden sm:inline-flex">
              {documentType}
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px] font-medium bg-emerald-50 text-emerald-700 border-emerald-200 gap-1 shrink-0">
            <Eye className="h-3 w-3" />
            {isWordTemplate ? 'Doc' : 'Live'}
          </Badge>
        </div>
      </div>

      {/* Content */}
      {isWordTemplate ? (
        /* Native DOCX rendering via docx-preview */
        <div ref={scrollContainerRef} className="flex-1 overflow-auto bg-slate-200/50 dark:bg-slate-950/60 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 p-6 md:p-8 flex justify-center items-start">
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
                  className="docx-preview-container bg-white border border-slate-200/60 dark:border-slate-800/60 shadow-2xl shadow-slate-300/30 dark:shadow-black/40 w-[800px]"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 px-6 w-full">
              {isPreviewLoading ? (
                <Loader2 className="h-8 w-8 animate-spin text-custom-blue" />
              ) : (
                emptyState
              )}
            </div>
          )}
        </div>
      ) : (
        /* HTML live preview */
        <div ref={scrollContainerRef} className="flex-1 overflow-auto bg-slate-200/50 dark:bg-slate-950/60 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700">
          <div className="max-w-4xl mx-auto p-6 md:p-8 flex flex-col items-center min-h-full">
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
                        "bg-white shadow-2xl shadow-slate-300/30 dark:shadow-black/40 overflow-hidden",
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
              <div className="flex flex-col items-center justify-center py-16 px-6 w-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-800 shadow-sm">
                {isPreviewLoading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-custom-blue" />
                ) : (
                  emptyState
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Docked Pagination Footer - same pill controls as DocumentViewer */}
      {hasOutput && (
        <div className="shrink-0 flex items-center justify-center gap-2.5 px-4 py-2 border-t border-slate-200/70 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur z-10">
          <div className="flex items-center h-8 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <button onClick={() => scrollToPage(currentPage - 1)} disabled={currentPage <= 1} title="Previous page" className="w-8 h-full flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          <span className="text-xs font-medium text-slate-600 dark:text-slate-300 tabular-nums">
            Page <span className="text-slate-900 dark:text-white font-bold">{currentPage}</span> / {totalPages}
          </span>

          <div className="flex items-center h-8 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <button onClick={() => scrollToPage(currentPage + 1)} disabled={currentPage >= totalPages} title="Next page" className="w-8 h-full flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
