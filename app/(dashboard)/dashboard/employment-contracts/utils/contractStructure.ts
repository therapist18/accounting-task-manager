// The standard employment contract structure - these sections always exist,
// in this order, regardless of employment type, industry, or company. Only the
// clause selected within each section changes (see clauseEngine.ts). Fixed as
// a code constant rather than DB-editable, since the structure itself doesn't
// vary - only its content does.
//
// Company Policies and Equipment Issued are deliberately NOT modeled as
// contract appendices: policies can run to dozens of pages across many
// policy documents (rendering them all would balloon an 8-page contract),
// and equipment handover is an operational record (subject to change any
// time equipment is reissued) rather than a term of employment. Both are
// referenced from within the contract body via a generic compliance clause
// (see the employee_obligations/general_provisions clause content) and
// handled as separate documents/records outside the contract engine.
// Appendix A (Job Description) is the one appendix kept, since it draws
// directly from the Job Profile module's own structured fields.
export type ContractSectionKey =
  | 'heading'
  | 'parties'
  | 'appointment'
  | 'place_of_work'
  | 'duties'
  | 'working_hours'
  | 'salary_statutory_deductions'
  | 'benefits'
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
  { key: 'salary_statutory_deductions', title: 'Salary and Statutory Deductions', order: 7 },
  { key: 'benefits', title: 'Benefits', order: 8 },
  { key: 'leave', title: 'Leave Entitlements', order: 9 },
  { key: 'employee_obligations', title: 'Employee Obligations', order: 10 },
  { key: 'performance', title: 'Performance Expectations', order: 11 },
  { key: 'termination', title: 'Termination', order: 12 },
  { key: 'general_provisions', title: 'General Provisions', order: 13 },
  { key: 'acceptance', title: 'Acceptance', order: 14 },
  { key: 'signatures', title: 'Signatures', order: 15 },
  { key: 'appendix_job_description', title: 'Appendix A – Detailed Job Description', order: 16 },
];

export const CONTRACT_SECTION_KEYS: ContractSectionKey[] = CONTRACT_SECTIONS.map((s) => s.key);

export function getSectionDef(key: string): ContractSectionDef | undefined {
  return CONTRACT_SECTIONS.find((s) => s.key === key);
}

// Default section list for a Contract Template that doesn't customize it.
export function defaultSectionKeys(): ContractSectionKey[] {
  return [...CONTRACT_SECTION_KEYS];
}
