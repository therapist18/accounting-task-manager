import { useEffect, useRef, useState } from 'react';
import supabase from '@/lib/supabase/client';
import { PreviewPanel } from '../../tasks-requirements/components/PreviewPanel';
import { generateWordDocument } from '../../tasks-requirements/utils/documentGenerator';
import { replacePlaceholders } from '../../tasks-requirements/utils/templateFormatters';
import { EDITOR_PREVIEW_STYLES } from '../../tasks-requirements/utils/templateUtils';
import { Button } from '@/components/ui/button';
import { Download, Loader2, Save, FileText, FileWarning, Palette, FileDown } from 'lucide-react';
import { saveAs } from 'file-saver';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { ContractThemePanel } from './ContractThemePanel';
import { ContractThemeSettings, DEFAULT_CONTRACT_THEME, applyThemeToHtml } from '../utils/themeEngine';

const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface ContractPreviewProps {
  contractData: any;
  setContractData?: (updater: any) => void;
  selectedTemplate: any;
}

export function ContractPreview({ contractData, setContractData, selectedTemplate }: ContractPreviewProps) {
  const isWordTemplate = selectedTemplate?.file_type === WORD_MIME;
  const isHtmlTemplate = selectedTemplate?.file_type === 'text/html';

  const themeSettings: ContractThemeSettings = contractData.themeSettings || DEFAULT_CONTRACT_THEME;
  const [themePanelOpen, setThemePanelOpen] = useState(false);

  const [mergedDocxBlob, setMergedDocxBlob] = useState<Blob | null>(null);
  const [mergedDocxBuffer, setMergedDocxBuffer] = useState<ArrayBuffer | null>(null);
  const [originalDocxBuffer, setOriginalDocxBuffer] = useState<ArrayBuffer | null>(null);

  const [mergedHtml, setMergedHtml] = useState<string>('');
  const [originalHtml, setOriginalHtml] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mergeWarning, setMergeWarning] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Hidden, unscaled render targets used only for html2canvas capture - decoupled from the
  // interactive, zoomable PreviewPanel (which doesn't expose its internal ref), so PDF capture
  // never has to fight PreviewPanel's zoom transform.
  const htmlCaptureRef = useRef<HTMLDivElement>(null);
  const docxCaptureRef = useRef<HTMLDivElement>(null);

  // Theme first (which may inject a letterhead header containing its own {{company_name}}
  // etc. tokens), then run placeholder substitution over the whole result - if this ran the
  // other way around, tokens injected by the theme's header would never get replaced.
  const themedMergedHtml = isHtmlTemplate && selectedTemplate?.content
    ? replacePlaceholders(applyThemeToHtml(selectedTemplate.content, themeSettings), contractData.placeholderValues || {})
    : '';

  // Separate, Word-safe rendering of the same content (flattened CSS + table-based
  // signature layout) used only when building the .doc download - see themeEngine's
  // applyThemeToHtml for why the browser-rendered version above can't be reused for Word.
  const wordSafeMergedHtml = isHtmlTemplate && selectedTemplate?.content
    ? replacePlaceholders(applyThemeToHtml(selectedTemplate.content, themeSettings, { wordSafe: true }), contractData.placeholderValues || {})
    : '';

  const updateThemeSettings = (settings: ContractThemeSettings) => {
    setContractData?.((prev: any) => ({ ...prev, themeSettings: settings }));
  };

  useEffect(() => {
    async function updatePreview() {
      setMergedDocxBlob(null);
      setMergedDocxBuffer(null);
      setOriginalDocxBuffer(null);
      setMergedHtml('');
      setOriginalHtml('');
      setError(null);
      setMergeWarning(null);

      if (!selectedTemplate || !contractData.employee) return;

      setLoading(true);
      const values = contractData.placeholderValues || {};

      try {
        if (isWordTemplate) {
          if (!selectedTemplate.file_path) throw new Error('This DOCX template has no file attached.');

          // Templates are uploaded via DocumentTemplateManager into the 'templates' bucket
          // (see acc_portal_templates.file_path convention) - not 'kyc-templates'.
          const { data: fileData, error: downloadError } = await supabase.storage
            .from('templates')
            .download(selectedTemplate.file_path);

          if (downloadError || !fileData) throw new Error('Could not download template file');

          const arrayBuffer = await fileData.arrayBuffer();
          setOriginalDocxBuffer(arrayBuffer);

          // Merging can fail on templates whose placeholder tags got split across
          // separate Word XML runs (e.g. by autocorrect) - docxtemplater then reports
          // "duplicate open/close tag". That's a template authoring issue, not something
          // the user can fix from this screen, so we fall back to just showing the
          // original document instead of blocking the whole preview with an error.
          try {
            const merged = await generateWordDocument(arrayBuffer, values);
            setMergedDocxBlob(merged);
            setMergedDocxBuffer(await merged.arrayBuffer());
          } catch (mergeErr: any) {
            console.error('Error merging DOCX template, falling back to original document:', mergeErr);
            setMergedDocxBlob(null);
            setMergedDocxBuffer(arrayBuffer);
            setMergeWarning('This template could not be auto-filled (its placeholder tags are malformed), so the original document is shown instead. Downloads and saving are disabled until the template is fixed.');
          }
        } else if (isHtmlTemplate) {
          const content = selectedTemplate.content || '';
          setOriginalHtml(content);
          setMergedHtml(replacePlaceholders(content, values));
        } else {
          throw new Error('Unsupported template type for contract generation.');
        }
      } catch (err: any) {
        console.error('Error generating preview:', err);
        setError(err.message || 'Failed to generate preview');
      } finally {
        setLoading(false);
      }
    }

    updatePreview();
  }, [selectedTemplate, contractData, isWordTemplate, isHtmlTemplate]);

  // Render a hidden, unscaled copy of the merged docx into docxCaptureRef purely for PDF capture.
  useEffect(() => {
    if (!isWordTemplate || !mergedDocxBuffer || !docxCaptureRef.current) return;
    let cancelled = false;
    import('docx-preview').then(({ renderAsync }) => {
      if (cancelled || !docxCaptureRef.current) return;
      docxCaptureRef.current.innerHTML = '';
      renderAsync(mergedDocxBuffer, docxCaptureRef.current, undefined, {
        className: 'docx-preview',
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        breakPages: true,
        renderHeaders: true,
        renderFooters: true,
      }).catch((err) => console.error('[ContractPreview] docx-preview capture render error:', err));
    });
    return () => { cancelled = true; };
  }, [isWordTemplate, mergedDocxBuffer]);

  const buildOutput = (): { blob: Blob; fileName: string } | null => {
    if (!contractData.employee) return null;
    const baseName = contractData.employee.fullName.replace(/\s+/g, '_');

    if (isWordTemplate && mergedDocxBlob) {
      return { blob: mergedDocxBlob, fileName: `${baseName}_Employment_Contract.docx` };
    }
    if (isHtmlTemplate && mergedHtml) {
      // Word-openable HTML document (not true OOXML) - uses the Word-safe variant (flat
      // CSS, table-based signature layout) so the theme actually survives Word's import
      // instead of being silently dropped, see themeEngine.applyThemeToHtml.
      const htmlDoc = `<!doctype html><html><head><meta charset="utf-8"><title>${baseName} Employment Contract</title></head><body>${wordSafeMergedHtml}</body></html>`;
      return { blob: new Blob([htmlDoc], { type: 'application/msword' }), fileName: `${baseName}_Employment_Contract.doc` };
    }
    return null;
  };

  const handleDownloadWord = () => {
    const output = buildOutput();
    if (output) saveAs(output.blob, output.fileName);
  };

  const handleDownloadPdf = async () => {
    const element = isWordTemplate ? docxCaptureRef.current : htmlCaptureRef.current;
    if (!element || !contractData.employee) return;

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

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      const totalPages = Math.ceil(imgHeight / pageHeight);

      for (let i = 0; i < totalPages; i++) {
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, -(i * pageHeight), imgWidth, imgHeight);
      }

      const baseName = contractData.employee.fullName.replace(/\s+/g, '_');
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
    if (!output || !contractData.employee || !selectedTemplate) return;
    setIsSaving(true);
    try {
      // 1. Upload the generated document to storage
      const ext = isWordTemplate ? 'docx' : 'doc';
      const fileName = `generated/${contractData.employee.companyId}/${contractData.employee.individualId}/${Date.now()}_contract.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("kyc-templates") // Can use a separate bucket like "contracts" in real deployment
        .upload(fileName, output.blob, { contentType: output.blob.type });

      if (uploadError) throw new Error('Failed to upload generated document to storage');

      // 2. Save record to our new acc_employment_contracts table
      const { data: { session } } = await supabase.auth.getSession();

      const { data: insertData, error: insertError } = await supabase
        .from('acc_employment_contracts')
        .insert([{
          contract_number: `CNT-${Date.now()}`,
          employee_id: String(contractData.employee.individualId),
          company_id: String(contractData.employee.companyId),
          template_id: selectedTemplate.id,
          status: 'generated',
          docx_path: fileName,
          metadata: contractData,
          generated_by: session?.user?.id || null
        }])
        .select()
        .single();

      if (insertError) throw new Error('Failed to save contract record');

      // 3. Save audit trail
      if (insertData) {
        await supabase.from('acc_employment_contracts_audit').insert([{
          contract_id: insertData.id,
          action: 'generated',
          user_id: session?.user?.id || null,
          details: `Contract generated for ${contractData.employee.fullName}`
        }]);
      }

      toast.success('Contract generated and saved successfully!');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Error saving contract');
    } finally {
      setIsSaving(false);
    }
  };

  if (!selectedTemplate || !contractData.employee) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8 text-center bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">
        <FileText className="w-16 h-16 mb-4 text-slate-200 dark:text-slate-700" />
        <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300">Live Document Preview</h3>
        <p className="text-sm">Select an employee and a template to view the generated document.</p>
      </div>
    );
  }

  const hasOutput = isWordTemplate ? !!mergedDocxBlob : !!mergedHtml;

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 relative overflow-hidden">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            Document Preview
          </h2>
          <p className="text-xs text-slate-500">Live preview of the generated contract</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setThemePanelOpen(true)}
            disabled={!isHtmlTemplate}
            title={isHtmlTemplate ? 'Customize document theme' : 'Theming is only available for text-editor templates - DOCX templates use their own file styling'}
            className={cn(themePanelOpen && "border-custom-blue text-custom-blue")}
          >
            <Palette className="w-4 h-4 mr-2" /> Theme
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={!hasOutput || loading || isGeneratingPdf}>
            {isGeneratingPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />} PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadWord} disabled={!hasOutput || loading}>
            <Download className="w-4 h-4 mr-2" /> Word
          </Button>
          <Button size="sm" className="bg-custom-blue hover:bg-custom-blue/90 text-white" onClick={handleSaveToDb} disabled={!hasOutput || loading || isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Generate & Save
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative flex flex-col min-h-0">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full text-red-500 p-8 text-center bg-red-50/50 dark:bg-red-950/50">
            <FileWarning className="w-12 h-12 mb-4 text-red-400" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        ) : (
          <Tabs defaultValue="preview" className="h-full flex flex-col w-full min-h-0 overflow-hidden">
            <div className="px-4 pt-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <TabsList className="bg-slate-100 dark:bg-slate-800">
                <TabsTrigger value="preview" className="text-xs">Live Preview</TabsTrigger>
                <TabsTrigger value="original" className="text-xs">Original Template</TabsTrigger>
              </TabsList>
            </div>
            {mergeWarning && (
              <div className="flex items-start gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-xs shrink-0">
                <FileWarning className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <p>{mergeWarning}</p>
              </div>
            )}

            <TabsContent value="preview" className="flex-1 m-0 overflow-auto min-h-0 h-full">
              <PreviewPanel
                previewContent={themedMergedHtml}
                isPreviewLoading={loading}
                panelClasses="h-full"
                EDITOR_PREVIEW_STYLES={EDITOR_PREVIEW_STYLES}
                templateName={selectedTemplate.file_name}
                isWordTemplate={isWordTemplate}
                docxBuffer={mergedDocxBuffer}
              />
            </TabsContent>

            <TabsContent value="original" className="flex-1 m-0 overflow-auto min-h-0 h-full">
              <PreviewPanel
                previewContent={originalHtml}
                isPreviewLoading={loading}
                panelClasses="h-full"
                EDITOR_PREVIEW_STYLES={EDITOR_PREVIEW_STYLES}
                templateName={selectedTemplate.file_name}
                isWordTemplate={isWordTemplate}
                docxBuffer={originalDocxBuffer}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>

      <ContractThemePanel
        open={themePanelOpen}
        onClose={() => setThemePanelOpen(false)}
        settings={themeSettings}
        onChange={updateThemeSettings}
      />

      {/* Hidden, unscaled capture targets for PDF export - kept out of view but laid out
          at natural size so html2canvas doesn't have to fight any zoom/scale transform. */}
      <div className="fixed left-[-99999px] top-0 pointer-events-none" aria-hidden="true">
        {isHtmlTemplate && (
          <div ref={htmlCaptureRef} className="bg-white w-[800px] p-10" dangerouslySetInnerHTML={{ __html: themedMergedHtml }} />
        )}
        {isWordTemplate && (
          <div ref={docxCaptureRef} className="bg-white w-[800px]" />
        )}
      </div>
    </div>
  );
}
