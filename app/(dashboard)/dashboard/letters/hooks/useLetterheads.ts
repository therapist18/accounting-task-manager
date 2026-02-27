import { useState, useEffect } from 'react';

export interface Letterhead {
  id: string;
  company_id: number;
  name: string;
  description?: string;
  file_path: string;
  file_name: string;
  file_size?: number;
  contact_details?: {
    phone?: string;
    email?: string;
    address?: string;
    website?: string;
  };
  header_preview_url?: string;
  footer_preview_url?: string;
  is_default: boolean;
  is_active: boolean;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

export function useLetterheads(companyId?: number) {
  const [letterheads, setLetterheads] = useState<Letterhead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLetterheads = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const url = companyId 
        ? `/api/letterheads?company_id=${companyId}`
        : '/api/letterheads';
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch letterheads');
      
      const data = await response.json();
      setLetterheads(data);
    } catch (err) {
      console.error('Error fetching letterheads:', err);
      setError(err instanceof Error ? err.message : 'Failed to load letterheads');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLetterheads();
  }, [companyId]);

  const getDefaultLetterhead = () => {
    return letterheads.find(lh => lh.is_default && lh.is_active);
  };

  const getLetterheadById = (id: string) => {
    return letterheads.find(lh => lh.id === id);
  };

  return {
    letterheads,
    loading,
    error,
    refetch: fetchLetterheads,
    getDefaultLetterhead,
    getLetterheadById,
  };
}
