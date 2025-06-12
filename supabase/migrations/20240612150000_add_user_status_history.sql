-- Add status_history, start_date, and end_date columns
ALTER TABLE public.tm_users 
ADD COLUMN IF NOT EXISTS status_history JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS end_date TIMESTAMP WITH TIME ZONE;

-- Create index for better query performance on status_history
CREATE INDEX IF NOT EXISTS idx_tm_users_status_history 
ON public.tm_users USING GIN (status_history);

-- Create or replace function to update status with history
CREATE OR REPLACE FUNCTION public.update_user_status(
  p_user_id TEXT,
  p_active BOOLEAN,
  p_updated_by TEXT DEFAULT 'system',
  p_reason TEXT DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_current_end_date TIMESTAMP WITH TIME ZONE;
  v_new_status TEXT;
BEGIN
  -- Get current end date
  SELECT end_date INTO v_current_end_date FROM public.tm_users WHERE id = p_user_id;
  
  -- Determine new status
  v_new_status := CASE 
    WHEN p_active AND v_current_end_date IS NOT NULL THEN 'active' 
    WHEN NOT p_active AND v_current_end_date IS NULL THEN 'inactive'
    ELSE NULL -- No status change needed
  END;

  -- Only update if status is actually changing
  IF v_new_status IS NOT NULL THEN
    UPDATE public.tm_users
    SET 
      end_date = CASE WHEN p_active THEN NULL ELSE NOW() END,
      updated_at = NOW(),
      status_history = COALESCE(status_history, '[]'::jsonb) || jsonb_build_object(
        'status', v_new_status,
        'changed_at', NOW(),
        'changed_by', p_updated_by,
        'reason', COALESCE(p_reason, 'Status updated by ' || p_updated_by)
      )
    WHERE id = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a view to get active users
CREATE OR REPLACE VIEW public.vw_active_users AS
SELECT * FROM public.tm_users 
WHERE end_date IS NULL OR end_date > NOW();
