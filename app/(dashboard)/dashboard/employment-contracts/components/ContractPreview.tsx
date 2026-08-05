import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { fetchSignatoryNameForCompany } from '../utils/companySettings';
import { fetchPayrollStatutoryLine } from '../utils/payrollIntegration';
import type { StatutoryDeductionsBreakdown } from '../utils/statutoryDeductions';
import type { EcPlaceholder } from '../utils/ecPlaceholders';

// Placeholders whose value is block-level HTML (<li>...</li> fragments or a
// full <table>, not a scalar fact) - wrapping these in the <span> below
// would be invalid nesting (inline span around block content), which
// browsers/print/docx export handle by silently hoisting the block
// element back out, breaking layout. An empty list is also a legitimate
// state ("no benefits configured", "no extra responsibilities entered"),
// not a missing fact, so these never get the missing-value placeholder
// treatment below either.
const LIST_MARKUP_KEYS = new Set(['applicable_benefits', 'key_responsibilities', 'statutory_deductions_table']);

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
  ecPlaceholders: EcPlaceholder[],
  signatoryName: string,
  payrollStatutoryLine: StatutoryDeductionsBreakdown | null
): Record<string, string> {
  const raw = employee
    ? buildStandardPlaceholderValues(employee, company, offer, effectiveSettings, offer?.placeholder_overrides, masterFieldValues, selectedJobProfile, ecPlaceholders, signatoryName, payrollStatutoryLine)
    : {};

  const wrap = (key: string, value: string, entity: string | undefined): string => {
    // HTML list markup (<li>...</li> fragments) must never get wrapped in a
    // <span> - a <span> around <li> elements is invalid nesting (they're
    // only valid as a direct child of <ul>/<ol>), so the browser hoists the
    // <li>s back out, silently breaking bullet rendering and leaving a
    // stray empty <span> artifact behind. Entity-color-coding and the
    // missing-value placeholder both only make sense for a scalar value
    // anyway, so these keys always render raw and unwrapped.
    if (LIST_MARKUP_KEYS.has(key)) return value;

    const isMissing = !value;
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
  const [signatoryName, setSignatoryName] = useState('');
  const [payrollStatutoryLine, setPayrollStatutoryLine] = useState<StatutoryDeductionsBreakdown | null>(null);

  const loadSignatoryName = useCallback(() => fetchSignatoryNameForCompany(companyId).then(setSignatoryName), [companyId]);
  const loadPayrollStatutoryLine = useCallback(
    () => fetchPayrollStatutoryLine(companyId, employee?.individualId).then(setPayrollStatutoryLine),
    [companyId, employee?.individualId]
  );

  useEffect(() => {
    let cancelled = false;
    fetchSignatoryNameForCompany(companyId).then((name) => { if (!cancelled) setSignatoryName(name); });
    return () => { cancelled = true; };
  }, [companyId]);

  useEffect(() => {
    let cancelled = false;
    fetchPayrollStatutoryLine(companyId, employee?.individualId).then((line) => { if (!cancelled) setPayrollStatutoryLine(line); });
    return () => { cancelled = true; };
  }, [companyId, employee?.individualId]);

  const [themeOverride, setThemeOverride] = useState<ContractThemeSettings | null>(contractData?.metadata?.themeSettings || null);
  const [themePanelOpen, setThemePanelOpen] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [showToc, setShowToc] = useState(true);

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
  const loadContext = useCallback(async () => {
    setLoadingContext(true);
    const [allClauses, companies] = await Promise.all([
      fetchClauses(),
      fetchCompanies(),
    ]);
    setClauses(allClauses);
    setCompany(companyId ? companies.find((c) => String(c.id) === String(companyId)) || null : null);
    setLoadingContext(false);
  }, [companyId]);

  useEffect(() => { loadContext(); }, [loadContext]);

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

  // The toolbar's refresh button used to only re-run refreshMasterFieldValues,
  // leaving clauses/company/signatory/payroll figures stale until the next
  // company or employee switch remounted those effects - re-fetch
  // everything the initial load fetches, not just master fields.
  const handleRefreshAll = useCallback(async () => {
    await Promise.all([
      refreshMasterFieldValues(),
      loadContext(),
      loadSignatoryName(),
      loadPayrollStatutoryLine(),
    ]);
  }, [refreshMasterFieldValues, loadContext, loadSignatoryName, loadPayrollStatutoryLine]);

  const employeeValues = useMemo(
    () => buildHighlightedPreviewValues(employee, company, offer as EmploymentOffer, effectiveSettings, masterFieldValues, selectedJobProfile, ecPlaceholders, signatoryName, payrollStatutoryLine),
    [employee, company, offer, effectiveSettings, masterFieldValues, selectedJobProfile, ecPlaceholders, signatoryName, payrollStatutoryLine]
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

  // Same assembly, but for the actual submitted document (PDF/Word/the copy
  // saved to storage) rather than the on-screen editing preview -
  // hideMissingClauses drops the "[No clause configured]" warning sections
  // entirely instead of rendering them, since that warning exists to help
  // whoever is still assembling the contract notice gaps, not to appear in
  // what the employee actually receives. includeToc still follows the same
  // showToc toggle, so hiding the ToC in the preview hides it from the
  // export too.
  const exportBodyHtml = useMemo(() => {
    if (!employee) return '';
    return assembleContractHtml({
      sectionKeys: CONTRACT_SECTIONS.map((s) => s.key),
      clausesById,
      effectiveClauses,
      effectiveSettings,
      employeePlaceholderValues: employeeValues,
      includeToc: showToc,
      hideMissingClauses: true,
    });
  }, [clausesById, effectiveClauses, effectiveSettings, employeeValues, employee, showToc]);

  const themeSettings: ContractThemeSettings = themeOverride || DEFAULT_CONTRACT_THEME;
  const mergedValues = { ...effectiveSettings, ...employeeValues };

  const themedHtml = bodyHtml ? replacePlaceholders(applyThemeToHtml(bodyHtml, themeSettings), mergedValues) : '';
  // Renamed id="section-x"/href="#section-x" to a "pdf-section-x" namespace,
  // distinct from the live on-screen preview's own id="section-x" elements
  // (which stay mounted, just display:none via print:hidden, during
  // window.print()). Without this, the browser's anchor lookup while
  // printing resolves #section-x to whichever element comes first in the
  // DOM - the hidden on-screen copy, not this print-only one - so the
  // resulting PDF's Table of Contents links pointed at nothing. Word export
  // doesn't need this: it's a separate file with no shared DOM to collide
  // with, which is why its bookmarks (see buildOutput below) already worked.
  const exportThemedHtml = exportBodyHtml
    ? replacePlaceholders(applyThemeToHtml(exportBodyHtml, themeSettings), mergedValues)
        .replace(/id="section-/g, 'id="pdf-section-')
        .replace(/href="#section-/g, 'href="#pdf-section-')
    : '';
  const wordSafeHtml = exportBodyHtml ? replacePlaceholders(applyThemeToHtml(exportBodyHtml, themeSettings, { wordSafe: true }), mergedValues) : '';

  const updateThemeSettings = (settings: ContractThemeSettings) => setThemeOverride(settings);

  const buildOutput = (): { blob: Blob; fileName: string } | null => {
    if (!employee || !wordSafeHtml) return null;
    const baseName = employee.fullName.replace(/\s+/g, '_');

    // Word's HTML import filter only reliably reads <style> blocks that are
    // direct children of <head> - a <style> tag buried inside <body> (which
    // is where applyThemeToHtml embeds its theme CSS, nested inside the
    // .contract-theme-X div, so it works as a normal in-page <style> for the
    // live preview/PDF) gets partially or entirely ignored by Word, which is
    // exactly why only the parts of the layout NOT driven by that stylesheet
    // (nothing, really - even headings render because Word applies some
    // default heading weight regardless) looked styled while paragraphs and
    // tables didn't. Pull the theme's own <style> content out and move it to
    // <head> instead - same approach the reference file
    // (lynne-drafts/contracts/manan-travkings.html) uses.
    const styleMatch = wordSafeHtml.match(/<style>([\s\S]*?)<\/style>/);
    const themeCss = styleMatch ? styleMatch[1] : '';
    let bodyContent = wordSafeHtml.replace(/<style>[\s\S]*?<\/style>/, '');

    // Table of Contents links (#section-x hrefs, from assembleContractHtml)
    // work as scroll-to-anchor clicks in the live web preview already (see
    // the click interceptor in the scroll-tracking effect above). Word
    // doesn't recognize a plain id="..." as a jump target via its HTML
    // import filter, only a genuine bookmark - <a name="..."></a> is the
    // one format guaranteed compatible, because it's exactly what Word
    // itself emits for a bookmark when it exports its own "Save as Web
    // Page" HTML, so its importer is guaranteed to round-trip it correctly.
    // Insert one at the start of every section the ToC can point to; the
    // ToC's own <a href="#section-x"> needs no change, since #name matching
    // an <a name="name"> is standard anchor behavior. (This document is a
    // separate file with no shared DOM, unlike the live page - see
    // exportThemedHtml's id="pdf-section-x" renaming above for the
    // equivalent PDF fix, a different problem with a different cause.)
    //
    // Also strip Word's own default table cell margins via the legacy
    // cellpadding/cellspacing HTML attributes - Word's table rendering
    // applies its own built-in cell margins on top of/instead of a table's
    // CSS `padding` unless told not to, which is why the exported tables
    // showed noticeably more cell padding than the same theme's PDF output
    // even though both share the exact same padding CSS.
    if (typeof DOMParser !== 'undefined') {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div>${bodyContent}</div>`, 'text/html');
      doc.querySelectorAll('section[id]').forEach((section) => {
        const id = section.getAttribute('id');
        if (!id) return;
        const bookmark = doc.createElement('a');
        bookmark.setAttribute('name', id);
        section.insertBefore(bookmark, section.firstChild);
      });
      doc.querySelectorAll('table').forEach((table) => {
        table.setAttribute('cellpadding', '0');
        table.setAttribute('cellspacing', '0');
      });
      bodyContent = doc.body.firstElementChild?.innerHTML ?? bodyContent;
    }

    // Real Microsoft Office HTML export markup, adopted from a proven
    // reference (lynne-drafts/contracts/manan-travkings.html) rather than
    // the plain-HTML-with-a-.doc-extension this used before. The
    // xmlns:o/xmlns:w namespaces + <!--[if gte mso 9]> block tell Word's
    // HTML import filter this is genuine Office markup, so it honors mso-*
    // CSS and the named @page region below instead of falling back to a
    // generic unstyled import. @page WordSection1 + div.page:WordSection1
    // is Word's own mechanism for page size/margins on HTML-sourced
    // documents - 1in matches the PDF export's page margin (see the
    // .ec-print-area print stylesheet) so both formats agree. The theme
    // wrapper's own inline padding/max-width (from applyThemeToHtml) is
    // zeroed here for the same reason it is for print: @page already
    // supplies the page margin, so leaving both in would double it on the
    // first page.
    const htmlDoc = `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${baseName} Employment Contract</title>
<!--[if gte mso 9]>
<xml>
  <w:WordDocument>
    <w:View>Print</w:View>
    <w:DoNotOptimizeForBrowser/>
  </w:WordDocument>
</xml>
<![endif]-->
<style>
${themeCss}
  @page WordSection1 { size: 8.5in 11.7in; margin: 1in; mso-page-orientation: portrait; }
  div.WordSection1 { page: WordSection1; }
  div.WordSection1 [class^="contract-theme-"] { padding: 0 !important; max-width: 100% !important; margin: 0 !important; }
</style>
</head>
<body>
<div class="WordSection1">${bodyContent}</div>
</body>
</html>`;
    // Leading UTF-8 BOM so Word recognizes the encoding correctly instead of
    // mis-rendering special characters (curly quotes, KES amounts, etc.).
    const bomChar = String.fromCharCode(0xfeff);
    return { blob: new Blob([bomChar, htmlDoc], { type: 'application/msword' }), fileName: `${baseName}_Employment_Contract.doc` };
  };

  const handleDownloadWord = () => {
    const output = buildOutput();
    if (output) saveAs(output.blob, output.fileName);
  };

  // Uses the browser's native print pipeline instead of rasterizing a
  // screenshot (html2canvas + jsPDF, the previous approach): the print-only
  // area below renders themedHtml directly, so "Save as PDF" from the print
  // dialog produces real vector text (selectable/searchable, small file
  // size) and respects the page-break-before/page-break-inside rules already
  // defined in themeEngine.ts's BASE_SECTION_STYLES, instead of a canvas
  // getting sliced into A4-height chunks with no regard for where a
  // paragraph, table row, or signature block actually ends.
  const handleDownloadPdf = () => {
    if (!hasOutput || !employee) return;
    window.print();
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
  <>
    <div className={cn(className || "flex flex-col h-full bg-slate-100/50 dark:bg-slate-900 shadow-inner overflow-hidden flex-1 lg:min-w-[600px] relative", "print:hidden")}>

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
            onClick={handleRefreshAll}
            disabled={isResolvingMasterFields || loadingContext}
            title="Refresh everything (clauses, company, signatory, payroll figures, master fields)"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", (isResolvingMasterFields || loadingContext) && "animate-spin")} />
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
                <Download className="w-3.5 h-3.5" />
                Export
                <ChevronDown className="w-3 h-3 ml-0.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40 rounded-xl">
              <DropdownMenuItem onClick={handleDownloadPdf} disabled={!hasOutput || loadingContext}>
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
      </div>
    </div>

    {/* Print-only area, portaled straight to document.body rather than left
        in place. ContractPreview is nested many layers deep inside the full
        Employment Contracts page (entities sidebar, the Data & Values
        panel, react-resizable-panels' Panel/PanelGroup wrappers, the page's
        own h-[calc(100vh-1rem)] overflow-hidden root, ...). The classic
        "print just this element" trick (visibility:hidden on body *,
        visibility:visible + position:absolute on the target) still gets
        clipped in a tree like this: an absolutely positioned element's
        containing block is its nearest positioned ancestor, and if any
        overflow-hidden wrapper sits between here and <body> (several do),
        the print area gets cropped to that ancestor's fixed pixel height
        instead of showing the whole document. Portaling to document.body
        makes it a true sibling of the entire app root, so there is no
        overflow-hidden/position ancestor left to clip it. */}
    {typeof document !== 'undefined' && createPortal(
      <>
        <style>{`
          @media print {
            /* Standard 1in page margin (same value used for the Word
               export's @page WordSection1, so both formats agree) - lets
               the browser's print engine put a consistent gap at the top
               and bottom of every physical page, which is what actually
               makes multi-page breaks look deliberate instead of content
               being cut off flush against the page edge. Previously this
               was margin:0, relying solely on applyThemeToHtml's one-time
               48px padding around the whole flowing document - since that
               padding only wraps the start/end of the content, not each
               page, every page after the first began right at the very top
               edge with zero breathing room. */
            @page { size: A4; margin: 1in; }
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
            /* Zero out applyThemeToHtml's own inline padding/max-width for
               print specifically - @page above already supplies the page
               margin on every page, so leaving the theme's 48px padding in
               place too would double the whitespace at the top of page 1. */
            .ec-print-area [class^="contract-theme-"] {
              padding: 0 !important;
              max-width: 100% !important;
              margin: 0 !important;
            }
          }
        `}</style>
        <div className="hidden print:block ec-print-area bg-white text-black">
          <div dangerouslySetInnerHTML={{ __html: exportThemedHtml }} />
        </div>
      </>,
      document.body
    )}
  </>
  );
}