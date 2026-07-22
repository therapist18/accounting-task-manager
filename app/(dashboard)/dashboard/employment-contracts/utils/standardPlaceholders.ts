import type { ContractEmployeeInfo } from './data';
import type { Company } from '../../companies/database';
import type { EmploymentOffer } from './employmentOfferData';

// The old whole-document flow resolved {{tokens}} against a per-template
// Placeholder[] definition array (entity_type/master_field_ids/...) via the
// tasks-requirements master-field engine - built for templates whose fields
// varied per document. Clauses in the new engine only ever reference this
// fixed, well-known set of identity tokens, so a direct field mapping
// replaces that machinery entirely for this module; effectiveSettings
// (working_hours, notice_period, benefits, ...) is merged separately by
// clauseEngine.assembleContractHtml.
export function buildStandardPlaceholderValues(
  employee: ContractEmployeeInfo,
  company: Company | null | undefined,
  offer: EmploymentOffer | null | undefined
): Record<string, string> {
  const contactEmail = company?.contact_details?.email || '';

  return {
    employee_name: employee.fullName,
    employee_first_name: employee.firstName,
    employee_last_name: employee.lastName,
    employee_number: employee.employeeNumber,
    national_id: employee.nationalId,
    kra_pin: employee.kraPin,
    nssf_number: employee.nssfNumber,
    shif_number: employee.shifNumber,
    nhif_number: employee.nhifNumber,
    department: employee.department,
    job_title: employee.jobTitle,
    employment_type: employee.employmentType,
    work_arrangement: employee.workArrangement,
    bank_name: employee.bankName,
    bank_branch: employee.bankBranch,
    bank_account: employee.bankAccount,
    contact_email: employee.contactEmail,
    contact_phone: employee.contactPhone,

    company_name: company?.company_name || '',
    company_address: '', // no address field on acc_portal_company_duplicate today
    company_kra_pin: company?.kra_pin || '',
    company_email: company?.kra_email_address || contactEmail,
    company_registration_number: company?.registration_number || '',

    basic_salary: offer?.basic_salary != null ? String(offer.basic_salary) : String(employee.basicSalary || ''),
    currency: offer?.currency || 'KES',
    start_date: offer?.start_date || employee.startDate || '',
    end_date: offer?.end_date || '',
  };
}
