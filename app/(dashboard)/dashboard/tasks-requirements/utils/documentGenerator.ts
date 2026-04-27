// @ts-nocheck
import supabase from "@/lib/supabase/client";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import ImageModule from 'docxtemplater-image-module-free';
import { base64Parser } from './templateUtils';

interface GenerateDocumentOptions {
  templateBuffer: ArrayBuffer | null;
  formData: Record<string, any>;
  template: any;
  imageStyles: Record<string, any>;
  isWordTemplate: boolean;
}

interface SaveDraftOptions {
  formData: Record<string, any>;
  template: any;
  selectedTemplate: any;
  task: any;
  activeEntityType: string;
  config: any;
  docxTemplateBuffer: React.MutableRefObject<ArrayBuffer | null>;
  isWordTemplate: boolean;
  setIsGenerating: (generating: boolean) => void;
}

export const fetchTemplateBuffer = async (templateId: string, filePath: string): Promise<ArrayBuffer | null> => {
  try {
    const { data, error } = await supabase.storage
      .from('kyc-documents')
      .download(filePath);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Failed to fetch template:', error);
    return null;
  }
};

export const prepareRenderData = async (formData: Record<string, any>, imageStyles?: Record<string, any>): Promise<Record<string, any>> => {
  const renderData: Record<string, any> = {};

  for (const [key, value] of Object.entries(formData)) {
    if (Array.isArray(value)) {
      if (value.length > 0 && value[0]?.linked_job_question_id) {
        renderData[key] = value.find((opt: any) => opt.checked)?.tag || '';
      } else {
        renderData[key] = value;
      }
    } else if (typeof value === 'string' && value.startsWith('data:')) {
      try {
        const buffer = await base64Parser(value);
        if (buffer) {
          renderData[key] = { _buffer: buffer };
        }
      } catch (error) {
        renderData[key] = value;
      }
    } else {
      renderData[key] = value;
    }
  }

  if (imageStyles) {
    for (const [key, style] of Object.entries(imageStyles)) {
      if (formData[key]) {
        renderData[`${key}_style`] = style;
      }
    }
  }

  return renderData;
};

export const generateWordDocument = async (
  templateBuffer: ArrayBuffer,
  renderData: Record<string, any>
): Promise<Blob> => {
  const zip = new PizZip(templateBuffer);
  
  const imageModule = new ImageModule({
    centered: false,
    getImage: (tagValue: string) => {
      if (tagValue && typeof tagValue === 'object' && tagValue._buffer) {
        return tagValue._buffer;
      }
      return null;
    },
  });

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
    modules: [imageModule],
  });

  doc.setData(renderData);
  doc.render();

  return doc.getZip().generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
};

export const generateDocument = async ({
  templateBuffer,
  formData,
  template,
  imageStyles,
  isWordTemplate,
}: GenerateDocumentOptions): Promise<Blob | null> => {
  if (!templateBuffer && isWordTemplate) {
    return null;
  }

  const renderData = await prepareRenderData(formData, imageStyles);

  if (isWordTemplate && templateBuffer) {
    return generateWordDocument(templateBuffer, renderData);
  }

  return null;
};

export const saveAsDraft = async ({
  formData,
  template,
  selectedTemplate,
  task,
  activeEntityType,
  config,
  docxTemplateBuffer,
  isWordTemplate,
  setIsGenerating,
}: SaveDraftOptions): Promise<void> => {
  setIsGenerating(true);
  try {
    const kycDocId = selectedTemplate?.document_id || template?.document_id;
    
    let templateBuffer = docxTemplateBuffer.current;
    if (!templateBuffer && isWordTemplate) {
      templateBuffer = await fetchTemplateBuffer(selectedTemplate.id, selectedTemplate.file_path);
      if (!templateBuffer) {
        throw new Error("Failed to fetch template source from storage");
      }
      docxTemplateBuffer.current = templateBuffer;
    }

    let storagePath = null;
    if (isWordTemplate && templateBuffer) {
      const renderData = await prepareRenderData(formData);
      const docBlob = await generateWordDocument(templateBuffer, renderData);
      
      const timestamp = Date.now();
      const entityFolder = activeEntityType === 'company' ? 'company-documents' : 'individuals-documents';
      const path = `${entityFolder}/${config.entityId}/${kycDocId}_${timestamp}.docx`;

      const { data: storageData, error: storageError } = await supabase.storage
        .from('kyc-documents')
        .upload(path, docBlob, { cacheControl: '3600', upsert: true });
      
      if (storageError) throw storageError;
      storagePath = path;
    }

    const { data: draftData, error: draftError } = await supabase
      .from('acc_portal_template_drafts')
      .upsert({
        task_id: task?.id,
        template_id: selectedTemplate?.id,
        entity_id: config.entityId,
        entity_type: activeEntityType,
        form_data: formData,
        storage_path: storagePath,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (draftError) throw draftError;

    return draftData;
  } catch (error) {
    console.error('Save draft failed:', error);
    throw error;
  } finally {
    setIsGenerating(false);
  }
};

export const downloadDocument = async (
  formData: Record<string, any>,
  templateBuffer: ArrayBuffer | null,
  selectedTemplate: any,
  imageStyles: Record<string, any>,
  isWordTemplate: boolean
): Promise<void> => {
  if (!templateBuffer && isWordTemplate) {
    throw new Error("Template buffer not available");
  }

  const renderData = await prepareRenderData(formData, imageStyles);

  if (isWordTemplate && templateBuffer) {
    const docBlob = await generateWordDocument(templateBuffer, renderData);
    
    const timestamp = Date.now();
    const fileName = `${selectedTemplate?.name || 'document'}_${timestamp}.docx`;
    
    const url = URL.createObjectURL(docBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
};
