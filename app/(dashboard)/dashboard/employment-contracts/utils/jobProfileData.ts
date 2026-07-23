import supabase from '@/lib/supabase/client';

export type JobProfileScope = 'company' | 'department' | 'position';

export interface EcJobProfile {
  id: string;
  scope: JobProfileScope;
  company_id: string;
  name: string;
  department: string | null;
  job_title: string | null;
  employment_type: string | null;
  job_level: string | null;
  work_arrangement: string | null;
  settings: Record<string, any>;
  section_clauses: Record<string, string>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function fetchJobProfiles(companyId?: string | number): Promise<EcJobProfile[]> {
  let query = supabase
    .from('ec_job_profiles')
    .select('*')
    .order('name', { ascending: true });

  if (companyId) {
    query = query.eq('company_id', String(companyId));
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching job profiles:', error);
    return [];
  }
  return (data || []) as EcJobProfile[];
}

export async function createJobProfile(profile: Partial<EcJobProfile>): Promise<EcJobProfile | null> {
  const { data, error } = await supabase
    .from('ec_job_profiles')
    .insert([profile])
    .select()
    .single();

  if (error) {
    console.error('Error creating job profile:', error);
    throw error;
  }
  return data as EcJobProfile;
}

export async function updateJobProfile(id: string, patch: Partial<EcJobProfile>): Promise<EcJobProfile | null> {
  const { data, error } = await supabase
    .from('ec_job_profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating job profile:', error);
    throw error;
  }
  return data as EcJobProfile;
}

export async function deleteJobProfile(id: string): Promise<boolean> {
  const { error } = await supabase.from('ec_job_profiles').delete().eq('id', id);
  if (error) {
    console.error('Error deleting job profile:', error);
    return false;
  }
  return true;
}

/**
 * Picks the best-matching scope='position' profile for an employee, using
 * the same weighted/disqualifying scoring the old whole-document template
 * picker used (ContractEditor.tsx pre-rework) - generalized to match against
 * real ec_job_profiles rows instead of loose acc_portal_templates.classification.
 */
export function matchJobProfile(
  profiles: EcJobProfile[],
  employee: { department?: string | null; jobTitle?: string | null; employmentType?: string | null }
): EcJobProfile | null {
  let best: EcJobProfile | null = null;
  let bestScore = -1;

  for (const p of profiles.filter((p) => p.scope === 'position' && p.is_active)) {
    let score = 0;
    let disqualified = false;

    const checkMatch = (profileVal: string | null, empVal: string | null | undefined, weight: number) => {
      if (profileVal) {
        if (!empVal || profileVal.toLowerCase() !== empVal.toLowerCase()) {
          disqualified = true;
        } else {
          score += weight;
        }
      }
    };

    checkMatch(p.department, employee.department, 100);
    checkMatch(p.job_title, employee.jobTitle, 10);
    checkMatch(p.employment_type, employee.employmentType, 1);

    if (!disqualified && score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  return best;
}

export function findCompanyDefaults(profiles: EcJobProfile[], companyId: string | number): EcJobProfile | undefined {
  return profiles.find((p) => p.scope === 'company' && p.company_id === String(companyId));
}

export function findDepartmentDefaults(profiles: EcJobProfile[], companyId: string | number, department?: string | null): EcJobProfile | undefined {
  if (!department) return undefined;
  return profiles.find((p) => p.scope === 'department' && p.company_id === String(companyId) && p.department?.toLowerCase() === department.toLowerCase());
}
