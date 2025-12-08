import { supabase } from "@/lib/supabase/client"

const TABLE_IDENTIFIER = 'admin_stage_dashboard';

export interface VisibilitySettings {
  defaultStageIds: string[];
  defaultHeaderIds: string[];
}

export const fetchUserVisibilitySettings = async (userId: string): Promise<VisibilitySettings | null> => {
  try {
    const { data, error } = await supabase
      .from('acc_portal_column_visibility')
      .select('settings')
      .eq('user_id', userId)
      .eq('table_identifier', TABLE_IDENTIFIER)
      .single();

    if (error && error.code !== 'PGRST116') { // Ignore "not found" error
      console.error('Error fetching visibility settings:', error);
      return null;
    }

    return data?.settings as VisibilitySettings || null;
  } catch (error) {
    console.error('Unexpected error fetching settings:', error);
    return null;
  }
};

export const saveUserVisibilitySettings = async (userId: string, settings: VisibilitySettings) => {
  try {
    const { error } = await supabase
      .from('acc_portal_column_visibility')
      .upsert({
        user_id: userId,
        table_identifier: TABLE_IDENTIFIER,
        settings: settings,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,table_identifier'
      });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error saving visibility settings:', error);
    throw error;
  }
};