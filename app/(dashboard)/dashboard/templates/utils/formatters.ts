import { format, parse, isValid, isFuture, isToday } from 'date-fns';

export type EmployeeStatus = 'Active' | 'Inactive' | 'N/A';

// Date formatting utility
export const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return '';

  // Try parsing different date formats
  const possibleFormats = [
    'yyyy-MM-dd',
    'dd/MM/yyyy',
    'MM/dd/yyyy',
    'dd-MM-yyyy',
    'dd.MM.yyyy',
    'yyyy/MM/dd',
    'dd MMM yyyy',
    'MMM dd yyyy',
    'dd MMMM yyyy',
    'MMMM dd yyyy',
    'yyyy-MM-dd\'T\'HH:mm:ss.SSSX',
    'yyyy-MM-dd\'T\'HH:mm:ssX'
  ];

  for (const formatStr of possibleFormats) {
    try {
      const parsedDate = parse(dateString, formatStr, new Date());
      if (isValid(parsedDate)) {
        return format(parsedDate, 'dd-MM-yyyy');
      }
    } catch (e) {
      continue;
    }
  }

  // If all parsing attempts fail, try creating a date directly
  try {
    const directDate = new Date(dateString);
    if (isValid(directDate)) {
      return format(directDate, 'dd-MM-yyyy');
    }
  } catch (e) {
    console.error('Error parsing date:', e);
  }

  return '';
};

// Gender formatting utility
export const formatGender = (gender: string | null | undefined): string => {
  if (!gender) return '';

  const normalizedGender = gender.toString().toLowerCase().trim();

  // Map various gender formats to standardized format
  const genderMap: { [key: string]: string } = {
    'm': 'Male',
    'f': 'Female',
    'male': 'Male',
    'female': 'Female',
    'man': 'Male',
    'woman': 'Female',
    'm/male': 'Male',
    'f/female': 'Female',
    'masculino': 'Male',
    'feminino': 'Female',
    'homme': 'Male',
    'femme': 'Female',
  };

  return genderMap[normalizedGender] || gender;
};

// Format cell value based on field type
export const formatCellValue = (value: any, fieldName: string): string => {
  if (value === null || value === undefined) return 'No data';

  // Handle date fields
  if (fieldName.toLowerCase().includes('date')) {
    return formatDate(value);
  }

  // Handle gender fields
  if (fieldName.toLowerCase().includes('gender') || 
      fieldName.toLowerCase().includes('sex')) {
    return formatGender(value);
  }

  return String(value);
};

// Additional formatting utilities

export const formatDateNew = (date: Date | string | null): string => {
  if (!date) return '';
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return format(dateObj, 'dd MMM yyyy');
};

export const formatDateTimeNew = (date: Date | string | null): string => {
  if (!date) return '';
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return format(dateObj, 'dd MMM yyyy HH:mm');
};

export const formatCurrencyNew = (
  amount: number,
  currency: string = 'USD',
  locale: string = 'en-US'
): string => {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency
  }).format(amount);
};

export const formatPhoneNumberNew = (phoneNumber: string): string => {
  // Remove all non-numeric characters
  const cleaned = phoneNumber.replace(/\D/g, '');
  
  // Format based on length
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
  }
  
  return phoneNumber; // Return original if not standard format
};

export const formatFileSizeNew = (bytes: number): string => {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 Byte';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i)) + ' ' + sizes[i];
};

export const formatPercentageNew = (
  value: number,
  decimalPlaces: number = 1
): string => {
  return `${value.toFixed(decimalPlaces)}%`;
};

export const formatDurationNew = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
};

export const formatAddressNew = (
  address: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
  }
): string => {
  const parts = [
    address.street,
    address.city,
    address.state,
    address.postalCode,
    address.country
  ].filter(Boolean);
  
  return parts.join(', ');
};

export const formatNameNew = (
  firstName?: string,
  lastName?: string,
  title?: string
): string => {
  const parts = [
    title,
    firstName,
    lastName
  ].filter(Boolean);
  
  return parts.join(' ');
};

export const slugifyNew = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '');
};

// Status calculation utilities
export const parseDate = (dateStr: string | null | undefined): string | null => {
  if (!dateStr) return null;

  // Try parsing different date formats
  const possibleFormats = [
    'yyyy-MM-dd',
    'dd/MM/yyyy',
    'MM/dd/yyyy',
    'dd-MM-yyyy',
    'dd.MM.yyyy',
    'yyyy/MM/dd',
    'dd MMM yyyy',
    'MMM dd yyyy',
    'dd MMMM yyyy',
    'MMMM dd yyyy',
    'yyyy-MM-dd\'T\'HH:mm:ss.SSSX',
    'yyyy-MM-dd\'T\'HH:mm:ssX'
  ];

  for (const formatStr of possibleFormats) {
    try {
      const parsedDate = parse(dateStr, formatStr, new Date());
      if (isValid(parsedDate)) {
        return format(parsedDate, 'yyyy-MM-dd');
      }
    } catch (e) {
      continue;
    }
  }

  // If all parsing attempts fail, try creating a date directly
  try {
    const directDate = new Date(dateStr);
    if (isValid(directDate)) {
      return format(directDate, 'yyyy-MM-dd');
    }
  } catch (e) {
    console.error('Error parsing date:', e);
  }

  return null;
};

export const calculateStatus = (fromDate: string | null | undefined, toDate: string | null | undefined): EmployeeStatus => {
  const parsedFromDate = fromDate ? parseDate(fromDate) : null;
  const parsedToDate = toDate ? parseDate(toDate) : null;

  // If no dates are provided, return N/A
  if (!parsedFromDate) {
    return 'N/A';
  }

  // Create Date objects for comparison
  const startDate = new Date(parsedFromDate);
  const endDate = parsedToDate ? new Date(parsedToDate) : null;
  const today = new Date();

  // Set time to midnight for accurate date comparison
  startDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  if (endDate) {
    endDate.setHours(0, 0, 0, 0);
  }

  // Active if:
  // 1. Start date is today or in the past AND
  // 2. Either no end date OR end date is in the future
  if (
    (startDate <= today) &&
    (!endDate || endDate > today)
  ) {
    return 'Active';
  }

  // Inactive if:
  // 1. Start date is in the future OR
  // 2. End date is in the past
  if (
    startDate > today ||
    (endDate && endDate <= today)
  ) {
    return 'Inactive';
  }

  // Default case
  return 'N/A';
};
