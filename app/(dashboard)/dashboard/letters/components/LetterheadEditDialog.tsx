'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save } from 'lucide-react';

interface Letterhead {
  id: string;
  company_id: number;
  name: string;
  description?: string;
  file_path: string;
  file_name: string;
  contact_details?: any;
  is_default: boolean;
  is_active: boolean;
}

interface LetterheadEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  letterhead: Letterhead;
  onSuccess: () => void;
}

export function LetterheadEditDialog({ open, onOpenChange, letterhead, onSuccess }: LetterheadEditDialogProps) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    contact_details: {
      phone: '',
      email: '',
      address: '',
      website: '',
    },
  });
  const { toast } = useToast();

  useEffect(() => {
    if (letterhead) {
      setFormData({
        name: letterhead.name,
        description: letterhead.description || '',
        contact_details: {
          phone: letterhead.contact_details?.phone || '',
          email: letterhead.contact_details?.email || '',
          address: letterhead.contact_details?.address || '',
          website: letterhead.contact_details?.website || '',
        },
      });
    }
  }, [letterhead]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name) {
      toast({
        title: 'Missing information',
        description: 'Please provide a letterhead name',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);

    try {
      const response = await fetch('/api/letterheads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: letterhead.id,
          name: formData.name,
          description: formData.description || null,
          contact_details: formData.contact_details,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update letterhead');
      }

      toast({
        title: 'Success',
        description: 'Letterhead updated successfully',
      });

      onSuccess();
    } catch (error) {
      console.error('Error updating letterhead:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update letterhead',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Letterhead</DialogTitle>
          <DialogDescription>
            Update letterhead details and contact information
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit_name">
              Letterhead Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="edit_name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Default, Formal, International"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit_description">Description</Label>
            <Textarea
              id="edit_description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Optional description"
              rows={2}
            />
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-medium mb-3">Contact Details (Optional)</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_phone">Phone</Label>
                <Input
                  id="edit_phone"
                  value={formData.contact_details.phone}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    contact_details: { ...prev.contact_details, phone: e.target.value }
                  }))}
                  placeholder="+254 700 000 000"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit_email">Email</Label>
                <Input
                  id="edit_email"
                  type="email"
                  value={formData.contact_details.email}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    contact_details: { ...prev.contact_details, email: e.target.value }
                  }))}
                  placeholder="info@company.com"
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="edit_address">Address</Label>
                <Textarea
                  id="edit_address"
                  value={formData.contact_details.address}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    contact_details: { ...prev.contact_details, address: e.target.value }
                  }))}
                  placeholder="Company address"
                  rows={2}
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="edit_website">Website</Label>
                <Input
                  id="edit_website"
                  value={formData.contact_details.website}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    contact_details: { ...prev.contact_details, website: e.target.value }
                  }))}
                  placeholder="https://www.company.com"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
