import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import supabase from '@/lib/supabase/client';
import { replacePlaceholders } from '../../tasks-requirements/utils/templateFormatters';
import { Button } from '@/components/ui/button';
import {
  Download, Loader2, Save, FileText, FileWarning, Palette, FileDown,
  ChevronDown, List, RefreshCw,
} from 'lucide-react';
import { DocumentViewer, type DocumentViewerHandle } from '@/components/contracts/DocumentViewer';
import { downloadBlob, buildWordDocBlob, printElementAsPdf } from '@/lib/documentExport';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ContractThemePanel } from './ContractThemePanel';
import { ContractThemeSettings, DEFAULT_CONTRACT_THEME, applyThemeToHtml } from '../utils/themeEngine';
import { applyWordSafeDomFixes } from '@/lib/documentTheme';
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
  // A theme to render with when there's no per-contract override - lets the
  // Job Profiles preview (previewOnly) show the profile's saved Design tab
  // theme live while it's being edited, without writing into contractData.
  defaultTheme?: ContractThemeSettings | null;
  // Lets the Job Profiles preview route the sidebar theme panel's edits back
  // into the profile draft (theme_settings) instead of only the local
  // per-contract override, so the design editor stays in sync with the EC
  // module's (same sidebar panel, same persistence path).
  onThemeChange?: (settings: ContractThemeSettings) => void;
}

export function ContractPreview({ contractData, setContractData, selectedJobProfile, previewOnly, className, defaultTheme, onThemeChange }: ContractPreviewProps) {
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

  const viewerRef = useRef<DocumentViewerHandle>(null);

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
  // employee's contract or job profile, preloading whatever theme was saved
  // on it last time (for a fresh contract that's null, so the effective theme
  // falls through to the selected profile's own theme_settings).
  useEffect(() => {
    setThemeOverride(contractData?.metadata?.themeSettings || null);
  }, [employee?.individualId, selectedJobProfile?.id]);

  const clausesById = useMemo(() => Object.fromEntries(clauses.map((c) => [c.id, c])), [clauses]);

  const effectiveSettings = useMemo(() => resolveEffectiveSettings([
    selectedJobProfile, offer ? { settings: offer.settings_overrides } : null,
  ]), [selectedJobProfile, offer]);

  const effectiveClauses = useMemo(() => resolveEffectiveClauses([
    selectedJobProfile, offer ? { section_clauses: offer.section_clauses_overrides } : null,
  ]), [selectedJobProfile, offer]);

  const { ecPlaceholders, masterFieldValues, isResolving: isResolvingMasterFields, refresh: refreshMasterFieldValues } = useMasterFieldValues(employee?.individualId, companyId);

  // The toolbar's refresh button used to only re-run refreshMasterFieldValues,
  // leaving clauses/company/signatory/payroll figures stale until the next
  // company or employee switch remounted those effects - re-fetch
  // everything the initial load fetches, not just master fields, and tell the
  // user the refresh finished.
  const handleRefreshAll = useCallback(async () => {
    try {
      await Promise.all([
        refreshMasterFieldValues(),
        loadContext(),
        loadSignatoryName(),
        loadPayrollStatutoryLine(),
      ]);
      toast.success('Contract data refreshed', {
        description: 'Clauses, company, signatory, payroll figures and master fields reloaded.',
      });
    } catch {
      toast.error('Refresh failed', { description: 'Something went wrong reloading the contract data.' });
    }
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

  const themeSettings: ContractThemeSettings = themeOverride || defaultTheme || { ...DEFAULT_CONTRACT_THEME, ...(selectedJobProfile?.theme_settings || {}) };
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

  const updateThemeSettings = (settings: ContractThemeSettings) => {
    setThemeOverride(settings);
    onThemeChange?.(settings);
  };

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
    // Also strip Word's own default table cell margins, swap the ToC's <nav>
    // for a <div>, and inline the heading/ToC spacing rules Word ignores when
    // left in the <style> block - see applyWordSafeDomFixes for the full
    // rationale (shared with Consultancy Contracts' own Word export, which
    // has the same fixes applied to the same theme engine's output).
    if (typeof DOMParser !== 'undefined') {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div>${bodyContent}</div>`, 'text/html');
      applyWordSafeDomFixes(doc, {
        themeCss,
        rootSelector: `.contract-theme-${themeSettings.theme}`,
        fontFamily: themeSettings.fontFamily,
        bookmarkSelector: 'section[id]',
      });
      bodyContent = doc.body.firstElementChild?.innerHTML ?? bodyContent;
    }

    // The mso namespaces, the <!--[if gte mso 9]> block, the hoisted <style>
    // in <head> and the @page WordSection1 page-size/margin mechanism are all
    // provided by the shared buildWordDocBlob (lib/documentExport.ts) - see
    // the comments there. @page WordSection1 is Word's own mechanism for page
    // size/margins on HTML-sourced documents - 0.5in matches the PDF export's
    // page margin (see the .ec-print-area print stylesheet) so both formats
    // agree, and both in turn match the on-screen preview's own single 48px
    // (0.5in) gutter (applyThemeToHtml's .contract-theme-X padding - see the
    // Contract content comment above). The theme wrapper's own inline padding/
    // max-width (from applyThemeToHtml) is zeroed here for the same reason it
    // is for print: @page already supplies the page margin, so leaving both in
    // would double it on the first page.
    return {
      blob: buildWordDocBlob({
        title: `${baseName} Employment Contract`,
        html: bodyContent,
        css: `${themeCss}
  [class^="contract-theme-"] { padding: 0 !important; max-width: 100% !important; margin: 0 !important; }`,
        pageSize: '8.5in 11.7in',
        pageMargin: '0.5in',
      }),
      fileName: `${baseName}_Employment_Contract.doc`,
    };
  };

  const handleDownloadWord = () => {
    const output = buildOutput();
    if (output) downloadBlob(output.blob, output.fileName);
  };

  // Uses the browser's native print pipeline instead of rasterizing a
  // screenshot (html2canvas + jsPDF, the previous approach): the print-only
  // area below renders themedHtml directly, so "Save as PDF" from the print
  // dialog produces real vector text (selectable/searchable, small file
  // size) and respects the page-break-before/page-break-inside rules already
  // defined in themeEngine.ts's BASE_SECTION_STYLES, instead of a canvas
  // getting sliced into A4-height chunks with no regard for where a
  // paragraph, table row, or signature block actually ends. The shared
  // printElementAsPdf handles waiting for fonts/images, the Save-as-PDF file
  // name (document.title) and cleanup; the portaled print area's own
  // @media print CSS hides the rest of the page.
  const handleDownloadPdf = () => {
    if (!hasOutput || !employee) return;
    const baseName = employee.fullName.replace(/\s+/g, '_');
    printElementAsPdf({
      element: viewerRef.current?.getPrintArea() ?? null,
      fileName: `${baseName}_Employment_Contract`,
    }).catch((err) => {
      console.error('PDF generation failed', err);
    });
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
      <div className={className || "flex flex-col items-center justify-center h-full w-full min-w-0 text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm"}>
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
      <DocumentViewer
        ref={viewerRef}
        html={themedHtml}
        printHtml={exportThemedHtml}
        contentKey={`${employee?.individualId}:${showToc}`}
        className={className || "bg-slate-100/50 dark:bg-slate-900 shadow-inner"}
        loading={loadingContext}
        empty={
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <FileWarning className="w-10 h-10 mb-3" />
            <p className="text-sm">Nothing to preview yet.</p>
          </div>
        }
        actions={
          <>
            <button
              onClick={() => setShowToc((v) => !v)}
              title="Toggle table of contents"
              className={cn(
                "w-8 h-8 flex items-center justify-center rounded-lg transition-colors shrink-0",
                showToc
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                  : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              )}
            >
              <List className="w-4 h-4" />
            </button>
            {/* Theme sidebar panel - shared by both modules so profile design
                and per-contract customization stay synchronized. */}
            <button
              onClick={() => setThemePanelOpen(true)}
              title="Customize theme"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
            >
              <Palette className="w-4 h-4" />
            </button>
            <button
              onClick={handleRefreshAll}
              disabled={isResolvingMasterFields || loadingContext}
              title="Refresh everything (clauses, company, signatory, payroll figures, master fields)"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 shrink-0"
            >
              <RefreshCw className={cn("w-4 h-4", (isResolvingMasterFields || loadingContext) && "animate-spin")} />
            </button>

            <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 shrink-0" />

            {/* Export menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  disabled={!hasOutput || loadingContext}
                  className="h-8 px-3 flex items-center gap-1.5 rounded-lg text-xs font-medium bg-slate-50 border border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors shrink-0"
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
                className="h-8 px-4 text-xs font-medium bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md rounded-lg shrink-0"
                onClick={handleSaveToDb}
                disabled={!hasOutput || loadingContext || isSaving}
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-2" />}
                Generate
              </Button>
            )}
          </>
        }
      />

      <ContractThemePanel
        open={themePanelOpen}
        onClose={() => setThemePanelOpen(false)}
        settings={themeSettings}
        onChange={updateThemeSettings}
      />
    </>
  );
}