import { useEffect, useMemo, useRef, useState } from 'react';
import supabase from '@/lib/supabase/client';
import { replacePlaceholders } from '../../tasks-requirements/utils/templateFormatters';
import { Button } from '@/components/ui/button';
import {
  Download, Loader2, Save, FileText, FileWarning, Palette, FileDown,
  ZoomIn, ZoomOut, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  List,
} from 'lucide-react';
import { saveAs } from 'file-saver';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { ContractThemePanel } from './ContractThemePanel';
import { ContractThemeSettings, DEFAULT_CONTRACT_THEME, applyThemeToHtml } from '../utils/themeEngine';
import {
  resolveEffectiveSettings, resolveEffectiveClauses, buildDefaultClauseMap, assembleContractHtml,
} from '../utils/clauseEngine';
import { EcClause, fetchClauses } from '../utils/clauseLibraryData';
import { EcJobProfile, fetchJobProfiles, findCompanyDefaults, findDepartmentDefaults } from '../utils/jobProfileData';
import { EcContractTemplate, fetchEffectiveContractTemplate, fetchContractTemplateById } from '../utils/contractTemplateData';
import { EmploymentOffer, createEmploymentOffer, updateEmploymentOffer } from '../utils/employmentOfferData';
import { buildStandardPlaceholderValues } from '../utils/standardPlaceholders';
import { useMasterFieldValues } from '../hooks/useMasterFieldValues';
import { fetchCompanies, Company } from '../../companies/database';

interface ContractPreviewProps {
  contractData: any;
  setContractData?: (updater: any) => void;
  selectedJobProfile: EcJobProfile | null;
}

export function ContractPreview({ contractData, setContractData, selectedJobProfile }: ContractPreviewProps) {
  const employee = contractData?.employee;
  const offer: Partial<EmploymentOffer> | undefined = contractData?.offer;
  const companyId = employee?.companyId;
  const selectedTemplateId = contractData?.selectedTemplateId;

  const [clauses, setClauses] = useState<EcClause[]>([]);
  const [orgProfiles, setOrgProfiles] = useState<EcJobProfile[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [contractTemplate, setContractTemplate] = useState<EcContractTemplate | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);

  const [themeOverride, setThemeOverride] = useState<ContractThemeSettings | null>(null);
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
  const zoomRatio = zoomPct / 100;
  const [contentHeightPx, setContentHeightPx] = useState(0);
  
  // Calculate total pages safely based on real measured height
  const totalPages = Math.max(1, Math.ceil(contentHeightPx / PAGE_HEIGHT_PX));
  // The visible page canvas is snapped to a whole multiple of the page height,
  // so the last page reads as a full sheet instead of clipping to wherever the
  // content happens to end (which left a gray gap below short documents).
  const pageCanvasHeightPx = totalPages * PAGE_HEIGHT_PX;

  // Load base context
  useEffect(() => {
    async function loadContext() {
      if (!companyId) return;
      setLoadingContext(true);
      const [allClauses, profiles, companies] = await Promise.all([
        fetchClauses(),
        fetchJobProfiles(companyId),
        fetchCompanies(),
      ]);
      setClauses(allClauses);
      setOrgProfiles(profiles);
      setCompany(companies.find((c) => String(c.id) === String(companyId)) || null);
      setLoadingContext(false);
    }
    loadContext();
  }, [companyId]);

  // Resolve template
  useEffect(() => {
    async function resolveTemplate() {
      if (!companyId) return;
      if (selectedTemplateId) {
        const t = await fetchContractTemplateById(selectedTemplateId);
        setContractTemplate(t);
      } else {
        const t = await fetchEffectiveContractTemplate(companyId);
        setContractTemplate(t);
      }
      setThemeOverride(null);
    }
    resolveTemplate();
  }, [companyId, selectedTemplateId]);

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
  }, [contractTemplate, themeOverride, showToc]);

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
  }, [employee?.individualId, contractTemplate?.id, showToc]);

  const clausesById = useMemo(() => Object.fromEntries(clauses.map((c) => [c.id, c])), [clauses]);
  const defaultClauseMap = useMemo(() => buildDefaultClauseMap(clauses), [clauses]);
  const companyDefaults = useMemo(() => (companyId ? findCompanyDefaults(orgProfiles, companyId) : undefined), [orgProfiles, companyId]);
  const departmentDefaults = useMemo(() => (companyId ? findDepartmentDefaults(orgProfiles, companyId, employee?.department) : undefined), [orgProfiles, companyId, employee]);

  const effectiveSettings = useMemo(() => resolveEffectiveSettings([
    companyDefaults, departmentDefaults, selectedJobProfile, offer ? { settings: offer.settings_overrides } : null,
  ]), [companyDefaults, departmentDefaults, selectedJobProfile, offer]);

  const effectiveClauses = useMemo(() => resolveEffectiveClauses([
    companyDefaults, departmentDefaults, selectedJobProfile, offer ? { section_clauses: offer.section_clauses_overrides } : null,
  ], defaultClauseMap), [companyDefaults, departmentDefaults, selectedJobProfile, offer, defaultClauseMap]);

  const { ecPlaceholders, masterFieldValues } = useMasterFieldValues(employee?.individualId, companyId);

  const employeeValues = useMemo(
    () => (employee ? buildStandardPlaceholderValues(employee, company, offer as EmploymentOffer, effectiveSettings, offer?.placeholder_overrides, ecPlaceholders, masterFieldValues) : {}),
    [employee, company, offer, effectiveSettings, ecPlaceholders, masterFieldValues]
  );

  const bodyHtml = useMemo(() => {
    if (!contractTemplate || !employee) return '';
    return assembleContractHtml({
      sectionKeys: contractTemplate.section_keys,
      clausesById,
      effectiveClauses,
      effectiveSettings,
      employeePlaceholderValues: employeeValues,
      includeToc: showToc,
    });
  }, [contractTemplate, clausesById, effectiveClauses, effectiveSettings, employeeValues, employee, showToc]);

  const themeSettings: ContractThemeSettings = themeOverride || contractTemplate?.theme_settings || DEFAULT_CONTRACT_THEME;
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
    if (!output || !employee || !offer || !contractTemplate || !selectedJobProfile) return;
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
          template_id: contractTemplate.id,
          status: 'generated',
          docx_path: fileName,
          metadata: { jobProfileId: selectedJobProfile.id, employmentOfferId: persistedOffer.id, contractTemplateId: contractTemplate.id, effectiveSettings, themeSettings },
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
      <div className="flex flex-col items-center justify-center h-full text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm mx-5 mb-5 lg:ml-0 lg:flex-1 lg:min-w-[600px]">
        <FileWarning className="w-12 h-12 mb-4 text-slate-300 dark:text-slate-700" />
        <h3 className="text-[15px] font-medium text-slate-700 dark:text-slate-300">
          {!employee ? 'No Employee Selected' : 'No Job Profile Selected'}
        </h3>
        <p className="text-[13px] mt-1 text-slate-500">Configure the basic terms to preview the document.</p>
      </div>
    );
  }

  const hasOutput = !!bodyHtml;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 shadow-sm overflow-hidden flex-1 lg:min-w-[600px] relative">
      
      {/* Header & Toolbar */}
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white dark:bg-slate-900 z-10 gap-4 flex-wrap">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100 mb-0.5">
            Contract Preview
          </h2>
          <div className="text-[12px] text-slate-500">
            <span>Theme: {themeSettings.name || 'Custom'}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* View controls: zoom, TOC, Theme — grouped as one segmented bar */}
          <div className="flex items-center h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 divide-x divide-slate-200 dark:divide-slate-700 overflow-hidden">
            <div className="flex items-center h-full">
              <button
                onClick={() => setZoomPct((z) => Math.max(40, z - 10))}
                disabled={zoomPct <= 40}
                className="px-2.5 h-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[12px] font-medium text-slate-600 dark:text-slate-300 w-11 text-center tabular-nums select-none">
                {zoomPct}%
              </span>
              <button
                onClick={() => setZoomPct((z) => Math.min(150, z + 10))}
                disabled={zoomPct >= 150}
                className="px-2.5 h-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              onClick={() => setShowToc((v) => !v)}
              className={cn(
                "px-3 h-full flex items-center gap-1.5 text-[12.5px] font-medium transition-colors",
                showToc
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200"
              )}
            >
              <List className="w-3.5 h-3.5" /> TOC
            </button>
            <button
              onClick={() => setThemePanelOpen(true)}
              className="px-3 h-full flex items-center gap-1.5 text-[12.5px] font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              <Palette className="w-3.5 h-3.5" /> Theme
            </button>
          </div>

          {/* Export actions */}
          <div className="flex items-center h-9 rounded-lg border border-slate-200 dark:border-slate-700 divide-x divide-slate-200 dark:divide-slate-700 overflow-hidden">
            <button
              onClick={handleDownloadPdf}
              disabled={!hasOutput || loadingContext || isGeneratingPdf}
              className="px-3 h-full flex items-center gap-1.5 text-[12.5px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            >
              {isGeneratingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5 text-slate-400" />} PDF
            </button>
            <button
              onClick={handleDownloadWord}
              disabled={!hasOutput || loadingContext}
              className="px-3 h-full flex items-center gap-1.5 text-[12.5px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            >
              <FileText className="w-3.5 h-3.5 text-slate-400" /> Word
            </button>
          </div>

          {/* Primary action */}
          <Button
            size="sm"
            className="h-9 px-4 text-[13px] font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-sm ml-1"
            onClick={handleSaveToDb}
            disabled={!hasOutput || loadingContext || isSaving}
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-2" />}
            Generate & Save
          </Button>
        </div>
      </div>

      {/* Main Preview Area - Scrollable */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-auto bg-[#F8F9FB] dark:bg-slate-950/50"
      >
        {!contractTemplate && !loadingContext ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <FileWarning className="w-10 h-10 mb-3" />
            <p className="text-[13px]">No Contract Template configured.</p>
          </div>
        ) : loadingContext ? (
          <div className="flex items-center justify-center h-full min-h-[300px]">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="py-8 px-4 flex flex-col items-center min-h-full">
            {/* Scaled wrapper – accounts for zoom in scroll layout */}
            <div
              className="relative shrink-0"
              style={{ width: PAGE_WIDTH_PX * zoomRatio, height: pageCanvasHeightPx * zoomRatio }}
            >
              {/* Document canvas at 100% scale, visually scaled */}
              <div
                className="absolute top-0 left-0 bg-white shadow-md border border-slate-200/80 origin-top-left"
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
                    <div className="border-t border-dashed border-slate-300/40" style={{ marginLeft: 48, marginRight: 48 }} />
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
      {contractTemplate && !loadingContext && (
        <div className="shrink-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-2.5 flex items-center justify-center gap-6 text-[13px] text-slate-600 dark:text-slate-300 font-medium z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <div className="flex items-center gap-1">
            <button onClick={() => scrollToPage(1)} disabled={currentPage <= 1} className="p-1.5 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button onClick={() => scrollToPage(currentPage - 1)} disabled={currentPage <= 1} className="p-1.5 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
          
          <span className="tabular-nums min-w-[100px] text-center">Page {currentPage} of {totalPages}</span>
          
          <div className="flex items-center gap-1">
            <button onClick={() => scrollToPage(currentPage + 1)} disabled={currentPage >= totalPages} className="p-1.5 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
            <button onClick={() => scrollToPage(totalPages)} disabled={currentPage >= totalPages} className="p-1.5 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
              <ChevronsRight className="w-4 h-4" />
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

      {/* 
        HIDDEN RENDER TARGETS
        1. measure-target: Accurately sizes the pure DOM unscaled for pagination math.
        Must strictly match the visual container (p-12) to keep math accurate.
      */}
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
        
        {/* capture-target: Pure DOM with safety padding for PDF extraction. */}
        <div ref={htmlCaptureRef} className="bg-white text-black p-12 text-[14.5px] leading-relaxed" style={{ width: PAGE_WIDTH_PX }}>
          <div dangerouslySetInnerHTML={{ __html: themedHtml }} />
        </div>
      </div>
    </div>
  );
}