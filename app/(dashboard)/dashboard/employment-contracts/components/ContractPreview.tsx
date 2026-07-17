import { useEffect, useState } from 'react';
import supabase from '@/lib/supabase/client';
import { DocxLivePreview } from '@/components/DocxLivePreview';
import { mergeContractDocx } from '../utils/docxtemplaterHelper';
import { Button } from '@/components/ui/button';
import { Download, Loader2, Save, FileText, FileWarning } from 'lucide-react';
import { saveAs } from 'file-saver';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

interface ContractPreviewProps {
  contractData: any;
  selectedTemplate: any;
}

export function ContractPreview({ contractData, selectedTemplate }: ContractPreviewProps) {
  const [mergedBlob, setMergedBlob] = useState<Blob | null>(null);
  const [mergedFile, setMergedFile] = useState<File | null>(null);
  
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function updatePreview() {
      if (!selectedTemplate || !contractData.employee) {
        setMergedFile(null);
        setOriginalFile(null);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      if (!selectedTemplate.file_path) {
        // Content-based (text/html) templates have no stored file - contract generation
        // currently only supports .docx templates via docxtemplater.
        setError('This template type (text editor) is not yet supported for contract generation. Please choose a DOCX template.');
        setMergedFile(null);
        setOriginalFile(null);
        setLoading(false);
        return;
      }

      try {
        // 1. Download the template from Supabase Storage
        // Templates are uploaded via DocumentTemplateManager into the 'templates' bucket
        // (see acc_portal_templates.file_path convention) - not 'kyc-templates'.
        const { data: fileData, error: downloadError } = await supabase.storage
          .from("templates")
          .download(selectedTemplate.file_path);

        if (downloadError || !fileData) {
          throw new Error('Could not download template file');
        }

        // Store original for the "Original Template" tab
        setOriginalBlob(fileData);
        setOriginalFile(new File([fileData], 'original_template.docx', { type: fileData.type }));

        // 2. Merge data with template
        const arrayBuffer = await fileData.arrayBuffer();
        const merged = await mergeContractDocx(arrayBuffer, contractData);
        setMergedBlob(merged);
        
        const fileName = `${contractData.employee.fullName.replace(/\s+/g, '_')}_Contract.docx`;
        setMergedFile(new File([merged], fileName, { type: merged.type }));

      } catch (err: any) {
        console.error('Error generating preview:', err);
        setError(err.message || 'Failed to generate preview');
      } finally {
        setLoading(false);
      }
    }

    updatePreview();
  }, [selectedTemplate, contractData]); // Will re-run when onRefreshPreview updates previewKey (prop update)

  const handleDownloadDocx = () => {
    if (mergedBlob && contractData.employee) {
      const fileName = `${contractData.employee.fullName.replace(/\s+/g, '_')}_Employment_Contract.docx`;
      saveAs(mergedBlob, fileName);
    }
  };

  const handleSaveToDb = async () => {
    if (!mergedBlob || !contractData.employee || !selectedTemplate) return;
    setIsSaving(true);
    try {
      // 1. Upload the generated document to storage
      const fileName = `generated/${contractData.employee.companyId}/${contractData.employee.individualId}/${Date.now()}_contract.docx`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("kyc-templates") // Can use a separate bucket like "contracts" in real deployment
        .upload(fileName, mergedBlob, { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });

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
          <Button variant="outline" size="sm" onClick={handleDownloadDocx} disabled={!mergedBlob || loading}>
            <Download className="w-4 h-4 mr-2" /> Download
          </Button>
          <Button size="sm" className="bg-custom-blue hover:bg-custom-blue/90 text-white" onClick={handleSaveToDb} disabled={!mergedBlob || loading || isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} 
            Generate & Save
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/60 dark:bg-slate-950/60 backdrop-blur-sm">
            <Loader2 className="w-8 h-8 animate-spin text-custom-blue mb-4" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Generating preview...</p>
          </div>
        )}

        {error ? (
          <div className="flex flex-col items-center justify-center h-full text-red-500 p-8 text-center bg-red-50/50 dark:bg-red-950/50">
            <FileWarning className="w-12 h-12 mb-4 text-red-400" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        ) : (
          <Tabs defaultValue="preview" className="h-full flex flex-col w-full">
            <div className="px-4 pt-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <TabsList className="bg-slate-100 dark:bg-slate-800">
                <TabsTrigger value="preview" className="text-xs">Live Preview</TabsTrigger>
                <TabsTrigger value="original" className="text-xs">Original Template</TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="preview" className="flex-1 m-0 p-4 overflow-auto">
              <div className="bg-white mx-auto shadow-sm border border-slate-200 max-w-[800px] h-full rounded-md overflow-hidden">
                <DocxLivePreview file={mergedFile} />
              </div>
            </TabsContent>
            
            <TabsContent value="original" className="flex-1 m-0 p-4 overflow-auto">
              <div className="bg-white mx-auto shadow-sm border border-slate-200 max-w-[800px] h-full rounded-md overflow-hidden">
                <DocxLivePreview file={originalFile} />
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
