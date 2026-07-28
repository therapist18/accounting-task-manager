import { useEffect, useMemo, useRef, useState } from 'react';
import supabase from '@/lib/supabase/client';
import { replacePlaceholders } from '../../tasks-requirements/utils/templateFormatters';
import { Button } from '@/components/ui/button';
import {
  Download, Loader2, Save, FileText, FileWarning, Palette, FileDown,
  ZoomIn, ZoomOut, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ChevronDown, List,
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
    <div className="flex flex-col h-full bg-slate-100/50 dark:bg-slate-900 shadow-inner overflow-hidden flex-1 lg:min-w-[600px] relative">
      
      {/* Sleek Glassy Toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2.5 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/60 dark:border-slate-700/60 shadow-lg shadow-slate-200/20 dark:shadow-black/20 rounded-2xl z-20 flex items-center gap-4 transition-all">
        <div className="flex items-center gap-2">
          {/* Zoom Controls */}
          <div className="flex items-center h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 overflow-hidden">
            <button
              onClick={() => setZoomPct((z) => Math.max(40, z - 10))}
              disabled={zoomPct <= 40}
              title="Zoom out"
              className="px-2 h-full text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 w-10 text-center tabular-nums select-none">
              {zoomPct}%
            </span>
            <button
              onClick={() => setZoomPct((z) => Math.min(150, z + 10))}
              disabled={zoomPct >= 150}
              title="Zoom in"
              className="px-2 h-full text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            >
              <ZoomIn className="w-3.5 h-3.5" />
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
        </div>

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />

        <div className="flex items-center gap-2">
          {/* Export menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                disabled={!hasOutput || loadingContext}
                className="h-8 px-3 flex items-center gap-1.5 rounded-lg text-[12px] font-medium bg-slate-50 border border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
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
          <Button
            size="sm"
            className="h-8 px-4 text-[12px] font-medium bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md rounded-lg"
            onClick={handleSaveToDb}
            disabled={!hasOutput || loadingContext || isSaving}
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-2" />}
            Generate
          </Button>
        </div>
      </div>

      {/* Main Preview Area - Scrollable */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-auto bg-slate-100/50 dark:bg-slate-950/50 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 pt-16"
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
      {contractTemplate && !loadingContext && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/90 dark:bg-slate-900/90 backdrop-blur border border-slate-200 dark:border-slate-800 rounded-full py-1.5 px-4 flex items-center justify-center gap-4 text-[12px] text-slate-600 dark:text-slate-300 font-medium z-10 shadow-lg shadow-slate-200/20 dark:shadow-black/20">
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