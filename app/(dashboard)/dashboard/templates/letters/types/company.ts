export interface Company {
  id: number;
  company_name: string;
  kra_pin: string;
  acc_client_effective_from: string | null;
  acc_client_effective_to: string | null;
  imm_client_effective_from: string | null;
  imm_client_effective_to: string | null;
  audit_client_effective_from: string | null;
  audit_client_effective_to: string | null;
  sheria_client_effective_from: string | null;
  sheria_client_effective_to: string | null;
  is_locked: boolean;
  created_at?: string;
  updated_at?: string;
}
