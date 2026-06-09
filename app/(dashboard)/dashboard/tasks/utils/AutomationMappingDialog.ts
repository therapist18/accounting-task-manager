
export const parseJsonValue = (data: any, path: string, extractionMode?: 'latest' | 'all'): any => {
  if (!data || !path) return undefined;
  if (path.includes('->>') || path.includes('->')) {
    const parts = path.split(/(->>|->)/);
    const column = parts[0].trim().replace(/['"]/g, '');
    const jsonPath = parts[2].trim().replace(/['"]/g, '');
    const jsonData = data[column];
    if (jsonData === undefined || jsonData === null) return undefined;
    if (jsonPath.includes('[]')) {
      const [arrayPath, ...fieldPathParts] = jsonPath.split('[]');
      const fieldPath = fieldPathParts.join('').replace(/^\./, ''); // Remove leading dot
      const arrayData = arrayPath.split('.').reduce((acc, key) => {
        if (key === '' || key === '[]') return acc;
        return (acc && typeof acc === 'object') ? acc[key] : undefined;
      }, jsonData);
      if (Array.isArray(arrayData)) {
        if (fieldPath) {
          // Extract the field from all array items
          const values = arrayData.map((item, index) => {
            const value = fieldPath.split('.').reduce((acc, key) => (acc && typeof acc === 'object') ? acc[key] : undefined, item);
            return { value, item, index };
          }).filter(({ value }) => value !== undefined && value !== null && value !== '');
          if (extractionMode === 'latest' && values.length > 1) {
            const sortedValues = sortArrayItemsByDate(values, fieldPath);
            return sortedValues.length > 0 ? String(sortedValues[0].value) : undefined;
          }

          const finalValues = values.map(v => v.value);
          return finalValues.length > 0 ? finalValues.join(', ') : undefined;
        } else {
          if (extractionMode === 'latest' && arrayData.length > 1) {
            const sortedArray = sortArrayItemsByDate(arrayData.map((item, index) => ({ value: item, item, index })));
            return sortedArray.length > 0 ? sortedArray[0].value : arrayData;
          }
          return arrayData;
        }
      }
      return undefined;
    }

    return jsonPath.split('.').reduce((acc, key) => (acc && typeof acc === 'object') ? acc[key] : undefined, jsonData);
  }
  return path.split('.').reduce((acc, key) => (acc && typeof acc === 'object') ? acc[key] : undefined, data);
};

export const sortArrayItemsByDate = <T extends { value: any; item: any; index: number }>(items: T, fieldPath?: string): T => {
  const dateFields = ['end_date', 'start_date', 'date', 'created_at', 'updated_at'];
  return items.sort((a, b) => {
    const itemA = a.item;
    const itemB = b.item;
    for (const dateField of dateFields) {
      const dateA = itemA[dateField];
      const dateB = itemB[dateField];
      if (dateA && dateB) {
        try {
          const parsedDateA = new Date(dateA);
          const parsedDateB = new Date(dateB);
          if (!isNaN(parsedDateA.getTime()) && !isNaN(parsedDateB.getTime())) {
            return parsedDateB.getTime() - parsedDateA.getTime();
          }
        } catch (e) { }
      }
    }
    return a.index - b.index;
  });
};

export const updateJsonValue = (existingData: any, path: string, newValue: any): any => {
  if (!path) return { [path]: newValue };
  if (path.includes('->>') || path.includes('->')) {
    const parts = path.split(/(->>|->)/);
    const column = parts[0].trim().replace(/['"]/g, '');
    const jsonPath = parts[2].trim().replace(/['"]/g, '');
    const currentJsonData = existingData?.[column] || {};
    const pathParts = jsonPath.split('.');
    const updatedJsonData = { ...currentJsonData };
    let current = updatedJsonData;
    for (let i = 0; i < pathParts.length - 1; i++) {
      if (!current[pathParts[i]]) current[pathParts[i]] = {};
      current = current[pathParts[i]];
    }
    current[pathParts[pathParts.length - 1]] = newValue;
    return { [column]: updatedJsonData };
  }
  const pathParts = path.split('.');
  const result: any = { ...existingData };
  let current = result;
  for (let i = 0; i < pathParts.length - 1; i++) {
    if (!current[pathParts[i]]) current[pathParts[i]] = {};
    current = current[pathParts[i]];
  }
  current[pathParts[pathParts.length - 1]] = newValue;
  return result;
};

export const formatDateValue = (dateStr: string, format?: string) => {
  if (!dateStr || dateStr === 'Missing') return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;

  if (format === 'object_split') {
    return {
      day: date.getDate().toString(),
      month: date.toLocaleString('default', { month: 'short' }),
      year: date.getFullYear().toString()
    };
  }

  if (format === 'dd_mm_yyyy') {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
  }
  return date.toISOString().split('T')[0];
};

export const cleanFieldValue = (value: any): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    // Check for object string representation
    if (value === '[object Object]' || value.startsWith('[object ')) {
      return '';
    }
    // Return empty string for actual empty values, but "Missing" for invalid object strings
    if (value === '') return '';
    return value;
  }
  if (typeof value === 'object') {
    // Convert object to string representation, but avoid "[object Object]"
    try {
      const str = JSON.stringify(value);
      return str === '{}' ? '' : str;
    } catch {
      return '';
    }
  }
  return String(value);
};

export const isValidValue = (val: any): boolean => {
  if (val === null || val === undefined || val === '') return false;
  const errorStrings = [
    'Missing', 'Missing Config', 'No Source', 'Computing...',
    'Document Not Found', 'Field Not Found', 'Missing Document',
    'No Document Specified', 'Missing Task Data', '[object Object]'
  ];
  return !errorStrings.includes(String(val));
};

export const ETA_SCREENSHOT_DOCUMENT_ID = '630d0ece-4c94-417b-ae64-135187419699';

