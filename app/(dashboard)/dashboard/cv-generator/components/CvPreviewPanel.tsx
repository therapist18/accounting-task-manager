"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildCvDocument, type CvDocument } from "@/lib/cvThemeEngine";

// Mirrors the Employment Contracts preview's pagination/toolbar design (see
// ContractPreview.tsx) so both document-preview modules look and behave the
// same way, instead of the CV Builder having its own unrelated, page-count-less
// preview. Standard A4 page size at 96dpi — matches ContractPreview's own
// PAGE_WIDTH_PX/PAGE_HEIGHT_PX constants and the #cv-preview-container CSS
// (210mm/297mm) in globals.css closely enough (sub-pixel) not to matter.
const PAGE_WIDTH_PX = 794;
const PAGE_HEIGHT_PX = 1123;

interface CvPreviewPanelProps {
  cvData: any;
  cvSettings: any;
  selectedLayout: string;
  previewRef: React.RefObject<HTMLDivElement>;
  title?: string;
}

export function CvPreviewPanel({
  cvData,
  cvSettings,
  selectedLayout,
  previewRef,
  title = "Live Preview",
}: CvPreviewPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [contentHeightPx, setContentHeightPx] = useState(0);

  // Build the themed document (shared with the .doc export via
  // buildCvDocument) so the live preview IS the Word output — same HTML +
  // CSS in both. Async because the photo is converted to a data URL.
  const [doc, setDoc] = useState<CvDocument | null>(null);
  useEffect(() => {
    let cancelled = false;
    buildCvDocument(cvData, cvSettings, selectedLayout).then((d) => {
      if (!cancelled) setDoc(d);
    });
    return () => {
      cancelled = true;
    };
  }, [cvData, cvSettings, selectedLayout]);

  const [zoomPct, setZoomPct] = useState(80);
  const manualZoomRatio = zoomPct / 100;
  // Defaults to "fit" rather than a fixed manual percentage, same reasoning as
  // ContractPreview: a fixed zoom only looks right at one panel width and
  // either swims in dead space or overflows at any other.
  const [sizingMode, setSizingMode] = useState<"manual" | "fit" | "fill">("fit");
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const PAGE_GUTTER_X_PX = 24 * 2; // px-6
  const PAGE_GUTTER_Y_PX = 32 * 2; // py-8
  const zoomRatio = useMemo(() => {
    if (sizingMode === "fit" && containerSize.width > 0) return Math.max(0.1, (containerSize.width - PAGE_GUTTER_X_PX) / PAGE_WIDTH_PX);
    if (sizingMode === "fill" && containerSize.height > 0) return Math.max(0.1, (containerSize.height - PAGE_GUTTER_Y_PX) / PAGE_HEIGHT_PX);
    return manualZoomRatio;
  }, [sizingMode, containerSize, manualZoomRatio]);
  const setManualZoom = (updater: (z: number) => number) => {
    const base = sizingMode === "manual" ? zoomPct : Math.round(zoomRatio * 100);
    setSizingMode("manual");
    setZoomPct(Math.min(150, Math.max(40, updater(base))));
  };

  const totalPages = Math.max(1, Math.ceil(contentHeightPx / PAGE_HEIGHT_PX));
  const pageCanvasHeightPx = totalPages * PAGE_HEIGHT_PX;

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

  // Measure the actual rendered CV height directly off previewRef — its
  // element is already unscaled/unclipped on screen (only visually scaled
  // via the CSS transform on its wrapper below), so no separate hidden
  // measurement clone is needed the way ContractPreview uses one (there, the
  // visible canvas's own height is derived from totalPages, so measuring it
  // directly would be circular).
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;

    const measure = () => setContentHeightPx(el.scrollHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);

      const images = el.querySelectorAll("img");
      images.forEach((img) => img.addEventListener("load", measure));

      return () => {
        observer.disconnect();
        images.forEach((img) => img.removeEventListener("load", measure));
      };
    }, [previewRef, cvData, cvSettings, selectedLayout, doc]);

  // Scroll-based page tracking.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    let rafId: number;

    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const page = Math.floor(container.scrollTop / (PAGE_HEIGHT_PX * zoomRatio)) + 1;
        setCurrentPage(Math.max(1, Math.min(page, totalPages)));
      });
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      container.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
    };
  }, [totalPages, zoomRatio]);

  const scrollToPage = (page: number) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: (page - 1) * PAGE_HEIGHT_PX * zoomRatio, behavior: "smooth" });
  };

  return (
    <div className="bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
      {/* Docked Toolbar */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-200/70 bg-white/80 backdrop-blur z-20">
        {/* Left: Zoom + Sizing */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1 hidden sm:inline">{title}</span>
          <div className="flex items-center h-8 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden shadow-sm shrink-0">
            <button
              onClick={() => setManualZoom((z) => z - 10)}
              disabled={sizingMode === "manual" && zoomPct <= 40}
              title="Zoom out"
              className="px-2 h-full text-slate-500 hover:bg-slate-200 hover:text-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-medium text-slate-600 w-10 text-center tabular-nums select-none border-x border-slate-200">
              {Math.round(zoomRatio * 100)}%
            </span>
            <button
              onClick={() => setManualZoom((z) => z + 10)}
              disabled={sizingMode === "manual" && zoomPct >= 150}
              title="Zoom in"
              className="px-2 h-full text-slate-500 hover:bg-slate-200 hover:text-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center h-8 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden shadow-sm shrink-0">
            <button
              onClick={() => setSizingMode("fit")}
              title="Fit page to width"
              className={cn(
                "px-2.5 h-full text-[10px] font-bold uppercase tracking-wide transition-colors",
                sizingMode === "fit" ? "bg-blue-100 text-blue-700" : "text-slate-500 hover:bg-slate-200"
              )}
            >
              Fit
            </button>
            <button
              onClick={() => setSizingMode("fill")}
              title="Fill available height"
              className={cn(
                "px-2.5 h-full text-[10px] font-bold uppercase tracking-wide transition-colors border-l border-slate-200",
                sizingMode === "fill" ? "bg-blue-100 text-blue-700" : "text-slate-500 hover:bg-slate-200"
              )}
            >
              Fill
            </button>
          </div>
        </div>
      </div>

      {/* Main Preview Area - Scrollable */}
      <div ref={scrollContainerRef} className="flex-1 overflow-auto bg-slate-200/50 scrollbar-thin scrollbar-thumb-slate-300">
        <div className="py-8 px-6 flex flex-col items-center min-h-full">
          {/* Scaled wrapper */}
          <div
            className="relative shrink-0 shadow-2xl shadow-slate-300/30 transition-transform duration-200"
            style={{ width: PAGE_WIDTH_PX * zoomRatio, height: pageCanvasHeightPx * zoomRatio }}
          >
            <div
              className="absolute top-0 left-0 bg-white origin-top-left"
              style={{ width: PAGE_WIDTH_PX, height: pageCanvasHeightPx, transform: `scale(${zoomRatio})` }}
            >
              {/* Page break guides */}
              {Array.from({ length: totalPages - 1 }, (_, i) => (
                <div
                  key={`pb-${i}`}
                  className="absolute left-0 right-0 pointer-events-none z-10"
                  style={{ top: (i + 1) * PAGE_HEIGHT_PX }}
                >
                  <div className="border-t border-dashed border-slate-300/60" />
                </div>
              ))}

              <div ref={previewRef} id="cv-preview-container" style={{ width: "210mm", minHeight: "297mm", background: "white" }}>
                {doc ? (
                  <>
                    <style dangerouslySetInnerHTML={{ __html: doc.css }} />
                    <div dangerouslySetInnerHTML={{ __html: doc.bodyHtml }} />
                  </>
                ) : (
                  <div className="flex items-center justify-center" style={{ height: "297mm" }}>
                    <span className="text-xs font-medium text-slate-400">Rendering preview…</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Docked Pagination Footer */}
      <div className="shrink-0 flex items-center justify-center gap-2.5 px-4 py-2 border-t border-slate-200/70 bg-white/80 backdrop-blur z-10">
        <div className="flex items-center h-8 rounded-full border border-slate-200 bg-white shadow-sm overflow-hidden">
          <button onClick={() => scrollToPage(1)} disabled={currentPage <= 1} title="First page" className="w-8 h-full flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors border-r border-slate-100">
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button onClick={() => scrollToPage(currentPage - 1)} disabled={currentPage <= 1} title="Previous page" className="w-8 h-full flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        <span className="text-xs font-medium text-slate-600 tabular-nums">
          Page <span className="text-slate-900 font-bold">{currentPage}</span> / {totalPages}
        </span>

        <div className="flex items-center h-8 rounded-full border border-slate-200 bg-white shadow-sm overflow-hidden">
          <button onClick={() => scrollToPage(currentPage + 1)} disabled={currentPage >= totalPages} title="Next page" className="w-8 h-full flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => scrollToPage(totalPages)} disabled={currentPage >= totalPages} title="Last page" className="w-8 h-full flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors border-l border-slate-100">
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
