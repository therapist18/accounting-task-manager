import { useEffect, useMemo, useRef, useState } from 'react';
import supabase from '@/lib/supabase/client';
import { replacePlaceholders } from '../../tasks-requirements/utils/templateFormatters';
import { Button } from '@/components/ui/button';
import {
  Download, Loader2, Save, FileText, FileWarning, Palette, FileDown,
  ZoomIn, ZoomOut, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ChevronDown, List, RefreshCw,
} from 'lucide-react';
import { saveAs } from 'file-saver';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ContractThemePanel } from './ContractThemePanel';
import { ContractThemeSettings, DEFAULT_CONTRACT_THEME, applyThemeToHtml } from '../utils/themeEngine';
import {
  resolveEffectiveSettings, resolveEffectiveClauses, assembleContractHtml,
} from '../utils/clauseEngine';
import { EcClause, fetchClauses } from '../utils/clauseLibraryData';
import { EcJobProfile } from '../utils/jobProfileData';
import { EmploymentOffer, createEmploymentOffer, updateEmploymentOffer } from '../utils/employmentOfferData';
import { buildStandardPlaceholderValues } from '../utils/standardPlaceholders';
import { useMasterFieldValues } from '../hooks/useMasterFieldValues';
import { CONTRACT_SECTIONS } from '../utils/contractStructure';
import { fetchCompanies, Company } from '../../companies/database';
import type { EcPlaceholder } from '../utils/ecPlaceholders';

// Placeholders whose value is HTML list markup (<li>...</li> fragments, not
// a scalar fact) - an empty list is a legitimate state ("no benefits
// configured", "no extra responsibilities entered"), not a missing fact, so
// these never get the missing-value placeholder treatment below.
const LIST_MARKUP_KEYS = new Set(['applicable_benefits', 'key_responsibilities']);

// A single em dash reads as ambiguous - could be a stray hyphen, could be
// intentional punctuation in a clause. A visibly blank-looking run makes it
// unmistakable that a fact belongs there and hasn't been filled in yet.
const MISSING_VALUE_PLACEHOLDER = '_________________';

// Wraps each resolved value in a colored span keyed by which entity (Company
// vs Employee) the placeholder is tagged as - purely a visual aid for
// reviewing the preview, not a data change. Iterates the full ecPlaceholders
// registry (not just whatever buildStandardPlaceholderValues happened to
// produce a key for) so a token that never resolved into any value at all -
// e.g. an unlinked master_field placeholder like contract_date or
// employee_address, referenced in clause text but with no source_kind
// default and no master field link yet - still shows the missing-value
// placeholder instead of silently vanishing via replacePlaceholders' own
// "unknown key -> ''" behavior.
function buildHighlightedPreviewValues(
  employee: any,
  company: Company | null | undefined,
  offer: EmploymentOffer | null | undefined,
  effectiveSettings: Record<string, any>,
  masterFieldValues: Record<string, string>,
  selectedJobProfile: EcJobProfile | null,
  ecPlaceholders: EcPlaceholder[]
): Record<string, string> {
  const raw = employee
    ? buildStandardPlaceholderValues(employee, company, offer, effectiveSettings, offer?.placeholder_overrides, masterFieldValues, selectedJobProfile, ecPlaceholders)
    : {};

  const wrap = (key: string, value: string, entity: string | undefined): string => {
    const isMissing = !value && !LIST_MARKUP_KEYS.has(key);
    const display = isMissing ? MISSING_VALUE_PLACEHOLDER : value;
    const missingClass = isMissing ? ' ph-entity-missing' : '';
    if (entity === 'company') return `<span class="ph-entity-company${missingClass}">${display}</span>`;
    if (entity === 'employee') return `<span class="ph-entity-employee${missingClass}">${display}</span>`;
    return display;
  };

  const highlighted: Record<string, string> = {};
  for (const p of ecPlaceholders) {
    highlighted[p.key] = wrap(p.key, raw[p.key] || '', p.entity_type?.[0]);
  }
  for (const [key, value] of Object.entries(raw)) {
    if (key in highlighted) continue;
    highlighted[key] = wrap(key, value, undefined);
  }
  return highlighted;
}

interface ContractPreviewProps {
  contractData: any;
  setContractData?: (updater: any) => void;
  selectedJobProfile: EcJobProfile | null;
  previewOnly?: boolean;
  className?: string;
}

export function ContractPreview({ contractData, setContractData, selectedJobProfile, previewOnly, className }: ContractPreviewProps) {
  const employee = contractData?.employee;
  const offer: Partial<EmploymentOffer> | undefined = contractData?.offer;
  const companyId = employee?.companyId;

  const [clauses, setClauses] = useState<EcClause[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);

  const [themeOverride, setThemeOverride] = useState<ContractThemeSettings | null>(contractData?.metadata?.themeSettings || null);
  const [themePanelOpen, setThemePanelOpen] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [showToc, setShowToc] = useState(true);

  const htmlCaptureRef = useRef<HTMLDivElement>(null);
  const contentMeasureRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Pagination Configuration
  const PAGE_WIDTH_PX = 794; // Standard A4 width at 96dpi
  const PAGE_HEIGHT_PX = 1123; // Standard A4 height at 96dpi
  const [zoomPct, setZoomPct] = useState(80);
  const manualZoomRatio = zoomPct / 100;
  const [sizingMode, setSizingMode] = useState<'manual' | 'fit' | 'fill'>('manual');
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const FIT_PADDING_PX = 64;
  const zoomRatio = useMemo(() => {
    if (sizingMode === 'fit' && containerSize.width > 0) return Math.max(0.1, (containerSize.width - FIT_PADDING_PX) / PAGE_WIDTH_PX);
    if (sizingMode === 'fill' && containerSize.height > 0) return Math.max(0.1, (containerSize.height - FIT_PADDING_PX) / PAGE_HEIGHT_PX);
    return manualZoomRatio;
  }, [sizingMode, containerSize, manualZoomRatio]);
  const setManualZoom = (updater: (z: number) => number) => {
    setSizingMode('manual');
    setZoomPct((z) => Math.min(150, Math.max(40, updater(z))));
  };
  const [contentHeightPx, setContentHeightPx] = useState(0);

  // Calculate total pages safely based on real measured height
  const totalPages = Math.max(1, Math.ceil(contentHeightPx / PAGE_HEIGHT_PX));
  // The visible page canvas is snapped to a whole multiple of the page height,
  // so the last page reads as a full sheet instead of clipping to wherever the
  // content happens to end (which left a gray gap below short documents).
  const pageCanvasHeightPx = totalPages * PAGE_HEIGHT_PX;

  // Load base context - companyId is optional (job profiles can be scoped
  // "General / No Company"), in which case company just stays null but
  // clauses (global) still resolve, so the preview keeps working instead of
  // getting stuck on a fetch that never runs. No job-profiles fetch here -
  // settings/clauses resolve only from selectedJobProfile itself (no
  // Company/Department inheritance, see resolveEffectiveClauses).
  useEffect(() => {
    async function loadContext() {
      setLoadingContext(true);
      const [allClauses, companies] = await Promise.all([
        fetchClauses(),
        fetchCompanies(),
      ]);
      setClauses(allClauses);
      setCompany(companyId ? companies.find((c) => String(c.id) === String(companyId)) || null : null);
      setLoadingContext(false);
    }
    loadContext();
  }, [companyId]);

  // Reset the live theme customization whenever we switch to a different
  // employee's contract, preloading whatever theme was saved on it last time.
  useEffect(() => {
    setThemeOverride(contractData?.metadata?.themeSettings || null);
  }, [employee?.individualId]);

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

  // Track natural unscaled height for pagination math
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
    images.forEach(img => img.addEventListener('load', measure));
    
    return () => {
      observer.disconnect();
      images.forEach(img => img.removeEventListener('load', measure));
    };
  }, [themeOverride, showToc]);

  // Scroll-based page tracking + TOC anchor click interception
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
    container.scrollTo({ top: (page - 1) * PAGE_HEIGHT_PX * zoomRatio, behavior: 'smooth' });
  };

  // Reset scroll on document switch or TOC toggle
  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0 });
    setCurrentPage(1);
  }, [employee?.individualId, showToc]);

  const clausesById = useMemo(() => Object.fromEntries(clauses.map((c) => [c.id, c])), [clauses]);

  const effectiveSettings = useMemo(() => resolveEffectiveSettings([
    selectedJobProfile, offer ? { settings: offer.settings_overrides } : null,
  ]), [selectedJobProfile, offer]);

  const effectiveClauses = useMemo(() => resolveEffectiveClauses([
    selectedJobProfile, offer ? { section_clauses: offer.section_clauses_overrides } : null,
  ]), [selectedJobProfile, offer]);

  // Temporary diagnostic logging for the clause-resolution cascade - remove
  // once the no-inheritance behavior is confirmed working end to end.
  useEffect(() => {
    console.log('[ContractPreview] clause resolution', {
      selectedJobProfile_section_clauses: selectedJobProfile?.section_clauses,
      offer_section_clauses_overrides: offer?.section_clauses_overrides,
      effectiveClauses,
      unresolvedSections: CONTRACT_SECTIONS.map((s) => s.key).filter((k) => !effectiveClauses[k]),
    });
  }, [selectedJobProfile, offer, effectiveClauses]);

  const { ecPlaceholders, masterFieldValues, isResolving: isResolvingMasterFields, refresh: refreshMasterFieldValues } = useMasterFieldValues(employee?.individualId, companyId);

  const employeeValues = useMemo(
    () => buildHighlightedPreviewValues(employee, company, offer as EmploymentOffer, effectiveSettings, masterFieldValues, selectedJobProfile, ecPlaceholders),
    [employee, company, offer, effectiveSettings, masterFieldValues, selectedJobProfile, ecPlaceholders]
  );

  const bodyHtml = useMemo(() => {
    if (!employee) return '';
    return assembleContractHtml({
      sectionKeys: CONTRACT_SECTIONS.map((s) => s.key),
      clausesById,
      effectiveClauses,
      effectiveSettings,
      employeePlaceholderValues: employeeValues,
      includeToc: showToc,
    });
  }, [clausesById, effectiveClauses, effectiveSettings, employeeValues, employee, showToc]);

  const themeSettings: ContractThemeSettings = themeOverride || DEFAULT_CONTRACT_THEME;
  const mergedValues = { ...effectiveSettings, ...employeeValues };

  const themedHtml = bodyHtml ? replacePlaceholders(applyThemeToHtml(bodyHtml, themeSettings), mergedValues) : '';
  const wordSafeHtml = bodyHtml ? replacePlaceholders(applyThemeToHtml(bodyHtml, themeSettings, { wordSafe: true }), mergedValues) : '';

  const updateThemeSettings = (settings: ContractThemeSettings) => setThemeOverride(settings);

  const buildOutput = (): { blob: Blob; fileName: string } | null => {
    if (!employee || !wordSafeHtml) return null;
    const baseName = employee.fullName.replace(/\s+/g, '_');
    const htmlDoc = `<!doctype html><html><head><meta charset="utf-8"><title>${baseName} Employment Contract</title></head><body>${wordSafeHtml}</body></html>`;
    return { blob: new Blob([htmlDoc], { type: 'application/msword' }), fileName: `${baseName}_Employment_Contract.doc` };
  };

  const handleDownloadWord = () => {
    const output = buildOutput();
    if (output) saveAs(output.blob, output.fileName);
  };

  const handleDownloadPdf = async () => {
    const element = htmlCaptureRef.current;
    if (!element || !employee) return;

    setIsGeneratingPdf(true);
    try {
      if (typeof document !== 'undefined' && (document as any).fonts?.ready) {
        try { await (document as any).fonts.ready; } catch { /* ignore */ }
      }
      await Promise.all(
        Array.from(element.querySelectorAll('img')).map((img) =>
          (img as HTMLImageElement).complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                (img as HTMLImageElement).addEventListener('load', () => resolve(), { once: true });
                (img as HTMLImageElement).addEventListener('error', () => resolve(), { once: true });
              })
        )
      );

      const canvas = await html2canvas(element, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      const totalPdfPages = Math.ceil(imgHeight / pageHeight);

      for (let i = 0; i < totalPdfPages; i++) {
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, -(i * pageHeight), imgWidth, imgHeight);
      }

      const baseName = employee.fullName.replace(/\s+/g, '_');
      pdf.save(`${baseName}_Employment_Contract.pdf`);
    } catch (err: any) {
      console.error('PDF generation failed:', err);
      toast.error('Failed to generate PDF. Please try again.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleSaveToDb = async () => {
    const output = buildOutput();
    if (!output || !employee || !offer || !selectedJobProfile) return;
    setIsSaving(true);
    try {
      const offerPayload = { ...offer, job_profile_id: selectedJobProfile.id, status: 'active' as const };
      const persistedOffer = offer.id
        ? await updateEmploymentOffer(offer.id, offerPayload)
        : await createEmploymentOffer(offerPayload);
      if (!persistedOffer) throw new Error('Failed to save the employment offer');
      setContractData?.((prev: any) => ({ ...prev, offer: persistedOffer }));

      const fileName = `generated/${employee.companyId}/${employee.individualId}/${Date.now()}_contract.doc`;
      const { error: uploadError } = await supabase.storage.from("kyc-templates").upload(fileName, output.blob, { contentType: output.blob.type });
      if (uploadError) throw new Error('Failed to upload generated document to storage');

      const { data: { session } } = await supabase.auth.getSession();
      const { data: insertData, error: insertError } = await supabase
        .from('acc_employment_contracts')
        .insert([{
          contract_number: `CNT-${Date.now()}`,
          employee_id: String(employee.individualId),
          company_id: String(employee.companyId),
          status: 'generated',
          docx_path: fileName,
          metadata: { jobProfileId: selectedJobProfile.id, employmentOfferId: persistedOffer.id, effectiveSettings, themeSettings },
          generated_by: session?.user?.id || null
        }])
        .select()
        .single();

      if (insertError) throw new Error('Failed to save contract record');

      if (insertData) {
        await supabase.from('acc_employment_contracts_audit').insert([{
          contract_id: insertData.id, action: 'generated', user_id: session?.user?.id || null, details: `Contract generated for ${employee.fullName}`
        }]);
      }

      toast.success('Contract generated and saved successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Error saving contract');
    } finally {
      setIsSaving(false);
    }
  };

  if (!employee || !selectedJobProfile) {
    return (
      <div className={className || "flex flex-col items-center justify-center h-full text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm mx-5 mb-5 lg:ml-0 lg:flex-1 lg:min-w-[600px]"}>
        <FileWarning className="w-12 h-12 mb-4 text-slate-300 dark:text-slate-700" />
        <h3 className="text-base font-medium text-slate-700 dark:text-slate-300">
          {!employee ? 'No Employee Selected' : 'No Job Profile Selected'}
        </h3>
        <p className="text-sm mt-1 text-slate-500">Configure the basic terms to preview the document.</p>
      </div>
    );
  }

  const hasOutput = !!bodyHtml;

  return (
    <div className={className || "flex flex-col h-full bg-slate-100/50 dark:bg-slate-900 shadow-inner overflow-hidden flex-1 lg:min-w-[600px] relative"}>
      
      {/* Sleek Glassy Toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2.5 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/60 dark:border-slate-700/60 shadow-lg shadow-slate-200/20 dark:shadow-black/20 rounded-2xl z-20 flex items-center gap-4 transition-all">
        <div className="flex items-center gap-2">
          {/* Zoom Controls */}
          <div className="flex items-center h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 overflow-hidden">
            <button
              onClick={() => setManualZoom((z) => z - 10)}
              disabled={sizingMode === 'manual' && zoomPct <= 40}
              title="Zoom out"
              className="px-2 h-full text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300 w-10 text-center tabular-nums select-none">
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
          <div className="flex items-center h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 overflow-hidden">
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
        </div>

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowToc((v) => !v)}
            title="Toggle table of contents"
            className={cn(
              "w-8 h-8 flex items-center justify-center rounded-lg transition-colors",
              showToc
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setThemePanelOpen(true)}
            title="Customize theme"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Palette className="w-4 h-4" />
          </button>
          <button
            onClick={refreshMasterFieldValues}
            disabled={isResolvingMasterFields}
            title="Re-resolve master field values (e.g. after linking a placeholder on the Data Sources page)"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", isResolvingMasterFields && "animate-spin")} />
          </button>
        </div>

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />

        <div className="flex items-center gap-2">
          {/* Export menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                disabled={!hasOutput || loadingContext}
                className="h-8 px-3 flex items-center gap-1.5 rounded-lg text-xs font-medium bg-slate-50 border border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
              >
                {isGeneratingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                Export
                <ChevronDown className="w-3 h-3 ml-0.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40 rounded-xl">
              <DropdownMenuItem onClick={handleDownloadPdf} disabled={!hasOutput || loadingContext || isGeneratingPdf}>
                <FileDown className="w-3.5 h-3.5 mr-2 text-slate-400" /> PDF Document
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownloadWord} disabled={!hasOutput || loadingContext}>
                <FileText className="w-3.5 h-3.5 mr-2 text-slate-400" /> Word Document
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Primary action */}
          {!previewOnly && (
            <Button
              size="sm"
              className="h-8 px-4 text-xs font-medium bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md rounded-lg"
              onClick={handleSaveToDb}
              disabled={!hasOutput || loadingContext || isSaving}
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-2" />}
              Generate
            </Button>
          )}
        </div>
      </div>

      {/* Main Preview Area - Scrollable */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-auto bg-slate-100/50 dark:bg-slate-950/50 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 pt-16"
      >
        {!hasOutput && !loadingContext ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <FileWarning className="w-10 h-10 mb-3" />
            <p className="text-sm">Nothing to preview yet.</p>
          </div>
        ) : loadingContext ? (
          <div className="flex items-center justify-center h-full min-h-[300px]">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="py-12 px-4 flex flex-col items-center min-h-full">
            {/* Scaled wrapper */}
            <div
              className="relative shrink-0 shadow-2xl shadow-slate-300/30 dark:shadow-black/40 transition-transform duration-200"
              style={{ width: PAGE_WIDTH_PX * zoomRatio, height: pageCanvasHeightPx * zoomRatio }}
            >
              {/* Document canvas */}
              <div
                className="absolute top-0 left-0 bg-white origin-top-left"
                style={{
                  width: PAGE_WIDTH_PX,
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
                    style={{ top: (i + 1) * PAGE_HEIGHT_PX }}
                  >
                    <div className="border-t border-dashed border-slate-300/60" style={{ marginLeft: 48, marginRight: 48 }} />
                  </div>
                ))}

                {/* Contract content */}
                <div className="p-12 text-[14.5px] leading-relaxed relative z-0">
                  <div dangerouslySetInnerHTML={{ __html: themedHtml }} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sticky Pagination Controls - Fixed to the bottom */}
      {hasOutput && !loadingContext && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/90 dark:bg-slate-900/90 backdrop-blur border border-slate-200 dark:border-slate-800 rounded-full py-1.5 px-4 flex items-center justify-center gap-4 text-xs text-slate-600 dark:text-slate-300 font-medium z-10 shadow-lg shadow-slate-200/20 dark:shadow-black/20">
          <div className="flex items-center gap-0.5">
            <button onClick={() => scrollToPage(1)} disabled={currentPage <= 1} className="p-1 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
              <ChevronsLeft className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => scrollToPage(currentPage - 1)} disabled={currentPage <= 1} className="p-1 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
          
          <span className="tabular-nums min-w-[70px] text-center font-semibold">Page {currentPage} / {totalPages}</span>
          
          <div className="flex items-center gap-0.5">
            <button onClick={() => scrollToPage(currentPage + 1)} disabled={currentPage >= totalPages} className="p-1 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => scrollToPage(totalPages)} disabled={currentPage >= totalPages} className="p-1 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
              <ChevronsRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <ContractThemePanel
        open={themePanelOpen}
        onClose={() => setThemePanelOpen(false)}
        settings={themeSettings}
        onChange={updateThemeSettings}
      />

      <div 
        className="absolute top-0 left-0 pointer-events-none z-[-1] opacity-0" 
        aria-hidden="true"
      >
        <div 
          ref={contentMeasureRef} 
          className="bg-white" 
          style={{ width: PAGE_WIDTH_PX }} 
        >
          <div className="p-12 text-[14.5px] leading-relaxed">
            <div dangerouslySetInnerHTML={{ __html: themedHtml }} />
          </div>
        </div>
        
        <div ref={htmlCaptureRef} className="bg-white text-black p-12 text-[14.5px] leading-relaxed" style={{ width: PAGE_WIDTH_PX }}>
          <div dangerouslySetInnerHTML={{ __html: themedHtml }} />
        </div>
      </div>
    </div>
  );
}