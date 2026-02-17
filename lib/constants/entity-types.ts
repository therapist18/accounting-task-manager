export type EntityType = 'company' | 'principal' | 'director' | 'shareholder' | 'dependant' | 'employee' | 'understudy' | 'sponsor';

export const ENTITY_TYPES: { value: EntityType; label: string }[] = [
  { value: 'company', label: 'Company' }, 
  { value: 'principal', label: 'Principal' },
  { value: 'director', label: 'Director' }, 
  { value: 'shareholder', label: 'Shareholder' },
  { value: 'dependant', label: 'Dependant' }, 
  { value: 'employee', label: 'Employee' },
  { value: 'understudy', label: 'Understudy' },
  { value: 'sponsor', label: 'Sponsor' }
];

export const DEPENDANT_RELATIONSHIPS = [
  { value: 'father', label: 'Father' },
  { value: 'mother', label: 'Mother' },
  { value: 'daughter', label: 'Daughter' },
  { value: 'son', label: 'Son' },
  { value: 'husband', label: 'Husband' },
  { value: 'wife', label: 'Wife' },
  { value: 'mother_in_law', label: 'Mother-in-law' },
  { value: 'father_in_law', label: 'Father-in-law' },
];

export type NationalityType = 'kenyan' | 'foreigner';

export const NATIONALITY_TYPES: { value: NationalityType; label: string }[] = [
  { value: 'kenyan', label: 'Kenyan' },
  { value: 'foreigner', label: 'Foreigner' },
];

export type QualificationType = 'none' | 'primary' | 'secondary' | 'diploma' | 'bachelor' | 'master' | 'phd' | 'professional';

export const QUALIFICATION_TYPES: { value: QualificationType; label: string }[] = [
  { value: 'none', label: 'No Qualification' },
  { value: 'primary', label: 'Primary Education' },
  { value: 'secondary', label: 'Secondary Education' },
  { value: 'diploma', label: 'Diploma/Certificate' },
  { value: 'bachelor', label: 'Bachelor Degree' },
  { value: 'master', label: 'Master Degree' },
  { value: 'phd', label: 'PhD/Doctorate' },
  { value: 'professional', label: 'Professional Certification' },
];

export type AgeRangeType = 'any' | 'minor' | 'adult';

export const AGE_RANGE_TYPES: { value: AgeRangeType; label: string }[] = [
  { value: 'any', label: 'Any Age' },
  { value: 'minor', label: 'Minor (Under 18)' },
  { value: 'adult', label: 'Adult (18+)' },
];

export type RequirementCategory = 'general' | 'processing' | 'issuance' | 'job-specific';

export const REQUIREMENT_CATEGORIES: { value: RequirementCategory; label: string; description?: string }[] = [
  { value: 'general', label: 'General', description: 'General document requirements' },
  { value: 'processing', label: 'Processing', description: 'Documents needed for processing' },
  { value: 'issuance', label: 'Issuance', description: 'Documents for issuance purposes' },
  { value: 'job-specific', label: 'Job Specific', description: 'Job-specific document requirements' }
];
