import { useEffect, useState, useRef } from 'react';
import supabase from '@/lib/supabase/client';
import { PreviewPanel } from '../../tasks-requirements/components/PreviewPanel';
import { generateWordDocument } from '../../tasks-requirements/utils/documentGenerator';
import { replacePlaceholders } from '../../tasks-requirements/utils/templateFormatters';
import { EDITOR_PREVIEW_STYLES } from '../../tasks-requirements/utils/templateUtils';
import { Button } from '@/components/ui/button';
import { Download, Loader2, Save, FileText, FileWarning, ChevronDown } from 'lucide-react';
import { saveAs } from 'file-saver';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface ContractPreviewProps {
  contractData: any;
  selectedTemplate: any;
}

export function ContractPreview({ contractData, selectedTemplate }: ContractPreviewProps) {
  const isWordTemplate = selectedTemplate?.file_type === WORD_MIME;
  const isHtmlTemplate = selectedTemplate?.file_type === 'text/html';

  const [mergedDocxBlob, setMergedDocxBlob] = useState<Blob | null>(null);
  const [mergedDocxBuffer, setMergedDocxBuffer] = useState<ArrayBuffer | null>(null);
  const [originalDocxBuffer, setOriginalDocxBuffer] = useState<ArrayBuffer | null>(null);

  const [mergedHtml, setMergedHtml] = useState<string>('');
  const [originalHtml, setOriginalHtml] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    async function updatePreview() {
      setMergedDocxBlob(null);
      setMergedDocxBuffer(null);
      setOriginalDocxBuffer(null);
      setMergedHtml('');
      setOriginalHtml('');
      setError(null);

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

          const merged = await generateWordDocument(arrayBuffer, values);
          setMergedDocxBlob(merged);
          setMergedDocxBuffer(await merged.arrayBuffer());
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

  const buildOutput = (): { blob: Blob; fileName: string } | null => {
    if (!contractData.employee) return null;
    const baseName = contractData.employee.fullName.replace(/\s+/g, '_');

    if (isWordTemplate && mergedDocxBlob) {
      return { blob: mergedDocxBlob, fileName: `${baseName}_Employment_Contract.docx` };
    }
    if (isHtmlTemplate && mergedHtml) {
      const htmlDoc = `<!doctype html><html><head><meta charset="utf-8"><title>${baseName} Employment Contract</title></head><body>${mergedHtml}</body></html>`;
      return { blob: new Blob([htmlDoc], { type: 'text/html' }), fileName: `${baseName}_Employment_Contract.html` };
    }
    return null;
  };

  const handleDownloadPdf = async () => {
    const html = mergedHtml;
    if (!html || !contractData.employee) return;
    setIsDownloading(true);
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const baseName = contractData.employee.fullName.replace(/\s+/g, '_');
      const container = document.createElement('div');
      container.innerHTML = html;
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.width = '210mm';
      document.body.appendChild(container);

      await html2pdf()
        .set({
          margin: 10,
          filename: `${baseName}_Employment_Contract.pdf`,
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(container)
        .save();

      document.body.removeChild(container);
    } catch (err: any) {
      console.error('PDF generation error:', err);
      toast.error('Failed to generate PDF');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadWord = async () => {
    const html = mergedHtml;
    if (!html || !contractData.employee) return;
    setIsDownloading(true);
    try {
      const { default: mammoth } = await import('mammoth');
      const baseName = contractData.employee.fullName.replace(/\s+/g, '_');

      // Convert HTML to a simple docx via the existing generateWordDocument pipeline
      // by wrapping the HTML content into a minimal DOCX structure.
      // Since we don't have an original docx template for HTML templates, we use
      // the HTML content directly and let the browser handle it via Blob.
      const docContent = `<!doctype html><html><head><meta charset="utf-8"><title>${baseName} Employment Contract</title></head><body>${html}</body></html>`;
      const blob = new Blob([docContent], { type: 'application/msword' });
      saveAs(blob, `${baseName}_Employment_Contract.doc`);
    } catch (err: any) {
      console.error('Word generation error:', err);
      toast.error('Failed to generate Word document');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownload = () => {
    if (isHtmlTemplate) return; // Use dropdown instead
    const output = buildOutput();
    if (output) saveAs(output.blob, output.fileName);
  };

  const handleSaveToDb = async () => {
    const output = buildOutput();
    if (!output || !contractData.employee || !selectedTemplate) return;
    setIsSaving(true);
    try {
      // 1. Upload the generated document to storage
      const ext = isWordTemplate ? 'docx' : 'html';
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
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 relative">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            Document Preview
          </h2>
          <p className="text-xs text-slate-500">Live preview of the generated contract</p>
        </div>
        <div className="flex items-center gap-2">
          {isHtmlTemplate ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={!hasOutput || loading || isDownloading}>
                  {isDownloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  Download
                  <ChevronDown className="w-3 h-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={handleDownloadPdf} disabled={isDownloading}>
                  Download as PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDownloadWord} disabled={isDownloading}>
                  Download as Word
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button variant="outline" size="sm" onClick={handleDownload} disabled={!hasOutput || loading}>
              <Download className="w-4 h-4 mr-2" /> Download
            </Button>
          )}
          <Button size="sm" className="bg-custom-blue hover:bg-custom-blue/90 text-white" onClick={handleSaveToDb} disabled={!hasOutput || loading || isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Generate & Save
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full text-red-500 p-8 text-center bg-red-50/50 dark:bg-red-950/50">
            <FileWarning className="w-12 h-12 mb-4 text-red-400" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        ) : isHtmlTemplate ? (
          <div className="h-full overflow-auto">
            <PreviewPanel
              previewContent={mergedHtml}
              isPreviewLoading={loading}
              panelClasses="h-full"
              EDITOR_PREVIEW_STYLES={EDITOR_PREVIEW_STYLES}
              templateName={selectedTemplate.file_name}
              isWordTemplate={false}
              docxBuffer={null}
            />
          </div>
        ) : (
          <Tabs defaultValue="preview" className="h-full flex flex-col w-full">
            <div className="px-4 pt-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <TabsList className="bg-slate-100 dark:bg-slate-800">
                <TabsTrigger value="preview" className="text-xs">Live Preview</TabsTrigger>
                <TabsTrigger value="original" className="text-xs">Original Template</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="preview" className="flex-1 m-0 overflow-auto">
              <PreviewPanel
                previewContent={mergedHtml}
                isPreviewLoading={loading}
                panelClasses="h-full"
                EDITOR_PREVIEW_STYLES={EDITOR_PREVIEW_STYLES}
                templateName={selectedTemplate.file_name}
                isWordTemplate={isWordTemplate}
                docxBuffer={mergedDocxBuffer}
              />
            </TabsContent>

            <TabsContent value="original" className="flex-1 m-0 overflow-auto">
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
    </div>
  );
}
