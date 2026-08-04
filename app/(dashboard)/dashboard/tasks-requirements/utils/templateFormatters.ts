/**
 * Format functions for template placeholder values
 * Handles case transformations and other formatting
 */

export const formatFunctions = new Set([
  'upper', 'lower', 'capital', 'capitalize', 'title', 'sentence', 'camel', 'snake', 'kebab',
  'date', 'time', 'datetime', 'currency', 'number', 'int', 'float', 'round',
  'prettify', 'escape', 'unescape', 'html', 'raw', 'json', 'parse', 'stringify'
]);

/**
 * Apply format function to a value based on format suffix
 * @param value - The value to format
 * @param format - The format function name (e.g., 'upper', 'capital')
 * @returns Formatted value
 */
export function applyFormat(value: any, format: string): string {
  if (value === null || value === undefined) return '';
  const strValue = String(value);

  switch (format) {
    case 'upper':
      return strValue.toUpperCase();
    
    case 'lower':
      return strValue.toLowerCase();
    
    case 'capital':
      // Capitalize first letter of each word
      return strValue.replace(/\b\w/g, char => char.toUpperCase());
    
    case 'capitalize':
      // Capitalize only first letter, lowercase the rest
      return strValue.charAt(0).toUpperCase() + strValue.slice(1).toLowerCase();

    case 'sentence':
      // Capitalize only first letter, leave the rest exactly as-is (unlike
      // 'capitalize', which also lowercases the rest) - for values that are
      // already correctly cased apart from their leading letter
      return strValue.charAt(0).toUpperCase() + strValue.slice(1);

    case 'title':
      // Title case (each word capitalized)
      return strValue.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    
    case 'camel':
      // camelCase
      return strValue
        .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
          return index === 0 ? word.toLowerCase() : word.toUpperCase();
        })
        .replace(/\s+/g, '');
    
    case 'snake':
      // snake_case
      return strValue
        .replace(/\s+/g, '_')
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase();
    
    case 'kebab':
      // kebab-case
      return strValue
        .replace(/\s+/g, '-')
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase();
    
    case 'prettify':
      // Pretty print JSON
      try {
        return JSON.stringify(JSON.parse(strValue), null, 2);
      } catch {
        return strValue;
      }
    
    case 'escape':
      // HTML escape
      return strValue
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    
    case 'unescape':
      // HTML unescape
      return strValue
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'");
    
    case 'json':
      try {
        return JSON.stringify(JSON.parse(strValue));
      } catch {
        return strValue;
      }
    
    case 'parse':
      try {
        return JSON.parse(strValue);
      } catch {
        return strValue;
      }
    
    case 'stringify':
      return JSON.stringify(strValue);
    
    case 'number':
      const num = parseFloat(strValue);
      return isNaN(num) ? strValue : String(num);
    
    case 'int':
      const intVal = parseInt(strValue, 10);
      return isNaN(intVal) ? strValue : String(intVal);
    
    case 'float':
      const floatVal = parseFloat(strValue);
      return isNaN(floatVal) ? strValue : String(floatVal);
    
    case 'round':
      const roundVal = Math.round(parseFloat(strValue));
      return isNaN(roundVal) ? strValue : String(roundVal);
    
    case 'currency':
      const currencyVal = parseFloat(strValue);
      if (isNaN(currencyVal)) return strValue;
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(currencyVal);
    
    case 'date':
      try {
        const date = new Date(strValue);
        if (isNaN(date.getTime())) return strValue;
        return date.toLocaleDateString('en-US');
      } catch {
        return strValue;
      }
    
    case 'time':
      try {
        const date = new Date(strValue);
        if (isNaN(date.getTime())) return strValue;
        return date.toLocaleTimeString('en-US');
      } catch {
        return strValue;
      }
    
    case 'datetime':
      try {
        const date = new Date(strValue);
        if (isNaN(date.getTime())) return strValue;
        return date.toLocaleString('en-US');
      } catch {
        return strValue;
      }
    
    default:
      return strValue;
  }
}

/**
 * Parse format suffix from placeholder tag
 * @param tag - The placeholder tag (e.g., "{{field_name/upper}}")
 * @returns Object with field name and format
 */
export function parseFormatSuffix(tag: string): { fieldName: string; format?: string } {
  const match = tag.match(/\{\{\s*([a-zA-Z0-9_]+)\s*(?:\/([a-zA-Z0-9_]+))?\s*\}\}/);
  if (!match) return { fieldName: tag };
  
  return {
    fieldName: match[1],
    format: match[2]
  };
}

/**
 * Replace placeholders in template with formatted values
 * @param template - The template string with placeholders
 * @param values - Object mapping field names to values
 * @param formats - Optional object mapping field names to format functions
 * @returns Template with placeholders replaced
 */
export function replacePlaceholders(
  template: string,
  values: Record<string, any>,
  formats?: Record<string, string>
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*(?:\/([a-zA-Z0-9_]+))?\s*\}\}/g, (match, fieldName, formatSuffix) => {
    const value = values[fieldName];
    const format = formatSuffix || formats?.[fieldName];
    
    if (value === null || value === undefined) return '';
    
    if (format && formatFunctions.has(format)) {
      return applyFormat(value, format);
    }
    
    return String(value);
  });
}
