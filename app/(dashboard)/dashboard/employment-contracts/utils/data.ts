import supabase from '@/lib/supabase/client';
import { readGuestMarker, type GuestPersonMarker } from './guestPerson';

export type ContractEmployeeInfo = {
  id: string; // "companyId-individualId"
  individualId: number;
  // Raw company id as stored by whichever table it came from - the registry
  // mapping passes emp.company_id through untouched, and guests pass the
  // selected company's id through unchanged. Consumers stringify it or pass
  // it straight into queries; never coerce with Number() here, or a
  // non-numeric id zeroes out and every company-scoped lookup downstream
  // (preview context, signatory, master-field/letter resolution) breaks.
  companyId: number | string;
  // A one-off external person created from this workspace (see guestPerson.ts)
  // - has a registry_individuals row but no registry_employees record. 0
  // individualId on the unsaved in-editor draft form of these.
  isGuest?: boolean;
  fullName: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  kraPin: string;
  nationalId: string;
  nssfNumber: string;
  nhifNumber: string;
  shifNumber: string;
  department: string;
  jobTitle: string;
  employmentType: string;
  employmentStatus: string;
  jobLevel: string;
  reportsTo: string;
  workLocation: string;
  workArrangement: string;
  status: string;
  basicSalary: number;
  grossSalary: number; // Sum of basic + allowances
  bankName: string;
  bankBranch: string;
  bankAccount: string;
  contactEmail: string;
  contactPhone: string;
  startDate: string;
};

function parseContactDetails(raw: any): { email: string; phone: string } {
  let email = '';
  let phone = '';
  try {
    let value = raw;
    if (typeof value === 'string') value = JSON.parse(value);
    if (value && typeof value === 'object') {
      email = value.email || '';
      phone = value.phone || '';
    }
  } catch (e) {}
  return { email, phone };
}

function mapEmployeeRow(
  emp: any,
  individualsMap: Map<number, any>,
  salaryMap: Map<number, number>
): ContractEmployeeInfo {
  const ind = individualsMap.get(emp.individual_id) || {};

  // Extract contact
  const { email, phone } = parseContactDetails(ind.contact_details);

  // Extract bank
  let bankName = '';
  let bankBranch = '';
  let bankAccount = '';
  try {
    if (emp.payment_methods) {
      let pm = emp.payment_methods;
      if (typeof pm === 'string') pm = JSON.parse(pm);
      if (Array.isArray(pm) && pm.length > 0) {
        bankName = pm[0].bank_name || '';
        bankBranch = pm[0].sort_code || '';
        bankAccount = pm[0].account_number || '';
      }
    }
  } catch (e) {}

  const basic = salaryMap.get(emp.individual_id) || 0;

  const fName = ind.first_name || '';
  const lName = ind.last_name || '';
  const mName = ind.middle_name || '';
  const fullName = ind.full_name || [fName, mName, lName].filter(Boolean).join(' ') || 'Employee';

  return {
    id: `${emp.company_id}-${emp.individual_id}`,
    individualId: emp.individual_id,
    companyId: emp.company_id,
    fullName,
    firstName: fName,
    lastName: lName,
    employeeNumber: emp.payroll_number || `EMP-${emp.individual_id}`,
    kraPin: ind.kra_pin || '',
    nationalId: ind.id_number || '',
    nssfNumber: ind.nssf_number || '',
    nhifNumber: ind.nhif_number || '',
    shifNumber: ind.shif_number || '',
    department: emp.department || '',
    jobTitle: emp.job_title || '',
    employmentType: emp.employment_type || '',
    employmentStatus: emp.employment_lifecycle?.status || 'Active',
    jobLevel: emp.job_level || '',
    reportsTo: emp.reports_to || '',
    workLocation: emp.work_location || '',
    workArrangement: emp.work_arrangement || '',
    status: emp.employment_lifecycle?.status || 'Active',
    basicSalary: basic,
    grossSalary: basic, // Defaulting gross to basic for now
    bankName,
    bankBranch,
    bankAccount,
    contactEmail: email,
    contactPhone: phone,
    startDate: emp.effective_start_date || '',
  };
}

// Maps a registry_individuals row carrying the external_contract_person
// marker (written by guestPerson.ts's insertGuestIndividual) into the same
// shape a registry_employees row maps to, so a saved external person flows
// through the workspace exactly like an employee once they exist.
function mapGuestRow(ind: any, marker: GuestPersonMarker): ContractEmployeeInfo {
  const { email, phone } = parseContactDetails(ind.contact_details);

  const fName = ind.first_name || '';
  const lName = ind.last_name || '';
  const mName = ind.middle_name || '';
  const fullName = ind.full_name || [fName, mName, lName].filter(Boolean).join(' ') || 'External Person';

  return {
    id: `guest-${marker.company_id}-${ind.id}`,
    individualId: ind.id,
    companyId: marker.company_id,
    fullName,
    firstName: fName,
    lastName: lName,
    employeeNumber: '',
    kraPin: ind.kra_pin || '',
    nationalId: ind.id_number || '',
    nssfNumber: ind.nssf_number || '',
    nhifNumber: ind.nhif_number || '',
    shifNumber: ind.shif_number || '',
    department: marker.department || '',
    jobTitle: marker.job_title || '',
    employmentType: '',
    employmentStatus: 'External',
    jobLevel: '',
    reportsTo: '',
    workLocation: '',
    workArrangement: '',
    status: 'Active',
    basicSalary: 0,
    grossSalary: 0,
    bankName: '',
    bankBranch: '',
    bankAccount: '',
    contactEmail: email,
    contactPhone: phone,
    startDate: marker.start_date || '',
    isGuest: true,
  };
}

// All one-off external persons this workspace has created (see
// guestPerson.ts). The marker stores the issuing company, so no
// registry_employees row is needed to place them in the sidebar. Ids already
// in excludeIds are skipped - once someone gets a real registry_employees
// row, that record is the source of truth. Reads the full individuals table
// and filters client-side rather than relying on a jsonb containment
// operator, since the column type (jsonb vs text) isn't owned by this repo.
async function fetchExternalIndividuals(
  companyId: string | number | null,
  excludeIds: Set<number>
): Promise<ContractEmployeeInfo[]> {
  const { data, error } = await supabase.from('registry_individuals').select('*');
  if (error || !data) {
    if (error) console.error('Error fetching external persons:', error);
    return [];
  }

  const results: ContractEmployeeInfo[] = [];
  for (const ind of data) {
    if (excludeIds.has(ind.id)) continue;
    const marker = readGuestMarker(ind.employment_data);
    if (!marker) continue;
    if (companyId != null && String(marker.company_id) !== String(companyId)) continue;
    results.push(mapGuestRow(ind, marker));
  }
  return results;
}

export async function fetchCompanyEmployees(companyId: string | number): Promise<ContractEmployeeInfo[]> {
  // 1. Fetch registry employees for this company
  const { data: employeesData, error: employeesError } = await supabase
    .from('registry_employees')
    .select('*')
    .eq('company_id', companyId);

  const mapped: ContractEmployeeInfo[] = [];

  if (employeesError || !employeesData) {
    console.error('Error fetching employees:', employeesError);
  } else if (employeesData.length > 0) {
    const individualIds = employeesData.map(e => e.individual_id);

    // 2. Fetch registry individuals
    const { data: individualsData, error: individualsError } = await supabase
      .from('registry_individuals')
      .select('*')
      .in('id', individualIds);

    if (individualsError || !individualsData) {
      console.error('Error fetching individuals:', individualsError);
    } else {
      const individualsMap = new Map();
      individualsData.forEach(ind => individualsMap.set(ind.id, ind));

      // 3. Fetch basic salaries from assignments
      const { data: salaryData, error: salaryError } = await supabase
        .from('bcl_payroll_salary_assignments')
        .select('*')
        .eq('company_id', companyId)
        .eq('component_id', 'basic');

      const salaryMap = new Map();
      if (!salaryError && salaryData) {
        salaryData.forEach(sal => {
          // Assuming multiple might exist, pick the newest or just active
          // In a real scenario, we might sort by start_date DESC. Here we just set it.
          salaryMap.set(sal.individual_id, Number(sal.amount) || 0);
        });
      }

      // 4. Map them together
      mapped.push(...employeesData.map(emp => mapEmployeeRow(emp, individualsMap, salaryMap)));
    }
  }

  // 5. External persons (guestPerson.ts) - independent of the queries above
  // so a company made up entirely of external people still lists them (and a
  // failure on either side never blanks the other).
  const externalIds = new Set<number>(employeesData?.map((e: any) => e.individual_id) ?? []);
  const externals = await fetchExternalIndividuals(companyId, externalIds);
  return [...mapped, ...externals];
}

// Fetches employees for every company in one batch (3 queries total instead of 3-per-company),
// grouped by company id, so the sidebar can show employees without a per-company round trip.
export async function fetchAllEmployeesGrouped(): Promise<Record<string, ContractEmployeeInfo[]>> {
  const grouped: Record<string, ContractEmployeeInfo[]> = {};
  const employeeIds = new Set<number>();

  const { data: employeesData, error: employeesError } = await supabase
    .from('registry_employees')
    .select('*');

  if (employeesError || !employeesData) {
    if (employeesError) console.error('Error fetching employees:', employeesError);
  } else if (employeesData.length > 0) {
    const individualIds = [...new Set<number>(employeesData.map((e: any) => e.individual_id))];
    individualIds.forEach(id => employeeIds.add(id));

    const { data: individualsData, error: individualsError } = await supabase
      .from('registry_individuals')
      .select('*')
      .in('id', individualIds);

    if (individualsError) {
      console.error('Error fetching individuals:', individualsError);
    } else {
      const individualsMap = new Map();
      (individualsData || []).forEach(ind => individualsMap.set(ind.id, ind));

      const { data: salaryData, error: salaryError } = await supabase
        .from('bcl_payroll_salary_assignments')
        .select('*')
        .eq('component_id', 'basic');

      const salaryMap = new Map();
      if (!salaryError && salaryData) {
        salaryData.forEach(sal => {
          salaryMap.set(sal.individual_id, Number(sal.amount) || 0);
        });
      }

      employeesData.forEach(emp => {
        const mapped = mapEmployeeRow(emp, individualsMap, salaryMap);
        const key = String(emp.company_id);
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(mapped);
      });
    }
  }

  // External persons (guestPerson.ts) - placed under the company stored in
  // their employment_data marker, skipped once they have a real
  // registry_employees row (that record wins).
  const externals = await fetchExternalIndividuals(null, employeeIds);
  externals.forEach(emp => {
    const key = String(emp.companyId);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(emp);
  });

  return grouped;
}
