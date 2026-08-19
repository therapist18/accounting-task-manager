'use client';

import { useMemo, useRef, useState, useCallback } from 'react';
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
import { resolveCompanyRole } from '../utils/ccPlaceholderAdapter';
import { blockImageFieldKey, type ImageStyle, type ImageStyleMap } from '../utils/imageStyles';

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
  // Per-instance image size/align overrides set from Data & Values' image
  // controls - see utils/imageStyles.ts. Takes priority over the
  // placeholder's own configured image_width/image_height.
  imageStyles?: ImageStyleMap;
}

const LIST_MARKUP_KEYS = new Set(['applicable_benefits', 'key_responsibilities', 'statutory_deductions_table', 'services_table', 'fee_schedule_table']);
const MISSING_VALUE_PLACEHOLDER = '_________________';
// Matches TemplateGenerationDialog's own top-level/block-child fallback
// widths (see its PlaceholderInput and processBlockInText) so an image
// placeholder with no configured image_width still renders at a sane size.
const DEFAULT_IMAGE_WIDTH = '200px';
const DEFAULT_BLOCK_IMAGE_WIDTH = '120px';

// style (a per-instance override from the Data & Values image controls)
// wins over the placeholder's own configured image_width, which wins over
// fallbackWidth - same precedence as TemplateGenerationDialog's
// `style.imageWidth || defaultWidth`.
function imageTagFor(
  src: string,
  configuredWidth: string | null | undefined,
  fallbackWidth: string,
  style?: ImageStyle
): string {
  const imgWidth = style?.imageWidth ? `${style.imageWidth}px` : (configuredWidth || fallbackWidth);
  const textAlign = style?.textAlign || 'left';
  const maxWidth = style?.maxWidth || '100%';
  return `<div style="text-align:${textAlign};"><img src="${src}" style="width:${imgWidth}; max-width:${maxWidth}; height:auto; display:inline-block; margin:8px 0; border-radius:2px;" /></div>`;
}

// Which of the document's parties a placeholder's value belongs to, driving
// its .ph-entity-* highlight color in the preview (see themeEngine.ts's
// BASE_SECTION_STYLES). Individual-scoped entity_types (director, employee)
// are unambiguous on their own; anything company-scoped (or untyped, which
// defaults to company) still needs resolveCompanyRole to tell the Consultant
// side from the Client side - the same split page.tsx uses to decide which
// companyId a placeholder resolves against, reused here purely for display.
function resolveHighlightCategory(p: EcPlaceholder): 'consultant' | 'client' | 'employee' | 'director' | null {
  const entity = p.entity_type?.[0];
  if (entity === 'director') return 'director';
  if (entity === 'individual' || entity === 'employee') return 'employee';
  return resolveCompanyRole(p) === 'consultant' ? 'consultant' : 'client';
}

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
  themeSettings, onThemeChange, saving, onSave, selectedDirectors, placeholders, imageStyles
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
    return withDerivedFeeValues({ ...resolvedValues, ...flatArray, ...overrides });
  }, [resolvedValues, arrayData, overrides]);

  // Directors acknowledgement: if the user has edited any director row data
  // in the DataValuesPanel, build the block HTML from those edits; otherwise
  // fall back to the computed value from selectedDirectors.
  const mergedValues = useMemo(() => {
    let base = mergedValuesRaw;
    // Check if any director block rows exist in arrayData (meaning the user
    // has made edits or the data was resolved).
    const directorRows = arrayData?.['directors_acknowledgement_block'] || arrayData?.['directors_block'] || [];
    if (directorRows.length > 0) {
      // Build acknowledgement HTML from the arrayData rows — each row's
      // child fields become the Name/Sign/Date lines.
      const blockHtml = directorRows.map((row) => {
        const name = row.director_name || row.name || row.full_name || row.entity_name || '______________________';
        const sign = row.sign || '________________________';
        const date = row.date || '________________________';
        return `<p>Director's Name: ${name}</p>\n<p>Sign: ${sign}  Date: ${date}</p>`;
      }).join('\n');
      base = { ...base, directors_acknowledgement_block: blockHtml };
    } else {
      // No array data — use the selectedDirectors-based computed value.
      base = withDirectorsAcknowledgementBlock(base, selectedDirectors);
    }

    const wrap = (key: string, value: string, category: string | null): string => {
      if (LIST_MARKUP_KEYS.has(key)) return value;
      const isMissing = !value;
      const display = isMissing ? MISSING_VALUE_PLACEHOLDER : value;
      const missingClass = isMissing ? ' ph-entity-missing' : '';
      if (!category) return display;
      return `<span class="ph-entity-${category}${missingClass}">${display}</span>`;
    };

    const highlighted: Record<string, string> = {};
    for (const p of placeholders) {
      // Image placeholders carry a raw URL/data-URI that the image-rendering
      // pass below matches on startsWith('http'/'data:image') - wrapping it
      // in a <span> here would break that match and silently drop the image.
      highlighted[p.key] = p.type === 'image' ? (base[p.key] || '') : wrap(p.key, base[p.key] || '', resolveHighlightCategory(p));
    }
    for (const [key, value] of Object.entries(base)) {
      if (key in highlighted) continue;
      highlighted[key] = wrap(key, value, null);
    }
    return highlighted;
  }, [mergedValuesRaw, arrayData, selectedDirectors, placeholders]);

  // Expand any {#blockName}...{/blockName} repeating block patterns in the
  // template content using arrayData, matching TemplateGenerationDialog's
  // populateHtmlContent block replacement. Each occurrence of the block's
  // inner template is repeated once per row in arrayData[blockName], with
  // {{child_key}} placeholders replaced from each row's values.
  const expandBlocks = useCallback((text: string): string => {
    if (!arrayData || Object.keys(arrayData).length === 0) return text;
    // Block children don't necessarily share one entity_type (a block could
    // mix director fields with a company-scoped one), so each child's own
    // highlight category is looked up individually rather than hardcoding
    // 'director' for the whole block.
    const categoryByKey = new Map(placeholders.map((p) => [p.key, resolveHighlightCategory(p)]));
    const imagePlaceholderByKey = new Map(placeholders.filter((p) => p.type === 'image').map((p) => [p.key, p]));
    let result = text;
    for (const [blockName, rows] of Object.entries(arrayData)) {
      if (!rows || rows.length === 0) continue;
      const blockRegex = new RegExp(`\\{#${blockName}\\}([\\s\\S]*?)\\{/${blockName}\\}`, 'g');
      result = result.replace(blockRegex, (_match, innerTemplate: string) => {
        return rows.map((row, rowIdx) => {
          let rowHtml = innerTemplate;
          for (const [childKey, val] of Object.entries(row)) {
            // %? allows the docxtemplater image-tag syntax ({%field_name}),
            // which the template author uses for image fields alongside the
            // plain {{field_name}} used for text.
            const childRegex = new RegExp(`\\{+\\s*%?\\s*${childKey}\\s*\\}+`, 'g');
            const display = String(val || '');
            const imagePlaceholder = imagePlaceholderByKey.get(childKey);
            if (imagePlaceholder && display && (display.startsWith('http') || display.startsWith('data:image'))) {
              const style = imageStyles?.[blockImageFieldKey(blockName, rowIdx, childKey)];
              rowHtml = rowHtml.replace(childRegex, imageTagFor(display, imagePlaceholder.image_width, DEFAULT_BLOCK_IMAGE_WIDTH, style));
            } else {
              const category = categoryByKey.get(childKey);
              const wrapped = category ? `<span class="ph-entity-${category}${display ? '' : ' ph-entity-missing'}">${display || MISSING_VALUE_PLACEHOLDER}</span>` : display;
              rowHtml = rowHtml.replace(childRegex, wrapped);
            }
          }
          return rowHtml;
        }).join('');
      });
    }
    return result;
  }, [arrayData, placeholders, imageStyles]);

  // Image-aware replacement: detects image URLs in values and renders them
  // as <img> tags instead of plain text.  Runs BEFORE the general
  // replacePlaceholders so image tokens get proper HTML rendering; the
  // general pass then handles all remaining text tokens.
  const replaceImagePlaceholders = useCallback(
    (text: string, values: Record<string, string>, imagePlaceholderByKey: Map<string, EcPlaceholder>): string => {
      // %? allows the docxtemplater image-tag syntax ({%field_name}), same
      // as the block child regex above.
      return text.replace(/\{+\s*%?\s*([a-zA-Z0-9_]+)\s*\}+/g, (match, key) => {
        const imagePlaceholder = imagePlaceholderByKey.get(key);
        if (!imagePlaceholder) return match;
        const val = values[key];
        if (!val || (!val.startsWith('http') && !val.startsWith('data:image'))) return '';
        return imageTagFor(val, imagePlaceholder.image_width, DEFAULT_IMAGE_WIDTH, imageStyles?.[key]);
      });
    },
    [imageStyles]
  );

  const bodyHtml = useMemo(() => {
    const expanded = expandBlocks(templateContent || '');
    // Build the map of image-type placeholders (keyed by name) for the image
    // pass, so each token can be sized from its own configured image_width.
    const imagePlaceholderByKey = new Map(
      placeholders.filter((p) => p.type === 'image').map((p) => [p.key, p])
    );
    // Pass 1: render image placeholders as <img> tags.
    const withImages = imagePlaceholderByKey.size > 0
      ? replaceImagePlaceholders(expanded, mergedValues, imagePlaceholderByKey)
      : expanded;
    // Pass 2: replace all remaining text placeholders (skipping image keys
    // that were already handled, to avoid double-rendering).
    const textValues = imagePlaceholderByKey.size > 0
      ? Object.fromEntries(Object.entries(mergedValues).filter(([k]) => !imagePlaceholderByKey.has(k)))
      : mergedValues;
    const content = withTableOfContents(replacePlaceholders(withImages, textValues));
    return content ? `<div class="cs-section">${content}</div>` : '';
  }, [templateContent, mergedValues, expandBlocks, placeholders, replaceImagePlaceholders]);

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
