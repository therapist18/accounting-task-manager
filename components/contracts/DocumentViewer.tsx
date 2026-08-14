'use client';

// Shared document preview shell for the contract modules (Employment
// Contracts, Consultancy Contracts - anything that renders themed contract
// HTML on a paginated A4 canvas). Extracted from Employment Contracts'
// ContractPreview.tsx so the two modules stop carrying two divergent copies
// of the same machinery: zoom (manual/Fit/Fill), scroll-based page tracking,
// pagination footer, page-break guides, the hidden measurement clone, and the
// print-only portal that feeds the browser's native Save-as-PDF pipeline.
//
// What stays in the calling module:
//   - the toolbar's right-hand actions (theme, export, save/generate...)
//   - any leading context content (e.g. the Consultancy module's client name)
//   - the empty/loading states and the themed HTML itself (applyThemeToHtml)
//   - Word export and data persistence - the viewer is rendering only

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileWarning, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '@/lib/utils';

// Standard A4 at 96dpi - matches every consumer's page size assumptions.
export const DOC_PAGE_WIDTH_PX = 794;
export const DOC_PAGE_HEIGHT_PX = 1123;
// The canvas wrapper below uses px-6/py-8 (24px/32px per side) - these must
// match that real padding exactly or Fit/Fill over-reserve space (the old
// shared guess of 64px both ways mis-accounted for one axis).
const DOC_PAGE_GUTTER_X_PX = 24 * 2;
const DOC_PAGE_GUTTER_Y_PX = 32 * 2;

export interface DocumentViewerHandle {
  // The portaled, print-only copy of the document (see the portal at the
  // bottom). Hand this element to printElementAsPdf so the module's PDF
  // export goes through the same browser-print pipeline the viewer's own
  // print CSS targets.
  getPrintArea: () => HTMLDivElement | null;
}

export interface DocumentViewerProps {
  // The themed body markup (the .contract-theme-X wrapper from
  // applyThemeToHtml). Rendered both on the live canvas and (as the base for
  // the measurement clone). When empty, the viewer shows `empty` instead.
  html: string;
  // What the print-only portal renders. Defaults to `html`. Modules that
  // need a different variant for the final document (e.g. Employment
  // Contracts' hideMissingClauses build, or a pdf-section id rename so the
  // hidden live copy can't win the print anchor lookup) pass it here.
  printHtml?: string;
  // Changing this resets scroll + page tracker to the top (document switch,
  // ToC toggle, ...).
  contentKey?: string;
  className?: string;
  // Optional content rendered on the toolbar's left, after the zoom/fit
  // controls (e.g. a client name + status badge).
  leading?: ReactNode;
  // The module's right-hand toolbar controls (theme, export, save, ...).
  actions?: ReactNode;
  // Shown in the scroll area when html is empty and not loading.
  empty?: ReactNode;
  loading?: boolean;
  // Modules that don't want the docked pagination footer can hide it.
  showPagination?: boolean;
}

export const DocumentViewer = forwardRef<DocumentViewerHandle, DocumentViewerProps>(function DocumentViewer(
  { html, printHtml, contentKey = '', className, leading, actions, empty, loading = false, showPagination = true },
  ref
) {
  const hasOutput = !!html;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentMeasureRef = useRef<HTMLDivElement>(null);
  const printAreaRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Defaults to "fit" (scaled to the panel's width) rather than a fixed
  // manual 80% - see the Employment Contracts original for the reasoning.
  const [zoomPct, setZoomPct] = useState(80);
  const manualZoomRatio = zoomPct / 100;
  const [sizingMode, setSizingMode] = useState<'manual' | 'fit' | 'fill'>('fit');
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const zoomRatio = useMemo(() => {
    if (sizingMode === 'fit' && containerSize.width > 0) return Math.max(0.1, (containerSize.width - DOC_PAGE_GUTTER_X_PX) / DOC_PAGE_WIDTH_PX);
    if (sizingMode === 'fill' && containerSize.height > 0) return Math.max(0.1, (containerSize.height - DOC_PAGE_GUTTER_Y_PX) / DOC_PAGE_HEIGHT_PX);
    return manualZoomRatio;
  }, [sizingMode, containerSize, manualZoomRatio]);

  // Leaving Fit/Fill via the zoom +/- buttons must continue from the ratio
  // actually on screen, not from the stale `zoomPct` state (Fit/Fill compute
  // zoomRatio independently and never write it back into zoomPct).
  const setManualZoom = (updater: (z: number) => number) => {
    const base = sizingMode === 'manual' ? zoomPct : Math.round(zoomRatio * 100);
    setSizingMode('manual');
    setZoomPct(Math.min(150, Math.max(40, updater(base))));
  };

  const [contentHeightPx, setContentHeightPx] = useState(0);
  const totalPages = Math.max(1, Math.ceil(contentHeightPx / DOC_PAGE_HEIGHT_PX));
  // Snapped to a whole multiple of the page height so the last page reads as
  // a full sheet instead of clipping short (leaving a gray gap).
  const pageCanvasHeightPx = totalPages * DOC_PAGE_HEIGHT_PX;

  // Track the scroll container's box size for the fit/fill sizing modes.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Measure natural unscaled content height for the pagination math. The
  // hidden clone stays at exactly DOC_PAGE_WIDTH_PX (the canvas below renders
  // at that width too), so scrollHeight is the page-accurate height.
  useEffect(() => {
    const el = contentMeasureRef.current;
    if (!el) return;

    const measure = () => {
      setTimeout(() => setContentHeightPx(el.scrollHeight), 50);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);

    const images = el.querySelectorAll('img');
    images.forEach((img) => img.addEventListener('load', measure));

    return () => {
      observer.disconnect();
      images.forEach((img) => img.removeEventListener('load', measure));
    };
  }, [html]);

  // Scroll-based page tracking + ToC anchor click interception.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    let rafId: number;

    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const page = Math.floor(container.scrollTop / (DOC_PAGE_HEIGHT_PX * zoomRatio)) + 1;
        setCurrentPage(Math.max(1, Math.min(page, totalPages)));
      });
    };

    const onClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest('a[href^="#"]');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href || href === '#') return;
      const target = container.querySelector(href);
      if (!target) return;
      e.preventDefault();
      const targetRect = target.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      container.scrollTo({
        top: container.scrollTop + (targetRect.top - containerRect.top),
        behavior: 'smooth',
      });
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    container.addEventListener('click', onClick);
    onScroll();
    return () => {
      container.removeEventListener('scroll', onScroll);
      container.removeEventListener('click', onClick);
      cancelAnimationFrame(rafId);
    };
  }, [totalPages, zoomRatio]);

  const scrollToPage = (page: number) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: (page - 1) * DOC_PAGE_HEIGHT_PX * zoomRatio, behavior: 'smooth' });
  };

  // Reset scroll on document switch.
  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0 });
    setCurrentPage(1);
  }, [contentKey]);

  useImperativeHandle(ref, () => ({
    getPrintArea: () => printAreaRef.current,
  }));

  const toolbarVisible = !!(leading || actions);

  return (
    <>
      <div className={cn('flex flex-col h-full w-full min-w-0 overflow-hidden relative', className, 'print:hidden')}>
        {toolbarVisible && (
          <div className="shrink-0 flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-200/70 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur z-20">
            <div className="flex items-center gap-1.5 min-w-0">
              {/* Zoom Controls */}
              <div className="flex items-center h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 overflow-hidden shadow-sm shrink-0">
                <button
                  onClick={() => setManualZoom((z) => z - 10)}
                  disabled={sizingMode === 'manual' && zoomPct <= 40}
                  title="Zoom out"
                  className="px-2 h-full text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300 w-10 text-center tabular-nums select-none border-x border-slate-200 dark:border-slate-700">
                  {Math.round(zoomRatio * 100)}%
                </span>
                <button
                  onClick={() => setManualZoom((z) => z + 10)}
                  disabled={sizingMode === 'manual' && zoomPct >= 150}
                  title="Zoom in"
                  className="px-2 h-full text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Sizing Mode: Fit width / Fill height */}
              <div className="flex items-center h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 overflow-hidden shadow-sm shrink-0">
                <button
                  onClick={() => setSizingMode('fit')}
                  title="Fit page to width"
                  className={cn(
                    "px-2.5 h-full text-[10px] font-bold uppercase tracking-wide transition-colors",
                    sizingMode === 'fit' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300" : "text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                  )}
                >
                  Fit
                </button>
                <button
                  onClick={() => setSizingMode('fill')}
                  title="Fill available height"
                  className={cn(
                    "px-2.5 h-full text-[10px] font-bold uppercase tracking-wide transition-colors border-l border-slate-200 dark:border-slate-700",
                    sizingMode === 'fill' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300" : "text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                  )}
                >
                  Fill
                </button>
              </div>

              {leading}
            </div>

            <div className="flex items-center gap-1.5 min-w-0">{actions}</div>
          </div>
        )}

        {/* Main Preview Area - Scrollable */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-auto bg-slate-200/50 dark:bg-slate-950/60 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700"
        >
          {loading ? (
            <div className="flex items-center justify-center h-full min-h-[300px]">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : !hasOutput ? (
            empty || (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <FileWarning className="w-10 h-10 mb-3" />
                <p className="text-sm">Nothing to preview yet.</p>
              </div>
            )
          ) : (
            <div className="py-8 px-6 flex flex-col items-center min-h-full">
              {/* Scaled wrapper */}
              <div
                className="relative shrink-0 shadow-2xl shadow-slate-300/30 dark:shadow-black/40 transition-transform duration-200"
                style={{ width: DOC_PAGE_WIDTH_PX * zoomRatio, height: pageCanvasHeightPx * zoomRatio }}
              >
                {/* Document canvas */}
                <div
                  className="absolute top-0 left-0 bg-white origin-top-left"
                  style={{
                    width: DOC_PAGE_WIDTH_PX,
                    height: pageCanvasHeightPx,
                    transform: `scale(${zoomRatio})`,
                    color: 'black',
                  }}
                >
                  {/* Page break guides */}
                  {Array.from({ length: totalPages - 1 }, (_, i) => (
                    <div
                      key={`pb-${i}`}
                      className="absolute left-0 right-0 pointer-events-none z-10"
                      style={{ top: (i + 1) * DOC_PAGE_HEIGHT_PX }}
                    >
                      <div className="border-t border-dashed border-slate-300/60" style={{ marginLeft: 48, marginRight: 48 }} />
                    </div>
                  ))}

                  {/* Contract content. No outer padding here - applyThemeToHtml's
                      .contract-theme-X wrapper already carries its own 48px padding
                      (see themeEngine.ts), and both the print and Word export paths
                      already rely on that being the only page margin. */}
                  <div className="text-[14.5px] leading-relaxed relative z-0">
                    <div dangerouslySetInnerHTML={{ __html: html }} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Docked Pagination Footer */}
        {showPagination && hasOutput && !loading && (
          <div className="shrink-0 flex items-center justify-center gap-2.5 px-4 py-2 border-t border-slate-200/70 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur z-10">
            <div className="flex items-center h-8 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
              <button onClick={() => scrollToPage(1)} disabled={currentPage <= 1} title="First page" className="w-8 h-full flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors border-r border-slate-100 dark:border-slate-800">
                <ChevronsLeft className="w-4 h-4" />
              </button>
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
              <button onClick={() => scrollToPage(totalPages)} disabled={currentPage >= totalPages} title="Last page" className="w-8 h-full flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors border-l border-slate-100 dark:border-slate-800">
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Hidden, unscaled measurement clone - must stay padding-identical to
            the visible canvas copy above (this is what pagination height is
            measured from). */}
        <div className="absolute top-0 left-0 pointer-events-none z-[-1] opacity-0" aria-hidden="true">
          <div ref={contentMeasureRef} className="bg-white" style={{ width: DOC_PAGE_WIDTH_PX }}>
            <div className="text-[14.5px] leading-relaxed">
              <div dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          </div>
        </div>
      </div>

      {/* Print-only area, portaled straight to document.body. ContractViewers
          are nested deep inside the module pages (sidebar, data panels,
          react-resizable-panels' Panel wrappers, an overflow-hidden page
          root) - the classic "print just this element" trick still gets
          clipped in such a tree, so portaling makes the print copy a true
          sibling of the app root with no overflow-hidden/position ancestor
          left to crop it. Modules pass the element from getPrintArea() to
          printElementAsPdf for the actual Save-as-PDF flow. */}
      {typeof document !== 'undefined' &&
        createPortal(
          <>
            <style>{`
              @media print {
                @page { size: A4; margin: 0.5in; }
                html, body { margin: 0; height: auto !important; overflow: visible !important; }
                body > * { visibility: hidden !important; }
                .ec-print-area, .ec-print-area * { visibility: visible !important; }
                .ec-print-area {
                  position: absolute !important;
                  top: 0; left: 0;
                  width: 100% !important;
                  height: auto !important;
                  margin: 0;
                  overflow: visible !important;
                }
                .ec-print-area [class^="contract-theme-"] {
                  padding: 0 !important;
                  max-width: 100% !important;
                  margin: 0 !important;
                }
              }
            `}</style>
            <div ref={printAreaRef} className="hidden print:block ec-print-area bg-white text-black">
              <div dangerouslySetInnerHTML={{ __html: printHtml ?? html }} />
            </div>
          </>,
          document.body
        )}
    </>
  );
});
