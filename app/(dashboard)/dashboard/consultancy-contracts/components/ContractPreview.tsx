'use client';

import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Loader2, Save, FileDown, ChevronDown, Building2, FolderCheck } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { replacePlaceholders } from '../../tasks-requirements/utils/templateFormatters';
import { downloadBlob, buildWordDocBlob, printElementAsPdf } from '@/lib/documentExport';
import { withDerivedFeeValues } from '../utils/feeCalculations';
import { saveContractToProfile } from '../utils/kycUpload';
import type { Company } from '../../companies/database';
import type { CcEngagement } from '../utils/ccEngagements';

interface ContractPreviewProps {
  company: Company | null;
  templateContent: string;
  resolvedValues: Record<string, string>;
  overrides: Record<string, string>;
  engagement: CcEngagement | null;
  saving: boolean;
  onSave: () => void;
}

const PAGE_CSS = `
  .cc-doc { font-family: 'Times New Roman', Georgia, serif; font-size: 12px; line-height: 1.6; color: #1a1a1a; }
  .cc-doc h1, .cc-doc h2, .cc-doc h3 { font-weight: 700; margin: 1.2em 0 0.5em; }
  .cc-doc h1 { font-size: 18px; text-align: center; }
  .cc-doc h2 { font-size: 14px; }
  .cc-doc p { margin: 0 0 0.8em; text-align: justify; }
  .cc-doc table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  .cc-doc table td, .cc-doc table th { border: 1px solid #999; padding: 6px 8px; font-size: 11px; }
  .cc-doc table th { background: #f3f4f6; font-weight: 700; }
  @media print { @page { size: 8.5in 11.7in; margin: 0.5in; } }
`;

export function ContractPreview({ company, templateContent, resolvedValues, overrides, engagement, saving, onSave }: ContractPreviewProps) {
  const docRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<'word' | 'pdf' | null>(null);
  const [filingToProfile, setFilingToProfile] = useState(false);

  const mergedValues = useMemo(
    () => withDerivedFeeValues({ ...resolvedValues, ...overrides }),
    [resolvedValues, overrides]
  );

  const renderedHtml = useMemo(
    () => replacePlaceholders(templateContent || '', mergedValues),
    [templateContent, mergedValues]
  );

  const fileNameBase = company ? `Consultancy Agreement - ${company.company_name}` : 'Consultancy Agreement';

  const handleExportWord = () => {
    if (!renderedHtml) return;
    setExporting('word');
    try {
      const blob = buildWordDocBlob({ html: renderedHtml, title: fileNameBase, css: PAGE_CSS });
      downloadBlob(blob, `${fileNameBase}.doc`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to export Word document');
    } finally {
      setExporting(null);
    }
  };

  const handleExportPdf = async () => {
    if (!docRef.current) return;
    setExporting('pdf');
    try {
      await printElementAsPdf({
        element: docRef.current,
        fileName: fileNameBase,
        bodyClassName: 'pdf-mode',
        detach: true,
      });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to export PDF');
    } finally {
      setExporting(null);
    }
  };

  const handleSaveToProfile = async () => {
    if (!company || !renderedHtml) return;
    setFilingToProfile(true);
    try {
      const result = await saveContractToProfile(company.id, company.company_name, renderedHtml);
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
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center gap-2">
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
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 rounded-full text-xs gap-1.5" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-full text-xs gap-1.5"
            onClick={handleSaveToProfile}
            disabled={filingToProfile}
            title="Files a Word copy under this company's Accountant Contract document"
          >
            {filingToProfile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderCheck className="w-3.5 h-3.5" />}
            Save to Profile
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8 rounded-full text-xs gap-1.5 bg-custom-blue hover:bg-custom-blue/90" disabled={!!exporting}>
                {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                Export
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportWord}>Download as Word (.doc)</DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPdf}>Download as PDF</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-slate-200/60 dark:bg-slate-900 p-6">
        <style>{PAGE_CSS}</style>
        <div
          ref={docRef}
          className="cc-doc mx-auto bg-white dark:bg-slate-950 shadow-md"
          style={{ width: '210mm', minHeight: '297mm', padding: '20mm' }}
          dangerouslySetInnerHTML={{ __html: renderedHtml || '<p style="text-align:center;color:#9ca3af;">No template content yet - configure it in Settings.</p>' }}
        />
      </div>
    </div>
  );
}
