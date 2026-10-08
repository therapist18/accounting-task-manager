import supabase from '@/lib/supabase/client';
import type { ContractEmployeeInfo } from './data';
import type { EmploymentOffer } from './employmentOfferData';

// One-off counterparty for the Employment Contracts workspace: someone who
// needs a contract or letter but has no registry_employees row - and may not
// be in registry_individuals at all yet ("they aren't part of our system").
//
// The workspace edits the same ContractEmployeeInfo-shaped fields either way
// (see buildGuestEmployee below - the same stand-in trick the Job Profiles
// page's sampleEmployee uses); the draft only becomes a real
// registry_individuals row when the user hits "Save person to registry",
// which is what unlocks filing the finished document (Generate) against
// their record and master-field/letter resolution for them.
export interface GuestPersonDraft {
  // Set once saved to the registry; null while the person is still a draft.
  individualId: number | null;
  fullName: string;
  nationalId: string;
  kraPin: string;
  nssfNumber: string;
  shifNumber: string;
  contactEmail: string;
  contactPhone: string;
  jobTitle: string;
  department: string;
  startDate: string;
}

export const EMPTY_GUEST_DRAFT: GuestPersonDraft = {
  individualId: null,
  fullName: '',
  nationalId: '',
  kraPin: '',
  nssfNumber: '',
  shifNumber: '',
  contactEmail: '',
  contactPhone: '',
  jobTitle: '',
  department: '',
  startDate: '',
};

// Marker written into registry_individuals.employment_data on save (see
// insertGuestIndividual). data.ts reads it back to surface these people under
// their issuing company in the sidebar - registry_individuals has no
// registry_employees row to group them by, and none should be created (they
// aren't employees of that company as far as the registry is concerned).
// The role detail lives here too: registry_individuals has no job title /
// department / start date columns, so without the marker those facts would be
// lost on reopen.
export interface GuestPersonMarker {
  company_id: string | number;
  created_at?: string;
  job_title?: string;
  department?: string;
  start_date?: string;
}

// employment_data may come back as an object (jsonb) or a string (text) -
// same defensive read data.ts already does for contact_details.
export function readGuestMarker(employmentData: any): GuestPersonMarker | null {
  let data = employmentData;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  const marker = data?.external_contract_person;
  if (!marker || typeof marker !== 'object' || marker.company_id == null) return null;
  return marker as GuestPersonMarker;
}

// The stand-in employee record the whole pipeline (editor, preview,
// placeholder resolution, letters) reads - same shape a registry employee
// maps to. individualId stays 0 until the person is saved to the registry;
// nothing may file a document against id 0 (see ContractPreview's
// isUnsavedGuest guard).
export function buildGuestEmployee(
  draft: GuestPersonDraft,
  companyId: string | number
): ContractEmployeeInfo {
  const fullName = draft.fullName.trim();
  const nameParts = fullName ? fullName.split(/\s+/) : [];
  const firstName = nameParts[0] || '';
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

  return {
    id: `guest-${companyId}-${draft.individualId ?? 'new'}`,
    individualId: draft.individualId ?? 0,
    // The selected company's own id, uncoerced - ContractPreview derives its
    // companyId from this field for signatory/company settings/master-field
    // resolution, and Number() would zero out a non-numeric id.
    companyId: companyId,
    fullName: fullName || 'Unnamed Person',
    firstName,
    lastName,
    // No payroll number for an external person - the editor header shows the
    // "External person" label instead of EMP-xxx for these rows.
    employeeNumber: '',
    kraPin: draft.kraPin.trim(),
    nationalId: draft.nationalId.trim(),
    nssfNumber: draft.nssfNumber.trim(),
    nhifNumber: '',
    shifNumber: draft.shifNumber.trim(),
    department: draft.department.trim(),
    jobTitle: draft.jobTitle.trim(),
    employmentType: '',
    employmentStatus: 'External',
    jobLevel: '',
    reportsTo: '',
    workLocation: '',
    workArrangement: '',
    status: 'Active',
    // Salary lives on the offer for guests (typed into the Compensation
    // card), not on a payroll assignment.
    basicSalary: 0,
    grossSalary: 0,
    bankName: '',
    bankBranch: '',
    bankAccount: '',
    contactEmail: draft.contactEmail.trim(),
    contactPhone: draft.contactPhone.trim(),
    startDate: draft.startDate,
    isGuest: true,
  };
}

// Draft offer for a guest - same shape loadData builds for a registry
// employee, minus any payroll-derived figures. individual_id is the saved
// registry id, or 0 while unsaved (ContractPreview refuses to Generate until
// it's real, since ec_employment_offers.individual_id and
// acc_portal_directors_documents.director_id both need a real person).
export function makeGuestDraftOffer(
  draft: GuestPersonDraft,
  companyId: string | number,
  jobProfileId?: string
): Partial<EmploymentOffer> {
  return {
    job_profile_id: jobProfileId,
    company_id: String(companyId),
    individual_id: draft.individualId ?? 0,
    basic_salary: null,
    currency: 'KES',
    allowances: [],
    start_date: draft.startDate || new Date().toISOString().split('T')[0],
    end_date: null,
    settings_overrides: {},
    placeholder_overrides: {},
    status: 'draft',
  };
}

export type InsertGuestIndividualResult = { id: number } | { error: string };

// Persists the draft as a lightweight registry_individuals row (no
// registry_employees record - the person is still not an employee of
// anything). registry_individuals is owned by the external bcl-registry app
// (no DDL in this repo), so the insert sticks to columns this repo already
// reads (data.ts / individuals/database.ts) and retries with the JSON
// columns stringified if Postgres rejects their type.
export async function insertGuestIndividual(
  draft: GuestPersonDraft,
  companyId: string | number
): Promise<InsertGuestIndividualResult> {
  const fullName = draft.fullName.trim();
  if (!fullName) return { error: "Enter the person's full name first" };

  const nameParts = fullName.split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

  const contact: Record<string, string> = {};
  if (draft.contactEmail.trim()) contact.email = draft.contactEmail.trim();
  if (draft.contactPhone.trim()) contact.phone = draft.contactPhone.trim();

  const marker: GuestPersonMarker = {
    company_id: companyId,
    created_at: new Date().toISOString(),
    job_title: draft.jobTitle.trim() || undefined,
    department: draft.department.trim() || undefined,
    start_date: draft.startDate || undefined,
  };

  const row: Record<string, any> = {
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    kra_pin: draft.kraPin.trim() || null,
    id_number: draft.nationalId.trim() || null,
    nssf_number: draft.nssfNumber.trim() || null,
    shif_number: draft.shifNumber.trim() || null,
    contact_details: contact,
    employment_data: { external_contract_person: marker },
  };

  const isTypeMismatch = (e: any) =>
    e && (e.code === '42804' || e.code === '22P02' || /type/i.test(e.message || ''));

  let { data, error } = await supabase
    .from('registry_individuals')
    .insert(row)
    .select('id')
    .single();

  if (error && isTypeMismatch(error)) {
    const retry = await supabase
      .from('registry_individuals')
      .insert({
        ...row,
        contact_details: JSON.stringify(contact),
        employment_data: JSON.stringify({ external_contract_person: marker }),
      })
      .select('id')
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error || !data) {
    return { error: error?.message || 'Could not save the person to the registry' };
  }
  return { id: Number(data.id) };
}
