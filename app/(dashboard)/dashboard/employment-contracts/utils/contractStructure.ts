// The standard employment contract structure - these 17 sections always exist,
// in this order, regardless of employment type, industry, or company. Only the
// clause selected within each section changes (see clauseEngine.ts). Fixed as
// a code constant rather than DB-editable, since the structure itself doesn't
// vary - only its content does.
export type ContractSectionKey =
  | 'heading'
  | 'parties'
  | 'appointment'
  | 'place_of_work'
  | 'duties'
  | 'working_hours'
  | 'remuneration'
  | 'benefits'
  | 'statutory_deductions'
  | 'leave'
  | 'employee_obligations'
  | 'performance'
  | 'termination'
  | 'general_provisions'
  | 'acceptance'
  | 'signatures'
  | 'appendix_job_description';

export interface ContractSectionDef {
  key: ContractSectionKey;
  title: string;
  order: number;
}

export const CONTRACT_SECTIONS: ContractSectionDef[] = [
  { key: 'heading', title: 'Contract Heading', order: 1 },
  { key: 'parties', title: 'Parties', order: 2 },
  { key: 'appointment', title: 'Appointment', order: 3 },
  { key: 'place_of_work', title: 'Place of Work', order: 4 },
  { key: 'duties', title: 'Duties and Responsibilities', order: 5 },
  { key: 'working_hours', title: 'Working Hours', order: 6 },
  { key: 'remuneration', title: 'Remuneration', order: 7 },
  { key: 'benefits', title: 'Benefits', order: 8 },
  { key: 'statutory_deductions', title: 'Statutory Deductions', order: 9 },
  { key: 'leave', title: 'Leave Entitlements', order: 10 },
  { key: 'employee_obligations', title: 'Employee Obligations', order: 11 },
  { key: 'performance', title: 'Performance Expectations', order: 12 },
  { key: 'termination', title: 'Termination', order: 13 },
  { key: 'general_provisions', title: 'General Provisions', order: 14 },
  { key: 'acceptance', title: 'Acceptance', order: 15 },
  { key: 'signatures', title: 'Signatures', order: 16 },
  { key: 'appendix_job_description', title: 'Appendix A – Detailed Job Description', order: 17 },
];

export const CONTRACT_SECTION_KEYS: ContractSectionKey[] = CONTRACT_SECTIONS.map((s) => s.key);

export function getSectionDef(key: string): ContractSectionDef | undefined {
  return CONTRACT_SECTIONS.find((s) => s.key === key);
}

// Default section list for a Contract Template that doesn't customize it.
export function defaultSectionKeys(): ContractSectionKey[] {
  return [...CONTRACT_SECTION_KEYS];
}
