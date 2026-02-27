'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { fetchCompanies, type Company } from '../../companies/database';

interface LetterheadUploadDialogNewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  preselectedCompanyId?: string;
}

export function LetterheadUploadDialogNew({
  open,
  onOpenChange,
  onSuccess,
  preselectedCompanyId
}: LetterheadUploadDialogNewProps) {
  const [file, setFile] = useState<File | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(preselectedCompanyId || '');
  const [letterheadName, setLetterheadName] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const { toast } = useToast();

  // Load companies when dialog opens
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

  // Handle file selection
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      if (!selectedFile.name.toLowerCase().endsWith('.docx')) {
        toast({
          title: 'Invalid file type',
          description: 'Please select a .docx file',
          variant: 'destructive',
        });
        return;
      }

      // Validate file size (max 10MB)
      if (selectedFile.size > 10 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: 'Please select a file smaller than 10MB',
          variant: 'destructive',
        });
        return;
      }

      setFile(selectedFile);
      setUploadStatus('idle');
      setErrorMessage('');
    }
  };

  // Handle upload
  const handleUpload = async () => {
    if (!file || !selectedCompanyId) {
      toast({
        title: 'Missing information',
        description: 'Please select a file and company',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    setUploadStatus('uploading');
    setErrorMessage('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('companyId', selectedCompanyId);
      formData.append('name', letterheadName || 'Default Letterhead');

      const response = await fetch('/api/letterheads/upload-with-preview', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      setUploadStatus('success');
      toast({
        title: 'Success!',
        description: `Letterhead uploaded successfully${result.preview_generated ? ' with preview' : ''}`,
      });

      // Reset form
      setTimeout(() => {
        setFile(null);
        setLetterheadName('');
        setSelectedCompanyId('');
        setUploadStatus('idle');
        onOpenChange(false);
        onSuccess?.();
      }, 1500);

    } catch (error) {
      setUploadStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Upload failed');
      toast({
        title: 'Upload failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Load companies when dialog opens
  React.useEffect(() => {
    if (open && companies.length === 0) {
      loadCompanies();
    }
  }, [open, companies.length]);

  // Reset when dialog closes
  React.useEffect(() => {
    if (!open) {
      setFile(null);
      setLetterheadName('');
      setSelectedCompanyId(preselectedCompanyId || '');
      setUploadStatus('idle');
      setErrorMessage('');
    }
  }, [open, preselectedCompanyId]);

  const selectedCompany = companies.find(c => c.id === selectedCompanyId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Letterhead
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Company Selection */}
          <div className="space-y-2">
            <Label htmlFor="company">Company *</Label>
            <Select
              value={selectedCompanyId}
              onValueChange={setSelectedCompanyId}
              disabled={!!preselectedCompanyId || loading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a company" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id.toString()}>
                    {company.company_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCompany && (
              <p className="text-sm text-muted-foreground">
                KRA PIN: {selectedCompany.registration_number}
              </p>
            )}
          </div>

          {/* Letterhead Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Letterhead Name</Label>
            <Input
              id="name"
              value={letterheadName}
              onChange={(e) => setLetterheadName(e.target.value)}
              placeholder="Default Letterhead"
              disabled={loading}
            />
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="file">Letterhead File (.docx) *</Label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <input
                id="file"
                type="file"
                accept=".docx"
                onChange={handleFileChange}
                disabled={loading}
                className="hidden"
              />
              <label htmlFor="file" className="cursor-pointer">
                <div className="space-y-2">
                  {file ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="h-8 w-8 text-blue-500" />
                      <div className="text-left">
                        <p className="font-medium">{file.name}</p>
                        <p className="text-sm text-gray-500">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="h-8 w-8 mx-auto text-gray-400" />
                      <p className="text-sm text-gray-600">
                        Click to upload or drag and drop
                      </p>
                      <p className="text-xs text-gray-500">
                        .docx files only (max 10MB)
                      </p>
                    </div>
                  )}
                </div>
              </label>
            </div>
          </div>

          {/* Upload Status */}
          {uploadStatus !== 'idle' && (
            <div className={`p-4 rounded-lg ${uploadStatus === 'uploading' ? 'bg-blue-50' :
              uploadStatus === 'success' ? 'bg-green-50' :
                'bg-red-50'
              }`}>
              <div className="flex items-center gap-2">
                {uploadStatus === 'uploading' && (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                    <span className="text-blue-700">Uploading and generating preview...</span>
                  </>
                )}
                {uploadStatus === 'success' && (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-green-700">Upload successful!</span>
                  </>
                )}
                {uploadStatus === 'error' && (
                  <>
                    <AlertCircle className="h-4 w-4 text-red-500" />
                    <span className="text-red-700">Upload failed: {errorMessage}</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Information */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">What happens next:</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Your .docx file will be stored as the source of truth</li>
              <li>• A preview image will be generated automatically</li>
              <li>• The letterhead will be available in the letter editor</li>
              <li>• Downloads will merge content into your template</li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!file || !selectedCompanyId || loading || uploadStatus === 'success'}
              className="flex-1"
            >
              {loading ? 'Uploading...' : 'Upload Letterhead'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
