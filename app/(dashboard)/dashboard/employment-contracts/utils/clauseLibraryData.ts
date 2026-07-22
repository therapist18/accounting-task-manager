import supabase from '@/lib/supabase/client';
import type { ClauseSuggestionCondition } from './clauseEngine';

export interface EcClause {
  id: string;
  section_key: string;
  clause_key: string;
  label: string;
  content: string;
  is_default: boolean;
  company_id: string | null;
  suggest_conditions: ClauseSuggestionCondition[];
  suggest_priority: number;
  created_at: string;
  updated_at: string;
}

export async function fetchClauses(): Promise<EcClause[]> {
  const { data, error } = await supabase
    .from('ec_clauses')
    .select('*')
    .order('section_key', { ascending: true })
    .order('label', { ascending: true });

  if (error) {
    console.error('Error fetching clauses:', error);
    return [];
  }
  return (data || []) as EcClause[];
}

export async function createClause(clause: Partial<EcClause>): Promise<EcClause | null> {
  const { data, error } = await supabase
    .from('ec_clauses')
    .insert([clause])
    .select()
    .single();

  if (error) {
    console.error('Error creating clause:', error);
    throw error;
  }
  return data as EcClause;
}

export async function updateClause(id: string, patch: Partial<EcClause>): Promise<EcClause | null> {
  const { data, error } = await supabase
    .from('ec_clauses')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating clause:', error);
    throw error;
  }
  return data as EcClause;
}

export async function deleteClause(id: string): Promise<boolean> {
  const { error } = await supabase.from('ec_clauses').delete().eq('id', id);
  if (error) {
    console.error('Error deleting clause:', error);
    return false;
  }
  return true;
}
