export type EntityType = 'company' | 'principal' | 'director' | 'shareholder' | 'dependant' | 'employee' | 'understudy';

export const ENTITY_TYPES: { value: EntityType; label: string }[] = [
  { value: 'company', label: 'Company' }, 
  { value: 'principal', label: 'Principal' },
  { value: 'director', label: 'Director' }, 
  { value: 'shareholder', label: 'Shareholder' },
  { value: 'dependant', label: 'Dependant' }, 
  { value: 'employee', label: 'Employee' },
  { value: 'understudy', label: 'Understudy' },
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
