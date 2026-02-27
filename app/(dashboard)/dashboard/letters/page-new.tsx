'use client';

import React, { useState, useEffect } from 'react';
import { CompanySidebar } from '../companies/company-sidebar';
import { LetterEditorWithPreview } from './components/LetterEditorWithPreview';
import { LetterheadUploadDialogNew } from './components/LetterheadUploadDialogNew';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Settings } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { fetchCompanies, type Company } from '../companies/database';
import { supabase } from '@/lib/supabase/client';

interface Letterhead {
  id: string;
  name: string;
  preview_image_url?: string;
  docx_url: string;
  body_box?: {
    top: number;
    left: number;
    right: number;
    bottom: number;
  };
  is_default: boolean;
  is_active: boolean;
}

export default function LetterGenerationModuleNew() {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [selectedLetterhead, setSelectedLetterhead] = useState<Letterhead | null>(null);
  const [letterheads, setLetterheads] = useState<Letterhead[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const { toast } = useToast();

  // Load companies
  const loadCompanies = async () => {
    try {
      const data = await fetchCompanies();
      setCompanies(data);
    } catch (error) {
      console.error('Failed to load companies:', error);
      toast({
        title: 'Error',
        description: 'Failed to load companies',
        variant: 'destructive',
      });
    }
  };

  // Load letterheads for selected company
  const loadLetterheads = async (companyId: string) => {
    if (!companyId) {
      setLetterheads([]);
      setSelectedLetterhead(null);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('acc_portal_company_letterheads')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setLetterheads(data || []);

      // Auto-select the default letterhead
      const defaultLetterhead = data?.find(l => l.is_default);
      if (defaultLetterhead) {
        setSelectedLetterhead(defaultLetterhead);
      } else if (data && data.length > 0) {
        setSelectedLetterhead(data[0]);
      } else {
        setSelectedLetterhead(null);
      }

    } catch (error) {
      console.error('Failed to load letterheads:', error);
      toast({
        title: 'Error',
        description: 'Failed to load letterheads',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle company selection
  const handleCompanySelect = (companyId: string) => {
    setSelectedCompanyId(companyId);
  };

  // Handle letterhead selection
  const handleLetterheadSelect = (letterhead: Letterhead) => {
    setSelectedLetterhead(letterhead);
  };

  // Handle successful upload
  const handleUploadSuccess = () => {
    if (selectedCompanyId) {
      loadLetterheads(selectedCompanyId);
    }
  };

  // Load data on mount
  useEffect(() => {
    loadCompanies();
  }, []);

  // Load letterheads when company changes
  useEffect(() => {
    if (selectedCompanyId) {
      loadLetterheads(selectedCompanyId);
    }
  }, [selectedCompanyId]);

  const selectedCompany = companies.find(c => c.id === selectedCompanyId);

  return (
    <div className="flex h-full">
      {/* Company Sidebar */}
      <div className="w-80 border-r">
        <CompanySidebar
          selectedCompanyId={selectedCompanyId}
          onCompanySelect={handleCompanySelect}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b p-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Letter Generation</h1>
              <p className="text-muted-foreground">
                {selectedCompany 
                  ? `Writing for: ${selectedCompany.company_name}`
                  : 'Select a company to start'
                }
              </p>
            </div>
            
            {selectedCompanyId && (
              <Button
                onClick={() => setUploadDialogOpen(true)}
                variant="outline"
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Letterhead
              </Button>
            )}
          </div>

          {/* Letterhead Selection */}
          {selectedCompanyId && letterheads.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium mb-2">Available Letterheads:</h3>
              <div className="flex gap-2 flex-wrap">
                {letterheads.map((letterhead) => (
                  <Button
                    key={letterhead.id}
                    variant={selectedLetterhead?.id === letterhead.id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleLetterheadSelect(letterhead)}
                    className="flex items-center gap-2"
                  >
                    <FileText className="h-4 w-4" />
                    {letterhead.name}
                    {letterhead.is_default && (
                      <Badge variant="secondary" className="text-xs">Default</Badge>
                    )}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {selectedCompanyId && letterheads.length === 0 && !loading && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-yellow-600" />
                <div>
                  <p className="text-sm font-medium text-yellow-800">No letterheads found</p>
                  <p className="text-xs text-yellow-600">
                    Upload a letterhead to get started
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Letter Editor */}
        <div className="flex-1 p-4 overflow-auto">
          <LetterEditorWithPreview
            companyId={selectedCompanyId}
            selectedLetterhead={selectedLetterhead}
          />
        </div>
      </div>

      {/* Upload Dialog */}
      <LetterheadUploadDialogNew
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onSuccess={handleUploadSuccess}
        preselectedCompanyId={selectedCompanyId}
      />
    </div>
  );
}
