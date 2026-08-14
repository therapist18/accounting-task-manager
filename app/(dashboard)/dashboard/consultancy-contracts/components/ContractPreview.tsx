'use client';

import { useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Loader2, Save, FileDown, ChevronDown, Building2, FolderCheck, Palette } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { replacePlaceholders } from '../../tasks-requirements/utils/templateFormatters';
import { downloadBlob, buildWordDocBlob, printElementAsPdf } from '@/lib/documentExport';
import { withDerivedFeeValues } from '../utils/feeCalculations';
import { withTableOfContents } from '../utils/tableOfContents';
import { saveContractToProfile } from '../utils/kycUpload';
import { ContractThemePanel } from './ContractThemePanel';
import { DocumentViewer, type DocumentViewerHandle } from '@/components/contracts/DocumentViewer';
import type { Company } from '../../companies/database';
import type { CcEngagement } from '../utils/ccEngagements';
import { applyThemeToHtml, toWordSafeFontStack , type ContractThemeSettings  } from '../utils/themeEngine';

interface ContractPreviewProps {
  company: Company | null;
  templateContent: string;
  resolvedValues: Record<string, string>;
  overrides: Record<string, string>;
  engagement: CcEngagement | null;
  themeSettings: ContractThemeSettings;
  onThemeChange: (settings: ContractThemeSettings) => void;
  saving: boolean;
  onSave: () => void;
}

// Turns the themed body into the specific markup Word's HTML import filter
// actually honors - same technique employment-contracts/components/
// ContractPreview.tsx's buildOutput() uses (reused here as a direct port,
// not an import, since that function is a private closure there): pull the
// theme's <style> out to be passed via buildWordDocBlob's head-level css
// (Word only reliably reads <style> as a direct child of <head>, not one
// nested in the body the way applyThemeToHtml embeds it for on-screen/PDF
// use), turn <h1>-<h3> into <div class="mso-hN"> (Word forces its own
// built-in Heading N style onto real heading tags no matter what CSS says),
// bookmark every ToC target with <a name="section-N"> (Word doesn't treat a
// plain id="..." as a jump target), and strip the theme wrapper's inline
// padding/max-width/margin (redundant with @page's own margin in Word).
function toWordExportHtml(bodyHtml: string, settings: ContractThemeSettings): { bodyContent: string; css: string } {
  const wordSafeHtml = applyThemeToHtml(bodyHtml, settings, { wordSafe: true });
  const styleMatch = wordSafeHtml.match(/<style>([\s\S]*?)<\/style>/);
  const css = styleMatch ? styleMatch[1] : '';
  let bodyContent = wordSafeHtml.replace(/<style>[\s\S]*?<\/style>/, '');

  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(`<div>${bodyContent}</div>`, 'text/html');
    doc.querySelectorAll('[id^="section-"]').forEach((el) => {
      const id = el.getAttribute('id');
      if (!id) return;
      const bookmark = doc.createElement('a');
      bookmark.setAttribute('name', id);
      el.insertBefore(bookmark, el.firstChild);
    });
    const wordSafeFont = toWordSafeFontStack(settings.fontFamily);
    doc.querySelectorAll('h1, h2, h3').forEach((h) => {
      const div = doc.createElement('div');
      for (const attr of Array.from(h.attributes)) div.setAttribute(attr.name, attr.value);
      div.className = `mso-${h.tagName.toLowerCase()} ${div.className || ''}`.trim();
      (div as HTMLElement).style.fontFamily = wordSafeFont;
      while (h.firstChild) div.appendChild(h.firstChild);
      h.replaceWith(div);
    });
    doc.querySelectorAll('table').forEach((table) => {
      table.setAttribute('cellpadding', '0');
      table.setAttribute('cellspacing', '0');
      table.setAttribute('width', '100%');
    });
    doc.querySelectorAll('[class^="contract-theme-"]').forEach((el) => {
      const styleEl = el as HTMLElement;
      styleEl.style.padding = '';
      styleEl.style.maxWidth = '';
      styleEl.style.margin = '';
    });
    bodyContent = doc.body.firstElementChild?.innerHTML ?? bodyContent;
  }
  return { bodyContent, css };
}

export function ContractPreview({
  company, templateContent, resolvedValues, overrides, engagement,
  themeSettings, onThemeChange, saving, onSave,
}: ContractPreviewProps) {
  const viewerRef = useRef<DocumentViewerHandle>(null);
  const [exporting, setExporting] = useState<'word' | 'pdf' | null>(null);
  const [filingToProfile, setFilingToProfile] = useState(false);
  const [themePanelOpen, setThemePanelOpen] = useState(false);

  const mergedValues = useMemo(
    () => withDerivedFeeValues({ ...resolvedValues, ...overrides }),
    [resolvedValues, overrides]
  );

  // Unthemed body (placeholders resolved + ToC injected) - the shared input
  // to both the themed live preview and the Word-safe export transform.
  // Wrapped in .cs-section because BASE_SECTION_STYLES (themeEngine.ts)
  // only restores list-style/margins for content inside that class - without
  // it, Tailwind's Preflight reset leaves this template's plain <ul>/<li>
  // bullets stripped, since the wrapper is what EC's own assembleContractHtml
  // provides for every clause and this module has no equivalent.
  const bodyHtml = useMemo(() => {
    const content = withTableOfContents(replacePlaceholders(templateContent || '', mergedValues));
    return content ? `<div class="cs-section">${content}</div>` : '';
  }, [templateContent, mergedValues]);

  const themedHtml = useMemo(
    () => (bodyHtml ? applyThemeToHtml(bodyHtml, themeSettings) : ''),
    [bodyHtml, themeSettings]
  );

  // Same markup for the print-only portal, but with the ToC's
  // id/href="#section-x" anchors renamed to a "pdf-section-x" namespace so
  // the hidden live preview (same ids, still in the DOM during window.print)
  // can't win the browser's anchor lookup and break the PDF's ToC links.
  const printThemedHtml = useMemo(
    () => themedHtml
      ? themedHtml.replace(/id="section-/g, 'id="pdf-section-').replace(/href="#section-/g, 'href="#pdf-section-')
      : '',
    [themedHtml]
  );

  const fileNameBase = company ? `Consultancy Agreement - ${company.company_name}` : 'Consultancy Agreement';

  const handleExportWord = () => {
    if (!bodyHtml) return;
    setExporting('word');
    try {
      const { bodyContent, css } = toWordExportHtml(bodyHtml, themeSettings);
      const blob = buildWordDocBlob({ html: bodyContent, title: fileNameBase, css });
      downloadBlob(blob, `${fileNameBase}.doc`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to export Word document');
    } finally {
      setExporting(null);
    }
  };

  const handleExportPdf = async () => {
    setExporting('pdf');
    try {
      await printElementAsPdf({
        element: viewerRef.current?.getPrintArea() ?? null,
        fileName: fileNameBase,
      });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to export PDF');
    } finally {
      setExporting(null);
    }
  };

  const handleSaveToProfile = async () => {
    if (!company || !bodyHtml) return;
    setFilingToProfile(true);
    try {
      const { bodyContent, css } = toWordExportHtml(bodyHtml, themeSettings);
      const result = await saveContractToProfile(company.id, company.company_name, bodyContent, css);
      if (result.success) toast.success('Filed to company profile');
      else toast.error(result.error || 'Failed to file to company profile');
    } finally {
      setFilingToProfile(false);
    }
  };

  if (!company) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-8">
        <Building2 className="w-10 h-10 text-slate-300 mb-3" />
        <p className="text-sm font-medium text-slate-500">No company selected</p>
        <p className="text-xs text-slate-400 mt-1">Pick a client from the left to preview their contract.</p>
      </div>
    );
  }

  return (
    <>
      <DocumentViewer
        ref={viewerRef}
        html={themedHtml}
        printHtml={printThemedHtml}
        contentKey={company ? String(company.id) : ''}
        className="bg-slate-100/80 dark:bg-slate-900/80"
        leading={
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[220px]">{company.company_name}</p>
            {engagement && (
              <Badge variant="outline" className={cn(
                "text-[10px] capitalize",
                engagement.status === 'active' ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
              )}>
                {engagement.status}
              </Badge>
            )}
          </div>
        }
        empty={
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <p className="text-sm">No template content yet - configure it in Settings.</p>
          </div>
        }
        actions={
          <>
            <button
              onClick={() => setThemePanelOpen(true)}
              title="Customize theme"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
            >
              <Palette className="w-4 h-4" />
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              title="Save the resolved values as this client's engagement"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 shrink-0"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            </button>
            <button
              onClick={handleSaveToProfile}
              disabled={filingToProfile}
              title="Files a Word copy under this company's Accountant Contract document"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 shrink-0"
            >
              {filingToProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderCheck className="w-4 h-4" />}
            </button>

            <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 shrink-0" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  disabled={!!exporting}
                  className="h-8 px-3 flex items-center gap-1.5 rounded-lg text-xs font-medium bg-slate-50 border border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors shrink-0"
                >
                  {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                  Export
                  <ChevronDown className="w-3 h-3 ml-0.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 rounded-xl">
                <DropdownMenuItem onClick={handleExportWord}>Download as Word (.doc)</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPdf}>Download as PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <ContractThemePanel
        open={themePanelOpen}
        onClose={() => setThemePanelOpen(false)}
        settings={themeSettings}
        onChange={onThemeChange}
      />
    </>
  );
}
