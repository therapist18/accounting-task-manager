import supabase from '@/lib/supabase/client';

export type ContractEmployeeInfo = {
  id: string; // "companyId-individualId"
  individualId: number;
  companyId: number;
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

function mapEmployeeRow(
  emp: any,
  individualsMap: Map<number, any>,
  salaryMap: Map<number, number>
): ContractEmployeeInfo {
  const ind = individualsMap.get(emp.individual_id) || {};

  // Extract contact
  let email = '';
  let phone = '';
  try {
    if (typeof ind.contact_details === 'string') {
      const c = JSON.parse(ind.contact_details);
      email = c.email || '';
      phone = c.phone || '';
    } else if (ind.contact_details && typeof ind.contact_details === 'object') {
      email = ind.contact_details.email || '';
      phone = ind.contact_details.phone || '';
    }
  } catch (e) {}

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

export async function fetchCompanyEmployees(companyId: string | number): Promise<ContractEmployeeInfo[]> {
  // 1. Fetch registry employees for this company
  const { data: employeesData, error: employeesError } = await supabase
    .from('registry_employees')
    .select('*')
    .eq('company_id', companyId);

  if (employeesError || !employeesData) {
    console.error('Error fetching employees:', employeesError);
    return [];
  }

  if (employeesData.length === 0) return [];

  const individualIds = employeesData.map(e => e.individual_id);

  // 2. Fetch registry individuals
  const { data: individualsData, error: individualsError } = await supabase
    .from('registry_individuals')
    .select('*')
    .in('id', individualIds);

  if (individualsError || !individualsData) {
    console.error('Error fetching individuals:', individualsError);
    return [];
  }

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
  return employeesData.map(emp => mapEmployeeRow(emp, individualsMap, salaryMap));
}

// Fetches employees for every company in one batch (3 queries total instead of 3-per-company),
// grouped by company id, so the sidebar can show employees without a per-company round trip.
export async function fetchAllEmployeesGrouped(): Promise<Record<string, ContractEmployeeInfo[]>> {
  const { data: employeesData, error: employeesError } = await supabase
    .from('registry_employees')
    .select('*');

  if (employeesError || !employeesData || employeesData.length === 0) {
    if (employeesError) console.error('Error fetching employees:', employeesError);
    return {};
  }

  const individualIds = [...new Set(employeesData.map(e => e.individual_id))];

  const { data: individualsData, error: individualsError } = await supabase
    .from('registry_individuals')
    .select('*')
    .in('id', individualIds);

  if (individualsError) {
    console.error('Error fetching individuals:', individualsError);
    return {};
  }

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

  const grouped: Record<string, ContractEmployeeInfo[]> = {};
  employeesData.forEach(emp => {
    const mapped = mapEmployeeRow(emp, individualsMap, salaryMap);
    const key = String(emp.company_id);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(mapped);
  });

  return grouped;
}
