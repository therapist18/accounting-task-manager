export type EntityType = 
  | 'company' 
  | 'principal' 
  | 'director' 
  | 'shareholder' 
  | 'dependant' 
  | 'employee' 
  | 'understudy' 
  | 'sponsor' 
  | 'hr' 
  | 'accountant' 
  | 'witness' 
  | 'authorising_signatory' 
  | 'service_provider' 
  | 'regulatory_official' 
  | 'advisor' 
  | 'consultant' 
  | 'representative' 
  | 'business_owner' 
  | 'manager' 
  | 'executive' 
  | 'partner' 
  | 'supervisor' 
  | 'lead' 
  | 'coordinator'
  | 'specialist'
  | 'individual';

export type EntityTypeConfig = {
  value: EntityType;
  label: string;
  description: string;
  isUserSelectable: boolean;
  isCandidate: boolean;
  synonyms: string[];
  roles: string[];
  category: 'executive' | 'ownership' | 'employment' | 'finance' | 'family' | 'external' | 'ambiguous';
};

export const ENTITY_TYPES: EntityTypeConfig[] = [
  { value: 'company', label: 'Company', description: 'The organization/company entity', isUserSelectable: false, isCandidate: false, synonyms: ['organization', 'entity'], roles: ['principal'], category: 'external' },
  { value: 'principal', label: 'Principal', description: 'The main owner/operator of the entity', isUserSelectable: false, isCandidate: false, synonyms: ['owner', 'operator'], roles: ['director', 'shareholder'], category: 'executive' },
  { value: 'director', label: 'Director', description: 'Key management personnel with decision-making authority', isUserSelectable: true, isCandidate: true, synonyms: ['executive', 'management'], roles: ['signatory', 'authorising_signatory'], category: 'executive' },
  { value: 'shareholder', label: 'Shareholder', description: 'Owner(s) of company shares/stocks', isUserSelectable: true, isCandidate: true, synonyms: ['owner', 'equity_holder'], roles: ['signatory', 'authorising_signatory'], category: 'ownership' },
  { value: 'dependant', label: 'Dependant', description: 'Family member or dependent of the entity', isUserSelectable: false, isCandidate: false, synonyms: ['family_member', 'relative'], roles: [], category: 'family' },
  { value: 'employee', label: 'Employee', description: 'Staff member of the organization', isUserSelectable: true, isCandidate: true, synonyms: ['staff', 'worker', 'associate'], roles: ['service_provider'], category: 'employment' },
  { value: 'understudy', label: 'Understudy', description: 'Person undergoing training or preparation for a role', isUserSelectable: true, isCandidate: true, synonyms: ['trainee', 'apprentice', 'intern'], roles: [], category: 'employment' },
  { value: 'sponsor', label: 'Sponsor', description: 'Sponsor or supporter of the entity', isUserSelectable: false, isCandidate: false, synonyms: ['supporter', 'patron'], roles: [], category: 'external' },
  { value: 'hr', label: 'HR', description: 'Human Resources personnel', isUserSelectable: true, isCandidate: true, synonyms: ['human_resources'], roles: ['representative'], category: 'executive' },
  { value: 'accountant', label: 'Accountant', description: 'Financial officer or accountant', isUserSelectable: true, isCandidate: true, synonyms: ['financial_officer', 'bookkeeper'], roles: ['service_provider'], category: 'finance' },
  { value: 'witness', label: 'Witness', description: 'Independent witness to document signing', isUserSelectable: true, isCandidate: true, synonyms: ['notary', 'attorney'], roles: ['witness'], category: 'external' },
  { value: 'authorising_signatory', label: 'Authorising Signatory', description: 'Person authorised to sign on behalf of entity', isUserSelectable: true, isCandidate: true, synonyms: ['authorised_signer', 'authorised_party'], roles: ['signatory', 'authorising_signatory'], category: 'ambiguous' },
  { value: 'service_provider', label: 'Service Provider', description: 'Third-party service provider executing work', isUserSelectable: true, isCandidate: true, synonyms: ['contractor', 'vendor'], roles: [], category: 'employment' },
  { value: 'regulatory_official', label: 'Regulatory Official', description: 'Government or regulatory authority representative', isUserSelectable: false, isCandidate: false, synonyms: ['government_official', 'authority'], roles: [], category: 'external' },
  { value: 'advisor', label: 'Advisor', description: 'Business advisor or consultant', isUserSelectable: true, isCandidate: true, synonyms: ['consultant', 'mentor'], roles: ['representative', 'advisor'], category: 'employment' },
  { value: 'consultant', label: 'Consultant', description: 'Professional service provider', isUserSelectable: true, isCandidate: true, synonyms: ['advisor', 'specialist'], roles: [], category: 'employment' },
  { value: 'representative', label: 'Representative', description: 'Official or authorized representative', isUserSelectable: true, isCandidate: true, synonyms: ['agent', 'delegate'], roles: ['service_provider', 'representative'], category: 'ambiguous' },
  { value: 'business_owner', label: 'Business Owner', description: 'Business owner or proprietor', isUserSelectable: true, isCandidate: true, synonyms: ['proprietor'], roles: ['principal'], category: 'ownership' },
  { value: 'manager', label: 'Manager', description: 'Department or team manager', isUserSelectable: true, isCandidate: true, synonyms: ['supervisor', 'foreman'], roles: ['representative'], category: 'executive' },
  { value: 'executive', label: 'Executive', description: 'Senior executive or C-level officer', isUserSelectable: true, isCandidate: true, synonyms: ['c_level', 'senior_executive'], roles: ['signatory', 'authorising_signatory'], category: 'executive' },
  { value: 'partner', label: 'Partner', description: 'Business partner or partnership member', isUserSelectable: true, isCandidate: true, synonyms: ['partner'], roles: ['principal'], category: 'ownership' },
  { value: 'supervisor', label: 'Supervisor', description: 'Immediate team supervisor', isUserSelectable: true, isCandidate: true, synonyms: ['foreman'], roles: [], category: 'employment' },
  { value: 'lead', label: 'Lead', description: 'Team lead or technical lead', isUserSelectable: true, isCandidate: true, synonyms: ['tech_lead'], roles: [], category: 'employment' },
  { value: 'coordinator', label: 'Coordinator', description: 'Program or project coordinator', isUserSelectable: true, isCandidate: true, synonyms: ['coordination'], roles: [], category: 'employment' },
  { value: 'specialist', label: 'Specialist', description: 'Technical or domain specialist', isUserSelectable: true, isCandidate: true, synonyms: [], roles: ['service_provider'], category: 'employment' },
  { value: 'individual', label: 'Individual', description: 'A standalone person not tied to a company role (e.g. Matrimonial Biodata)', isUserSelectable: false, isCandidate: false, synonyms: ['person'], roles: [], category: 'external' }
];

export const ENTITY_TYPE_CATEGORIES = {
  executive: ['director', 'principal', 'hr', 'manager', 'executive'],
  ownership: ['director', 'shareholder', 'principal', 'business_owner', 'partner'],
  employment: ['employee', 'hr', 'understudy', 'advisor', 'consultant', 'specialist', 'coordinator', 'lead', 'supervisor', 'service_provider'],
  finance: ['accountant'],
  family: ['dependant'],
  external: ['sponsor', 'witness', 'regulatory_official', 'authorising_signatory', 'representative'],
  ambiguous: ['authorising_signatory', 'representative']
} as const;

export const getEntityTypeConfig = (type: EntityType): EntityTypeConfig | undefined => {
  return ENTITY_TYPES.find((et: EntityTypeConfig) => et.value === type);
};

export const getEntityTypeCategory = (type: EntityType): keyof typeof ENTITY_TYPE_CATEGORIES | null => {
  const config = getEntityTypeConfig(type);
  if (!config) return null;
  return config.category;
};

export const getEntityTypeDisplayName = (type: EntityType, context?: 'persona' | 'entity' | 'official' | 'person'): string => {
  const config = getEntityTypeConfig(type);
  if (!config) return type.charAt(0).toUpperCase() + type.slice(1);

  switch (context) {
    case 'persona':
      return type === 'principal' ? 'The Principal' : 
             type === 'director' ? 'A Director' :
             type === 'shareholder' ? 'A Shareholder' :
             type === 'employee' ? 'An Employee' :
             type === 'hr' ? 'An HR Person' :
             type === 'accountant' ? 'An Accountant' :
             type === 'understudy' ? 'An Understudy' :
             type === 'witness' ? 'A Witness' :
             type === 'authorising_signatory' ? 'An Authorising Signatory' :
             type === 'service_provider' ? 'A Service Provider' :
             type === 'advisor' ? 'An Advisor' :
             type === 'consultant' ? 'A Consultant' :
             type === 'representative' ? 'A Representative' :
             type === 'business_owner' ? 'A Business Owner' :
             type === 'manager' ? 'A Manager' :
             type === 'executive' ? 'An Executive' :
             type === 'partner' ? 'A Partner' :
             type === 'supervisor' ? 'A Supervisor' :
             type === 'lead' ? 'A Lead' :
             type === 'coordinator' ? 'A Coordinator' :
             type === 'specialist' ? 'A Specialist' :
             type.charAt(0).toUpperCase() + type.slice(1);
    case 'entity':
      return type === 'company' ? 'The Company' :
             type === 'principal' ? 'The Principal' :
             type.charAt(0).toUpperCase() + type.slice(1);
    case 'official':
      return type === 'director' ? 'Company Director' :
             type === 'shareholder' ? 'Shareholding Member' :
             type === 'hr' ? 'HR Official' :
             type === 'accountant' ? 'Accounting Officer' :
             type === 'employee' ? 'Employee' :
             type.charAt(0).toUpperCase() + type.slice(1);
    case 'person':
      return type === 'dependant' ? 'Person' :
             type === 'principal' ? 'The Principal' :
             type.charAt(0).toUpperCase() + type.slice(1);
    default:
      return config.label;
  }
};

export const getEntityTypeDescription = (type: EntityType, style: 'full' | 'brief' | 'context'): string => {
  const config = getEntityTypeConfig(type);
  if (!config) return '';

  switch (style) {
    case 'full': return config.description;
    case 'brief': 
      switch (type) {
        case 'principal': return 'Entity owner/operator';
        case 'director': return 'Company director';
        case 'shareholder': return 'Shareholder';
        case 'employee': return 'Staff member';
        case 'hr': return 'HR personnel';
        case 'accountant': return 'Financial officer';
        case 'understudy': return 'Trainee role';
        case 'witness': return 'Document witness';
        case 'authorising_signatory': return 'Authorised signatory';
        case 'service_provider': return 'Third-party service provider';
        case 'advisor': return 'Business advisor';
        case 'consultant': return 'Professional consultant';
        case 'representative': return 'Authorized representative';
        case 'business_owner': return 'Business owner';
        case 'manager': return 'Department manager';
        case 'executive': return 'Senior executive';
        case 'partner': return 'Business partner';
        case 'supervisor': return 'Team supervisor';
        case 'lead': return 'Team lead';
        case 'coordinator': return 'Project coordinator';
        case 'specialist': return 'Technical specialist';
        case 'company': return 'The organization';
        case 'sponsor': return 'External supporter';
        case 'dependant': return 'Family dependent';
        case 'regulatory_official': return 'Regulatory authority';
        default: return '';
      }
    case 'context':
      return type === 'principal' ? 'Primary decision-maker' :
             type === 'director' ? 'Management signatory' :
             type === 'shareholder' ? 'Owner representative' :
             type === 'employee' ? 'Staff representative' :
             type === 'hr' ? 'HR representative' :
             type === 'accountant' ? 'Financial representative' :
             type === 'understudy' ? 'Role preparation' :
             type === 'witness' ? 'Document witness' :
             type === 'authorising_signatory' ? 'Signing authority' :
             type === 'service_provider' ? 'Service provider' :
             type === 'advisor' ? 'Business advisor' :
             type === 'consultant' ? 'Professional advisor' :
             type === 'representative' ? 'Official representative' :
             type === 'business_owner' ? 'Entity owner' :
             type === 'manager' ? 'Department head' :
             type === 'executive' ? 'Senior executive' :
             type === 'partner' ? 'Partnership member' :
             type === 'supervisor' ? 'Team lead' :
             type === 'lead' ? 'Technical lead' :
             type === 'coordinator' ? 'Project coordinator' :
             type === 'specialist' ? 'Domain expert' :
             type.charAt(0).toUpperCase() + type.slice(1);
    default: return '';
  }
};

export const getEntityTypeDisplayPersona = (type: EntityType): string => {
  const entityDisplayName = getEntityTypeDisplayName(type, 'persona');
  const description = getEntityTypeDescription(type, 'context');
  return `${entityDisplayName} (${description})`;
};

export const getEntityTypeDisplayOfficial = (type: EntityType): string => {
  const entityDisplayName = getEntityTypeDisplayName(type, 'official');
  const description = getEntityTypeDescription(type, 'full');
  return `${entityDisplayName}: ${description}`;
};

export const getUserSelectableEntityTypes = (): EntityTypeConfig[] => {
  return ENTITY_TYPES.filter((et: EntityTypeConfig) => et.isUserSelectable && et.isCandidate);
};

export const getEntityTypeByValue = (type: string): EntityType | null => {
  const normalized = type.toLowerCase().trim();
  return ENTITY_TYPES.find((et: EntityTypeConfig) => 
    et.value === normalized || et.synonyms.includes(normalized)
  )?.value || null;
};

export const getEntityTypesByRole = (role: string): EntityType[] => {
  const normalizedRole = role.toLowerCase().trim();
  return ENTITY_TYPES
    .filter((et: EntityTypeConfig) => 
      et.roles.some(r => r.toLowerCase() === normalizedRole) || 
      et.roles.some(r => normalizedRole.includes(r))
    )
    .map((et: EntityTypeConfig) => et.value);
};

export const getEntityTypesByCategory = (category: keyof typeof ENTITY_TYPE_CATEGORIES): EntityType[] => {
  return ENTITY_TYPES
    .filter((et: EntityTypeConfig) => et.category === category)
    .map((et: EntityTypeConfig) => et.value);
};

export const isExecutiveRole = (type: EntityType): boolean => {
  return ['director', 'principal', 'hr', 'manager', 'executive'].includes(type);
};

export const isOwnershipRole = (type: EntityType): boolean => {
  return ['director', 'shareholder', 'principal', 'business_owner', 'partner'].includes(type);
};

export const isEmploymentRole = (type: EntityType): boolean => {
  return ['employee', 'hr', 'understudy', 'advisor', 'consultant', 'specialist', 'coordinator', 'lead', 'supervisor', 'service_provider'].includes(type);
};

export const isExternalRole = (type: EntityType): boolean => {
  return ['sponsor', 'witness', 'authorising_signatory', 'regulatory_official', 'representative'].includes(type);
};

export const isOfficialRole = (type: EntityType): boolean => {
  return ['director', 'shareholder', 'hr', 'accountant', 'manager', 'executive', 'partner', 'representative', 'authorising_signatory'].includes(type);
};

export const isAmbiguousRole = (type: EntityType): boolean => {
  return ['authorising_signatory', 'representative'].includes(type);
};

export const getEntityTypeSynonyms = (type: EntityType): string[] => {
  const config = getEntityTypeConfig(type);
  return config?.synonyms || [];
};

export const getEntityTypeRoles = (type: EntityType): string[] => {
  const config = getEntityTypeConfig(type);
  return config?.roles || [];
};

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

export type RequirementCategory = 'general' | 'processing' | 'issuance' | 'job-specific' | 'reference' | 'report-docs';

export const REQUIREMENT_CATEGORIES: { value: RequirementCategory; label: string; description?: string }[] = [
  { value: 'general', label: 'General', description: 'General document requirements' },
  { value: 'processing', label: 'Processing', description: 'Documents needed for processing' },
  { value: 'issuance', label: 'Issuance', description: 'Documents for issuance purposes' },
  { value: 'job-specific', label: 'Job Specific', description: 'Job-specific document requirements' },
  { value: 'reference', label: 'Reference', description: 'Mandatory reference documents (e.g., TCCs, tax compliance)' },
  { value: 'report-docs', label: 'Report Doc Default', description: 'Documents shown by default in reports' }
];

export type DirectorType = 'all' | 'primary';

export const DIRECTOR_TYPES: { value: DirectorType; label: string }[] = [
  { value: 'all', label: 'All Directors' },
  { value: 'primary', label: 'Primary Director Only' }
];
