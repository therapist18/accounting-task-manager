import { isValid, parse } from 'date-fns';

// Constants
export const DATE_FORMATS = [
  'dd/MM/yyyy HH:mm:ss',
  'dd/MM/yyyy',
  'yyyy-MM-dd',
  'dd-MM-yyyy',
  'MM/dd/yyyy',
  'yyyy/MM/dd'
] as const;

export const DATE_FIELDS = [
  'expiry', 'valid', 'date', 'until', 'effective',
  'expiration', 'expiry_date', 'valid_to', 'valid_until', 'up_to',
  'effective_date', 'effective_from', 'effective_to', 'with_effect_from'
] as const;

/**
 * Parse a date string in various formats
 * @param dateStr - Date string or Date object
 * @returns Parsed Date object or null if invalid
 */
export const parseDate = (dateStr: string | Date): Date | null => {
  if (!dateStr) return null;

  // If it's already a Date object
  if (dateStr instanceof Date) {
    return isValid(dateStr) ? dateStr : null;
  }

  // If it's already in dd/MM/yyyy format, parse it directly
  const dateRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const match = dateStr.match(dateRegex);

  if (match) {
    const [_, day, month, year] = match;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return isValid(date) ? date : null;
  }

  // Try other date formats
  for (const fmt of DATE_FORMATS) {
    const parsed = parse(dateStr, fmt, new Date());
    if (isValid(parsed)) {
      return parsed;
    }
  }

  // Last resort: try native Date parsing
  const parsed = new Date(dateStr);
  return isValid(parsed) ? parsed : null;
};

/**
 * Parse date in DD MMM YYYY format (e.g., "19 SEP 2025")
 * @param dateStr - Date string in DD MMM YYYY format
 * @returns Parsed Date object or null if invalid
 */
export const parseDateWithMonthName = (dateStr: string): Date | null => {
  if (!dateStr) return null;

  // Try DD/MM/YYYY format
  if (dateStr.includes('/')) {
    const [day, month, year] = dateStr.split('/');
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  // Try DD MMM YYYY format (e.g., "19 SEP 2025")
  const parts = dateStr.split(' ');
  if (parts.length === 3) {
    const day = parseInt(parts[0]);
    const monthStr = parts[1].toUpperCase();
    const year = parseInt(parts[2]);
    const months: Record<string, number> = {
      'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
      'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
    };
    const month = months[monthStr];
    if (month !== undefined) {
      return new Date(year, month, day);
    }
  }

  return null;
};

/**
 * Find all dates in an object based on field names
 * @param obj - Object to search for dates
 * @param dateFields - Array of field name patterns to match
 * @returns Array of parsed Date objects
 */
const findDatesInObject = (obj: any, dateFields: readonly string[]): Date[] => {
  if (!obj) return [];

  if (Array.isArray(obj)) {
    return obj.flatMap(item => findDatesInObject(item, dateFields));
  }

  if (typeof obj !== 'object') return [];

  return Object.entries(obj).reduce<Date[]>((dates, [key, value]) => {
    const isDateField = dateFields.some(field =>
      key.toLowerCase().includes(field.toLowerCase())
    );

    if (isDateField && value) {
      const parsedDate = typeof value === 'string' ? parseDate(value) : null;
      if (parsedDate) {
        dates.push(parsedDate);
      }
    }

    if (value && typeof value === 'object') {
      dates.push(...findDatesInObject(value, dateFields));
    }

    return dates;
  }, []);
};

export { findDatesInObject };
