/**
 * Utility functions for template generation
 */

import supabase from "@/lib/supabase/client";

export const EDITOR_PREVIEW_STYLES = `
  prose prose-sm sm:prose-base dark:prose-invert max-w-full focus:outline-none
  font-serif
  [&_*]:whitespace-pre-wrap
  [&_p]:min-h-[1em]
  [&_p]:my-0
  [&_p]:mt-0
  [&_p]:pt-0
  [&_first-child]:mt-0
  [&_first-child]:pt-0
  [&_last-child]:mb-0
  [&_table]:border-collapse [&_table]:border [&_table]:border-border [&_table]:w-full [&_table]:my-4
  [&_th]:border [&_th]:border-border [&_th]:bg-muted/50 [&_th]:p-2 [&_th]:text-left
  [&_td]:border [&_td]:border-border [&_td]:p-2 relative
`.replace(/\s+/g, ' ').trim();

export const formatWhitespace = (val: any): string => {
  if (val === null || val === undefined) return '';
  return String(val)
    // Convert 2 or more spaces to non-breaking spaces (&nbsp;)
    .replace(/  +/g, (match: string) => '&nbsp;'.repeat(match.length))
    // Ensure literal newlines are converted to HTML breaks
    .replace(/\n/g, '<br />');
};

export const isDate = (str: string): boolean => {
  if (!str || typeof str !== 'string') return false;

  const datePatterns = [
    /^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/,
    /^\d{4}[\/\-]\d{2}[\/\-]\d{2}$/,
    /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/,
  ];

  return datePatterns.some(pattern => pattern.test(str.trim()));
};

export const processDigitSplit = (value: any, digitCount = 8): string[] => {
  if (!value) return [];

  const strValue = String(value);
  const chars = isDate(strValue)
    ? strValue.replace(/\D/g, '').split('')
    : strValue.split('');

  const result = [];
  for (let i = 1; i <= digitCount; i++) {
    result.push(chars[i - 1] || '');
  }
  return result;
};

export const formatDate = (date: Date | string, formatStr?: string): string => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  if (!formatStr) return `${year}-${month}-${day}`;

  return formatStr
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day);
};

export const base64Parser = async (dataURL: string): Promise<ArrayBuffer | null> => {
  try {
    if (!dataURL) return null;

    if (typeof dataURL === 'string' && dataURL.startsWith('data:')) {
      const matches = dataURL.match(/^data:(image\/[^;]+);base64,(.*)$/);
      if (!matches) return null;

      const mimeType = matches[1];
      const base64 = matches[2];
      const binaryStr = atob(base64);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      return bytes.buffer;
    }

    if (typeof dataURL === 'string' && (dataURL.startsWith('http') || dataURL.startsWith('blob:'))) {
      const response = await fetch(dataURL);
      if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
      const blob = await response.blob();
      return new Promise<ArrayBuffer | null>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = reject;
        reader.readAsArrayBuffer(blob);
      });
    }

    return null;
  } catch (error) {
    console.error('Error in base64Parser:', error);
    return null;
  }
};

export const toBase64 = (file: File | Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result as string);
  reader.onerror = error => reject(error);
});

export const fetchImageAsBase64 = async (url: string): Promise<string | null> => {
  try {
    // If private, use Supabase to get a temporary authorized URL
    const path = url.split('/public/kyc-documents/')[1];
    const { data, error } = await supabase.storage
      .from('kyc-documents')
      .createSignedUrl(path, 60);

    const finalUrl = data?.signedUrl || url;
    const response = await fetch(finalUrl, { mode: 'cors' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await toBase64(blob);
  } catch (error) {
    return null;
  }
};

export const parseJsonValue = (data: any, path: string): string => {
  if (!path || !data) return '';
  try {
    let currentValue = data;
    const normalizedPath = path.replace(/->>/g, '->').replace(/'/g, '');

    const parts = normalizedPath.split(/->|\./);

    for (let i = 0; i < parts.length; i++) {
      const key = parts[i].trim();
      if (!key) continue;
      if (currentValue && currentValue.current !== undefined && key === 'current') {
        currentValue = currentValue.current;
      }

      if (Array.isArray(currentValue)) {
        // For branch-linked arrays (items carry branch_id), resolve to the main branch item
        // rather than always taking index 0.
        if (currentValue.length > 0 && currentValue[0]?.branch_id !== undefined) {
          const branches = Array.isArray(data?.branch) ? data.branch : null;
          const mainBranch = branches?.find((b: any) => b.is_main === true);
          if (mainBranch) {
            const mainItem = currentValue.find(
              (item: any) => String(item.branch_id) === String(mainBranch.branch_id)
            );
            currentValue = mainItem ?? currentValue[0];
          } else {
            currentValue = currentValue[0];
          }
        } else {
          currentValue = currentValue[0];
        }
        // If this key was a numeric array index (e.g. '0' in ->>'0.postal_address'),
        // skip the key lookup — array resolution already consumed it.
        if (/^\d+$/.test(key)) continue;
      }

      if (currentValue && typeof currentValue === 'object') {
        if (currentValue[key] !== undefined) {
          currentValue = currentValue[key];
        } else {
          const lowerKey = key.toLowerCase();
          const foundKey = Object.keys(currentValue).find(k => k.toLowerCase() === lowerKey);
          if (foundKey) {
            currentValue = currentValue[foundKey];
          } else {
            currentValue = undefined;
          }
        }
      } else if (i < parts.length - 1) {
        return '';
      }
    }

    const finalValue = currentValue !== undefined && currentValue !== null ? String(currentValue) : '';
    return finalValue;
  } catch (error) {
    return '';
  }
};

export const normalizeString = (str: string): string => {
  return !str ? '' : str.toLowerCase().replace(/[_\s-]/g, '');
};

export const findPrimaryDirector = (relationshipData: any): any => {
  if (!relationshipData?.directors?.length) return null;
  const directors = Array.isArray(relationshipData.directors)
    ? relationshipData.directors
    : [relationshipData.directors];
  return directors.find((d: any) => d.is_primary) || directors[0];
};

export const getOrdinalNumber = (index: number): string => {
  const num = index + 1;

  if (num % 100 >= 11 && num % 100 <= 13) {
    return `${num}th`;
  }

  switch (num % 10) {
    case 1: return `${num}st`;
    case 2: return `${num}nd`;
    case 3: return `${num}rd`;
    default: return `${num}th`;
  }
};

export const getOrdinalWord = (index: number): string => {
  const words = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
  return words[index] || getOrdinalNumber(index);
};

export const parseImageDimension = (dimension: string | undefined): number | null => {
  if (!dimension) return null;

  const cleaned = dimension.toString().trim();
  const numericValue = parseFloat(cleaned);

  if (isNaN(numericValue)) return null;

  return numericValue;
};

export const checkDocumentStatus = (
  documentId: string,
  entityId: string,
  entityType: string,
  sourceDataCache: Record<string, Record<number, any>>,
  dataSourceConfig?: {
    table: string;
    linking_variable: string;
    document_id_field: string;
  }
): boolean => {
  const config = dataSourceConfig || {
    table: 'acc_portal_kyc_uploads',
    linking_variable: entityType === 'company' ? 'company_id' : 'individual_id',
    document_id_field: 'document_id'
  };
  const uploads = sourceDataCache[config.table] || {};
  const documentFound = Object.values(uploads).some(upload => {
    const uploadDocId = upload[config.document_id_field];
    const uploadEntityId = upload[config.linking_variable];
    return uploadDocId === documentId && uploadEntityId === entityId;
    return String(upload[config.linking_variable]) === String(entityId);
  });
  return documentFound;
};

export const generateDocumentChecklist = (
  placeholder: any,
  entityId: string,
  entityType: string,
  sourceDataCache: Record<string, Record<number, any>>,
  availableDocuments: Array<{ id: string; display_name: string; name: string }>
): string => {
  const linkedDocs = placeholder.linked_document_ids || [];
  const format = placeholder.checklist_display_format || 'checkboxes';
  const dataSourceConfig = placeholder.checklist_data_source;
  if (linkedDocs.length === 0) {
    return '';
  }
  const checklist = linkedDocs.map((docId: string) => {
    const doc = availableDocuments.find((d: { id: string; display_name?: string; name?: string }) => d.id === docId);
    const isFound = checkDocumentStatus(
      docId,
      entityId,
      entityType,
      sourceDataCache,
      dataSourceConfig
    );

    const docName = doc?.display_name || doc?.name || 'Unknown Document';
    const symbol = isFound ? '✓' : '';

    switch (format) {
      case 'bullets':
        return `• ${docName}${isFound ? ' ✓' : ''}`;
      case 'table':
        return `| ${symbol} | ${docName} | ${isFound ? 'Submitted' : 'Pending'} |`;
      default: // checkboxes
        return `${symbol}`;
    }
  });

  if (format === 'table') {
    return `| Status | Document | Notes |\n|--------|----------|-------|\n${checklist.join('\n')}`;
  }

  return checklist.join('\n');
};

export const getDisplayLabel = (value: any, options: any[]): string => {
  if (!options || !Array.isArray(options)) return value;
  const option = options.find((o: { value: any; label?: string }) =>
    String(o.value) === String(value) ||
    o.label === value ||
    o.value === value
  );
  return option ? option.label : value;
};

export const extractDisplayValue = (value: any): string => {
  if (value === null || value === undefined) return '';

  if (Array.isArray(value)) {
    const checkedItems = value.filter((opt: any) => opt && opt.checked);

    if (checkedItems.length > 0) {
      return checkedItems.map((opt: any) => {
        return opt.label || opt.tag || opt.value || '';
      }).join(', ');
    }
    return '';
  }

  if (typeof value === 'object') {
    return value.value !== undefined ? String(value.value) : '';
  }

  return String(value);
};

export const isValidValue = (val: any, placeholderType?: string): boolean => {
  if (val === null || val === undefined) return false;

  if (placeholderType === 'boolean' && Array.isArray(val)) {
    return val.some((opt: any) => opt && opt.checked === true);
  }

  if (Array.isArray(val)) {
    return val.length > 0;
  }
  if (typeof val === 'string') {
    if (val === '') return false;
    const errorStrings = ['Missing', 'Missing Config', 'No Source', 'Computing...', 'Document Not Found', 'Field Not Found'];
    return !errorStrings.includes(val);
  }
  return Boolean(val);
};
