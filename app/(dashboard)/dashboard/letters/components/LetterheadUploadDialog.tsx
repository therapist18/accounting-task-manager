'use client';

import { useState, useEffect } from 'react';
import { fetchCompanies, type Company } from '../../companies/database';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Upload, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface LetterheadUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  preselectedCompanyId?: string;
}

export function LetterheadUploadDialog({ open, onOpenChange, onSuccess, preselectedCompanyId }: LetterheadUploadDialogProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    company_id: '',
    name: '',
    description: '',
    is_default: false,
  });
  const [file, setFile] = useState<File | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadCompanies();
      if (preselectedCompanyId && !formData.company_id) {
        setFormData(prev => ({ ...prev, company_id: preselectedCompanyId }));
      }
    }
  }, [open, preselectedCompanyId]);

  const loadCompanies = async () => {
    try {
      const data = await fetchCompanies();
      setCompanies(data);
    } catch (error) {
      console.error('Error loading companies:', error);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.docx') && !selectedFile.name.endsWith('.doc')) {
        toast({
          title: 'Invalid file type',
          description: 'Please upload a Word document (.docx or .doc)',
          variant: 'destructive',
        });
        return;
      }
      setFile(selectedFile);
      if (!formData.name) {
        setFormData(prev => ({
          ...prev,
          name: selectedFile.name.replace(/\.(docx|doc)$/, ''),
        }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file || !formData.company_id || !formData.name) {
      toast({
        title: 'Missing information',
        description: 'Please fill in all required fields and select a file',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `company-letterheads/${formData.company_id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('letterheads')
        .upload(filePath, file);

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      const response = await fetch('/api/letterheads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: parseInt(formData.company_id),
          name: formData.name,
          description: formData.description || null,
          file_path: filePath,
          file_name: file.name,
          file_size: file.size,
          is_default: formData.is_default,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create letterhead record');
      }

      const createdLetterhead = await response.json();

      // Extract header/footer images for UI preview
      try {
        await fetch('/api/letterheads/extract-header-footer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            letterheadId: createdLetterhead.id,
            filePath: filePath,
          }),
        });
      } catch (previewError) {
        console.error('Header/footer extraction failed (non-critical):', previewError);
      }

      toast({
        title: 'Success',
        description: 'Letterhead uploaded successfully',
      });

      setFormData({
        company_id: '',
        name: '',
        description: '',
        is_default: false,
      });
      setFile(null);
      onSuccess();
    } catch (error) {
      console.error('Error uploading letterhead:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to upload letterhead',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Upload Letterhead</DialogTitle>
          <DialogDescription>
            Upload a Word document (.docx or .doc) to use as a company letterhead template
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company_id">
              Company <span className="text-destructive">*</span>
            </Label>
            <Select
              value={formData.company_id}
              onValueChange={(value) => setFormData(prev => ({ ...prev, company_id: value }))}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a company" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id.toString()}>
                    {company.company_name} {company.registration_number && `(${company.registration_number})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">
              Letterhead Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Default, Formal, International"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Optional description"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="file">
              Word Document <span className="text-destructive">*</span>
            </Label>
            <Input
              id="file"
              type="file"
              accept=".doc,.docx"
              onChange={handleFileChange}
              required
            />
            {file && (
              <p className="text-sm text-muted-foreground">
                Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_default"
              checked={formData.is_default}
              onCheckedChange={(checked) =>
                setFormData(prev => ({ ...prev, is_default: checked as boolean }))
              }
            />
            <Label htmlFor="is_default" className="cursor-pointer">
              Set as default letterhead for this company
            </Label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={uploading}>
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
