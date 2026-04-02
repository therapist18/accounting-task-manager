'use client';

import { useState, useEffect, useMemo } from 'react';
import { fetchCompanies, type Company } from '../../companies/database';
import { CompanySidebar } from '../../companies/company-sidebar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Trash2, Edit, Star, Download, Eye } from 'lucide-react';
import { useToast } from '@/lib/hooks/use-toast';
import { supabase } from '@/lib/supabase/client';
import { LetterheadUploadDialog } from '../components/LetterheadUploadDialog';
import { LetterheadEditDialog } from '../components/LetterheadEditDialog';
import { LetterheadPreviewDialog } from '../components/LetterheadPreviewDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Letterhead {
  id: string;
  company_id: number;
  name: string;
  description?: string;
  file_path: string;
  file_name: string;
  file_size?: number;
  contact_details?: any;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function LetterheadsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [letterheads, setLetterheads] = useState<Letterhead[]>([]);
  const [loading, setLoading] = useState(true);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedLetterhead, setSelectedLetterhead] = useState<Letterhead | null>(null);
  const [letterheadToDelete, setLetterheadToDelete] = useState<Letterhead | null>(null);
  const [activeCompanyId, setActiveCompanyId] = useState<string>('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showDefaultDisplayOnly, setShowDefaultDisplayOnly] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadCompanies();
    fetchLetterheads();
  }, []);

  useEffect(() => {
    if (activeCompanyId) {
      fetchLetterheads(parseInt(activeCompanyId));
    }
  }, [activeCompanyId]);

  const loadCompanies = async () => {
    try {
      setCompaniesLoading(true);
      const data = await fetchCompanies();
      setCompanies(data);
      if (data.length > 0 && !activeCompanyId) {
        setActiveCompanyId(data[0].id.toString());
      }
    } catch (error) {
      console.error('Error loading companies:', error);
    } finally {
      setCompaniesLoading(false);
    }
  };

  const fetchLetterheads = async (companyId?: number) => {
    try {
      setLoading(true);
      const url = companyId
        ? `/api/letterheads?company_id=${companyId}`
        : '/api/letterheads';

      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch letterheads');

      const data = await response.json();
      setLetterheads(data);
    } catch (error) {
      console.error('Error fetching letterheads:', error);
      toast({
        title: 'Error',
        description: 'Failed to load letterheads',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefault = async (letterhead: Letterhead) => {
    try {
      const response = await fetch('/api/letterheads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: letterhead.id,
          company_id: letterhead.company_id,
          is_default: true,
        }),
      });

      if (!response.ok) throw new Error('Failed to set default');

      toast({
        title: 'Success',
        description: 'Default letterhead updated',
      });

      fetchLetterheads(parseInt(activeCompanyId));
    } catch (error) {
      console.error('Error setting default:', error);
      toast({
        title: 'Error',
        description: 'Failed to set default letterhead',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = (letterhead: Letterhead) => {
    setLetterheadToDelete(letterhead);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!letterheadToDelete) return;

    try {
      // First, delete the file from storage
      const { error: storageError } = await supabase.storage
        .from('letterheads')
        .remove([letterheadToDelete.file_path]);

      if (storageError) {
        console.error('Error deleting storage file:', storageError);
        // Continue with database deletion even if storage deletion fails
        toast({
          title: 'Warning',
          description: 'Storage file could not be deleted, but database record will be removed',
          variant: 'default',
        });
      }

      // Then, delete the database record
      const response = await fetch(`/api/letterheads?id=${letterheadToDelete.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete database record');

      toast({
        title: 'Success',
        description: 'Letterhead and file deleted successfully',
      });

      fetchLetterheads(parseInt(activeCompanyId));
    } catch (error) {
      console.error('Error deleting letterhead:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete letterhead',
        variant: 'destructive',
      });
    } finally {
      setDeleteDialogOpen(false);
      setLetterheadToDelete(null);
    }
  };

  const handleEdit = (letterhead: Letterhead) => {
    setSelectedLetterhead(letterhead);
    setEditDialogOpen(true);
  };

  const handlePreview = (letterhead: Letterhead) => {
    setSelectedLetterhead(letterhead);
    setPreviewDialogOpen(true);
  };

  const handleUploadSuccess = () => {
    setUploadDialogOpen(false);
    fetchLetterheads(parseInt(activeCompanyId));
  };

  const handleEditSuccess = () => {
    setEditDialogOpen(false);
    setSelectedLetterhead(null);
    fetchLetterheads(parseInt(activeCompanyId));
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const activeCompany = useMemo(() => {
    return companies.find(c => c.id.toString() === activeCompanyId);
  }, [companies, activeCompanyId]);

  const letterheadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    letterheads.forEach(lh => {
      const key = lh.company_id.toString();
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [letterheads]);

  const currentCompanyLetterheads = useMemo(() => {
    return letterheads.filter(lh => lh.company_id.toString() === activeCompanyId);
  }, [letterheads, activeCompanyId]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Company Sidebar */}
      <div className={`${sidebarCollapsed ? 'w-16' : 'w-80'} transition-all duration-300 flex-shrink-0`}>
        <CompanySidebar
          companies={companies}
          activeCompany={activeCompanyId}
          onCompanyClick={setActiveCompanyId}
          isCollapsed={sidebarCollapsed}
          onCollapseToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          showDefaultDisplayOnly={showDefaultDisplayOnly}
          onToggleDefaultDisplay={() => setShowDefaultDisplayOnly(!showDefaultDisplayOnly)}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto p-6 space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">
                {activeCompany?.company_name || 'Company Letterheads'}
              </h1>
              <p className="text-muted-foreground mt-1">
                {activeCompany
                  ? `Manage letterhead templates for ${activeCompany.company_name}`
                  : 'Select a company to view and manage letterheads'
                }
              </p>
              {activeCompanyId && (
                <Badge variant="outline" className="mt-2">
                  {currentCompanyLetterheads.length} letterhead{currentCompanyLetterheads.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            <Button
              onClick={() => setUploadDialogOpen(true)}
              disabled={!activeCompanyId}
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload Letterhead
            </Button>
          </div>

          {!activeCompanyId ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-64">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">
                  Select a company from the sidebar to view and manage letterheads
                </p>
              </CardContent>
            </Card>
          ) : loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : currentCompanyLetterheads.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-64">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center mb-4">
                  No letterheads found for {activeCompany?.company_name}.
                </p>
                <Button onClick={() => setUploadDialogOpen(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload First Letterhead
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentCompanyLetterheads.map((letterhead) => (
                <Card key={letterhead.id} className="relative">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="flex items-center gap-2">
                          {letterhead.name}
                          {letterhead.is_default && (
                            <Badge variant="default" className="ml-2">
                              <Star className="h-3 w-3 mr-1" />
                              Default
                            </Badge>
                          )}
                        </CardTitle>
                        {letterhead.description && (
                          <CardDescription className="mt-1">
                            {letterhead.description}
                          </CardDescription>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-sm space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">File:</span>
                        <span className="font-medium truncate ml-2" title={letterhead.file_name}>
                          {letterhead.file_name}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Size:</span>
                        <span>{formatFileSize(letterhead.file_size)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Created:</span>
                        <span>{new Date(letterhead.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePreview(letterhead)}
                          className="flex-1"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Preview
                        </Button>
                        {!letterhead.is_default && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSetDefault(letterhead)}
                            className="flex-1"
                          >
                            <Star className="h-4 w-4 mr-1" />
                            Default
                          </Button>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(letterhead)}
                          className="flex-1"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(letterhead)}
                          disabled={letterhead.is_default}
                          className="flex-1"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <LetterheadUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onSuccess={handleUploadSuccess}
        preselectedCompanyId={activeCompanyId}
      />

      {selectedLetterhead && (
        <>
          <LetterheadEditDialog
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            letterhead={selectedLetterhead}
            onSuccess={handleEditSuccess}
          />
          <LetterheadPreviewDialog
            open={previewDialogOpen}
            onOpenChange={setPreviewDialogOpen}
            letterheadId={selectedLetterhead.id}
            letterheadName={selectedLetterhead.name}
            filePath={selectedLetterhead.file_path}
            fileName={selectedLetterhead.file_name}
          />
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Letterhead</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{letterheadToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
