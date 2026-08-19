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
import { withDirectorsAcknowledgementBlock } from '../utils/directorsBlock';
import { withTableOfContents } from '../utils/tableOfContents';
import { saveContractToProfile } from '../utils/kycUpload';
import { ContractThemePanel } from './ContractThemePanel';
import { DocumentViewer, type DocumentViewerHandle } from '@/components/contracts/DocumentViewer';
import type { Company } from '../../companies/database';
import type { CcEngagement } from '../utils/ccEngagements';
import type { CompanyDirector } from '../hooks/useCompanyDirectors';
import { applyThemeToHtml, type ContractThemeSettings } from '../utils/themeEngine';
import { applyWordSafeDomFixes } from '@/lib/documentTheme';
import type { EcPlaceholder } from '../../employment-contracts/utils/ecPlaceholders';

interface ContractPreviewProps {
  company: Company | null;
  templateContent: string;
  resolvedValues: Record<string, string>;
  // Resolved array/block data — block name → array of row objects.
  arrayData?: Record<string, Record<string, string>[]>;
  overrides: Record<string, string>;
  engagement: CcEngagement | null;
  themeSettings: ContractThemeSettings;
  onThemeChange: (settings: ContractThemeSettings) => void;
  saving: boolean;
  onSave: () => void;
  // Directors/shareholders chosen in the Directors picker - rendered into
  // the Acknowledgement section as {{directors_acknowledgement_block}}.
  selectedDirectors: CompanyDirector[];
  placeholders: EcPlaceholder[];
}

const LIST_MARKUP_KEYS = new Set(['applicable_benefits', 'key_responsibilities', 'statutory_deductions_table', 'services_table', 'fee_schedule_table']);
const MISSING_VALUE_PLACEHOLDER = '_________________';

function toWordExportHtml(
  htmlText: string,
  themeSettings: ContractThemeSettings,
  mergedValues: Record<string, string>
) {
  const wordSafeHtml = replacePlaceholders(applyThemeToHtml(htmlText, themeSettings, { wordSafe: true }), mergedValues);
  const styleMatch = wordSafeHtml.match(/<style>([\s\S]*?)<\/style>/);
  const themeCss = styleMatch ? styleMatch[1] : '';
  let bodyContent = wordSafeHtml.replace(/<style>[\s\S]*?<\/style>/, '');

  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${bodyContent}</div>`, 'text/html');

    // Same global Word fixes employment-contracts uses
    applyWordSafeDomFixes(doc, {
      themeCss,
      rootSelector: `.contract-theme-${themeSettings.theme}`,
      fontFamily: themeSettings.fontFamily,
      bookmarkSelector: '[id^="section-"]',
    });

    bodyContent = doc.body.firstElementChild?.innerHTML ?? bodyContent;
  }

  return {
    bodyContent,
    css: themeCss
  };
}

export function ContractPreview({
  company, templateContent, resolvedValues, arrayData, overrides, engagement,
  themeSettings, onThemeChange, saving, onSave, selectedDirectors, placeholders
}: ContractPreviewProps) {
  const viewerRef = useRef<DocumentViewerHandle>(null);
  const [exporting, setExporting] = useState<'word' | 'pdf' | null>(null);
  const [filingToProfile, setFilingToProfile] = useState(false);
  const [themePanelOpen, setThemePanelOpen] = useState(false);

  const mergedValuesRaw = useMemo(() => {
    // Flatten array/block data into individual placeholder values so
    // replacePlaceholders can substitute them.  Convention:
    //   blockName_0_childKey, blockName_1_childKey, …
    const flatArray: Record<string, string> = {};
    if (arrayData) {
      for (const [blockName, rows] of Object.entries(arrayData)) {
        rows.forEach((row, idx) => {
          for (const [childKey, val] of Object.entries(row)) {
            flatArray[`${blockName}_${idx}_${childKey}`] = val;
          }
        });
      }
    }
    return withDirectorsAcknowledgementBlock(
      withDerivedFeeValues({ ...resolvedValues, ...flatArray, ...overrides }),
      selectedDirectors
    );
  }, [resolvedValues, arrayData, overrides, selectedDirectors]);

  const mergedValues = useMemo(() => {
    const wrap = (key: string, value: string, entity: string | undefined): string => {
      if (LIST_MARKUP_KEYS.has(key)) return value;
      const isMissing = !value;
      const display = isMissing ? MISSING_VALUE_PLACEHOLDER : value;
      const missingClass = isMissing ? ' ph-entity-missing' : '';
      if (entity === 'company') return `<span class="ph-entity-company${missingClass}">${display}</span>`;
      if (entity === 'individual' || entity === 'employee') return `<span class="ph-entity-employee${missingClass}">${display}</span>`;
      return display;
    };

    const highlighted: Record<string, string> = {};
    for (const p of placeholders) {
      highlighted[p.key] = wrap(p.key, mergedValuesRaw[p.key] || '', p.entity_type?.[0]);
    }
    for (const [key, value] of Object.entries(mergedValuesRaw)) {
      if (key in highlighted) continue;
      highlighted[key] = wrap(key, value, undefined);
    }
    return highlighted;
  }, [mergedValuesRaw, placeholders]);

  const bodyHtml = useMemo(() => {
    const content = withTableOfContents(replacePlaceholders(templateContent || '', mergedValues));
    return content ? `<div class="cs-section">${content}</div>` : '';
  }, [templateContent, mergedValues]);

  const themedHtml = useMemo(
    () => (bodyHtml ? replacePlaceholders(applyThemeToHtml(bodyHtml, themeSettings), mergedValues) : ''),
    [bodyHtml, themeSettings, mergedValues]
  );

  const printThemedHtml = useMemo(
    () => themedHtml
      ? themedHtml.replace(/id="section-/g, 'id="pdf-section-').replace(/href="#section-/g, 'href="#pdf-section-')
      : '',
    [themedHtml]
  );

  const buildOutput = (): { blob: Blob; fileName: string } | null => {
    if (!bodyHtml) return null;
    const baseName = company?.legal_name?.replace(/\s+/g, '_') || 'Consultancy';
    const { bodyContent, css } = toWordExportHtml(bodyHtml, themeSettings, mergedValues);
    
    return {
      blob: buildWordDocBlob({
        title: `${baseName} Contract`,
        html: bodyContent,
        css: `${css}\n[class^="contract-theme-"] { padding: 0 !important; max-width: 100% !important; margin: 0 !important; }`,
        pageSize: '8.5in 11.7in',
        pageMargin: '0.5in',
      }),
      fileName: `${baseName}_Contract.doc`,
    };
  };

  const handleExportWord = () => {
    if (!bodyHtml) return;
    setExporting('word');
    try {
      const output = buildOutput();
      if (output) downloadBlob(output.blob, output.fileName);
    } catch (error) {
      console.error('Word export failed:', error);
      toast.error('Could not generate Word document');
    } finally {
      setExporting(null);
    }
  };

  const handleExportPdf = async () => {
    setExporting('pdf');
    try {
      const baseName = company?.legal_name?.replace(/\s+/g, '_') || 'Consultancy';
      await printElementAsPdf({
        element: viewerRef.current?.getPrintArea() ?? null,
        fileName: `${baseName}_Contract`,
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
      const { bodyContent, css } = toWordExportHtml(bodyHtml, themeSettings, mergedValues);
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
