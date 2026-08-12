'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/lib/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Loader2, Save, Download, FileText, Image as ImageIcon, X } from 'lucide-react';
import { fetchCompanies, type Company } from '../../companies/database';
import { supabase } from '@/lib/supabase/client';
import { LetterheadThemePreview } from './LetterheadThemePreview';
import { ContractThemeEditor } from '../../employment-contracts/components/ContractThemePanel';
import { DEFAULT_GENERAL_LETTER_THEME, type GeneralLetterThemeSettings } from '../utils/letterThemeEngine';
import {
  resolveCompanyGeneralEmail,
  resolveCompanyPhone,
  resolveCompanyKraPin,
  getBclContactDetails,
} from '../utils/contactDetails';
import { fetchCompanyLogoUrl } from '../utils/companyLogo';
import { buildLetterheadDocxBlob, fetchImageBytesForLetterhead } from '../utils/letterheadThemeBuilder';
import { saveAs } from 'file-saver';

type LogoMode = 'none' | 'company' | 'upload';

interface LetterheadBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  preselectedCompanyId?: string;
}

export function LetterheadBuilderDialog({ open, onOpenChange, onSuccess, preselectedCompanyId }: LetterheadBuilderDialogProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [themeSettings, setThemeSettings] = useState<GeneralLetterThemeSettings>(DEFAULT_GENERAL_LETTER_THEME);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  const [entityName, setEntityName] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [kraPin, setKraPin] = useState('');
  const [regNumber, setRegNumber] = useState('');

  const [logoMode, setLogoMode] = useState<LogoMode>('none');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [resolvingLogo, setResolvingLogo] = useState(false);

  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState<'word' | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    fetchCompanies().then(setCompanies).catch(() => {});
    if (preselectedCompanyId) setCompanyId(preselectedCompanyId);
  }, [open, preselectedCompanyId]);

  // Prefill editable overrides from the selected company's own record -
  // still fully editable afterward, since a letterhead often needs a
  // different address/contact than whatever's on file.
  useEffect(() => {
    if (!companyId) return;
    const company = companies.find((c) => String(c.id) === companyId);
    if (!company) return;
    const bcl = getBclContactDetails();
    setEntityName(company.company_name || '');
    setAddressLine1(bcl.addressLine1);
    setAddressLine2(bcl.addressLine2);
    setPhone(resolveCompanyPhone(company, bcl.phone));
    setEmail(resolveCompanyGeneralEmail(company));
    setKraPin(resolveCompanyKraPin(company));
    setRegNumber(company.registration_number || '');
    if (!name) setName(`${company.company_name} Letterhead`);
    setLogoMode('none');
    setLogoUrl(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, companies]);

  const handleLogoModeChange = async (mode: LogoMode) => {
    setLogoMode(mode);
    if (mode === 'company') {
      if (!companyId) return;
      setResolvingLogo(true);
      const url = await fetchCompanyLogoUrl(companyId);
      setResolvingLogo(false);
      if (!url) {
        toast({ title: 'No company logo found', description: 'This company has no logo on file. Upload one instead, or continue without a logo.', variant: 'destructive' });
        setLogoMode('none');
        return;
      }
      setLogoUrl(url);
    } else if (mode === 'none') {
      setLogoUrl(null);
    }
  };

  const handleLogoFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogoUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const buildBlob = async (): Promise<Blob> => {
    const logo = logoMode === 'none' || !logoUrl ? null : await fetchImageBytesForLetterhead(logoUrl);
    return buildLetterheadDocxBlob({
      themeSettings, entityName, addressLine1, addressLine2, phone, email, kraPin, regNumber, logo,
    });
  };

  const handleDownloadWord = async () => {
    if (!entityName) {
      toast({ title: 'Company name required', variant: 'destructive' });
      return;
    }
    setDownloading('word');
    try {
      const blob = await buildBlob();
      saveAs(blob, `${(name || entityName).replace(/[^\w\s-]/g, '_')}.docx`);
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to build Word document', variant: 'destructive' });
    } finally {
      setDownloading(null);
    }
  };

  // Uses the browser's native print pipeline (window.print -> "Save as PDF"),
  // the same approach the employment-contracts module uses instead of
  // rasterizing the preview with html2canvas/html2pdf - see the .lh-print-area
  // portal below. Real vector/selectable text, correct margins via @page,
  // no image conversion.
  const handleDownloadPdf = () => {
    if (!entityName) {
      toast({ title: 'Company name required', variant: 'destructive' });
      return;
    }
    window.print();
  };

  const resetForm = () => {
    setCompanyId('');
    setName('');
    setDescription('');
    setIsDefault(false);
    setLogoMode('none');
    setLogoUrl(null);
  };

  const handleSave = async () => {
    if (!companyId || !name.trim() || !entityName.trim()) {
      toast({ title: 'Missing information', description: 'Please select a company and give the letterhead a name.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const blob = await buildBlob();
      const fileName = `${name.trim()}.docx`;
      const filePath = `company-letterheads/${companyId}/${Date.now()}-${Math.random().toString(36).substring(7)}.docx`;

      const { error: uploadError } = await supabase.storage.from('letterheads').upload(filePath, blob, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const response = await fetch('/api/letterheads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: parseInt(companyId),
          name: name.trim(),
          description: description || null,
          file_path: filePath,
          file_name: fileName,
          file_size: blob.size,
          is_default: isDefault,
        }),
      });
      if (!response.ok) throw new Error('Failed to create letterhead record');
      const created = await response.json();

      try {
        await fetch('/api/letterheads/extract-header-footer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ letterheadId: created.id, filePath }),
        });
      } catch {
        // non-critical preview extraction - ignore failures
      }

      toast({ title: 'Success', description: 'Letterhead built and saved successfully' });
      resetForm();
      onSuccess();
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to save letterhead', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || downloading !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-7xl w-[95vw] h-[92vh] max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Build a Letterhead</DialogTitle>
          <DialogDescription>
            Pick a theme, confirm the company details, and save it as a ready-to-use letterhead - no Word design skills required.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 flex-1 min-h-0">
          <ScrollArea className="pr-3 max-h-[65vh] lg:max-h-none lg:h-full">
            <div className="space-y-5 pb-2">
              <div className="space-y-2">
                <Label>Company <span className="text-destructive">*</span></Label>
                <Select value={companyId} onValueChange={setCompanyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a company" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.company_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Theme</Label>
                {/* Same 8-preset editor (Theme/Color/Font/Header tabs) as the
                    live letter composer's theme panel - see
                    utils/letterThemeEngine.ts. */}
                <div className="rounded-lg border border-border overflow-hidden">
                  <ContractThemeEditor settings={themeSettings} onChange={setThemeSettings} variant="inline" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Letterhead Name <span className="text-destructive">*</span></Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Default, Formal" />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional description" />
              </div>

              <div className="space-y-2">
                <Label>Logo</Label>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant={logoMode === 'none' ? 'default' : 'outline'} onClick={() => handleLogoModeChange('none')}>
                    None
                  </Button>
                  <Button type="button" size="sm" variant={logoMode === 'company' ? 'default' : 'outline'} onClick={() => handleLogoModeChange('company')} disabled={!companyId || resolvingLogo}>
                    {resolvingLogo ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5 mr-1.5" />}
                    Use company logo
                  </Button>
                  <label className={cn('inline-flex items-center gap-1.5 text-xs font-medium rounded-md border px-3 py-1.5 cursor-pointer', logoMode === 'upload' ? 'border-primary ring-1 ring-primary' : 'border-border hover:bg-muted')}>
                    <ImageIcon className="h-3.5 w-3.5" />
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { setLogoMode('upload'); handleLogoFile(e.target.files?.[0] || null); }}
                    />
                  </label>
                </div>
                {logoMode !== 'none' && logoUrl && (
                  <div className="flex items-center gap-2 mt-1">
                    <img src={logoUrl} alt="Logo preview" className="h-8 w-8 object-contain rounded border" />
                    <button type="button" onClick={() => handleLogoModeChange('none')} className="text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Address Line 1</Label>
                  <Input value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Address Line 2</Label>
                  <Input value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>KRA PIN</Label>
                  <Input value={kraPin} onChange={(e) => setKraPin(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Reg. Number</Label>
                  <Input value={regNumber} onChange={(e) => setRegNumber(e.target.value)} />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox id="lh-is-default" checked={isDefault} onCheckedChange={(c) => setIsDefault(c as boolean)} />
                <Label htmlFor="lh-is-default" className="cursor-pointer">Set as default letterhead for this company</Label>
              </div>
            </div>
          </ScrollArea>

          <div className="min-h-0 overflow-auto bg-muted/30 rounded-xl p-8 flex items-start justify-center">
            <div id="letterhead-builder-preview" className="w-full max-w-2xl bg-white">
              <LetterheadThemePreview
                themeSettings={themeSettings}
                entityName={entityName}
                addressLine1={addressLine1}
                addressLine2={addressLine2}
                phone={phone}
                email={email}
                kraPin={kraPin}
                regNumber={regNumber}
                logoUrl={logoUrl}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button type="button" variant="outline" onClick={handleDownloadWord} disabled={busy}>
            {downloading === 'word' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
            Word
          </Button>
          <Button type="button" variant="outline" onClick={handleDownloadPdf} disabled={busy}>
            <Download className="h-4 w-4 mr-2" />
            PDF
          </Button>
          <Button type="button" onClick={handleSave} disabled={busy}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Letterhead
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Print-only copy, portaled to document.body so Dialog's own overlay/
          transform/overflow context can't clip it during window.print() -
          same technique as employment-contracts/ContractPreview.tsx's
          .ec-print-area. Kept mounted (hidden via CSS, not conditionally
          rendered) whenever the dialog is open so window.print() from the
          footer button always has something to print. */}
      {open && typeof document !== 'undefined' && createPortal(
        <>
          <style>{`
            @media print {
              @page { size: A4; margin: 0.5in; }
              html, body { margin: 0; height: auto !important; overflow: visible !important; }
              body > *:not(.lh-print-area) { visibility: hidden !important; }
              .lh-print-area, .lh-print-area * { visibility: visible !important; }
              .lh-print-area {
                position: absolute !important;
                top: 0; left: 0;
                width: 100% !important;
                height: auto !important;
                margin: 0;
                overflow: visible !important;
              }
              .lh-print-area > div {
                border: none !important;
                box-shadow: none !important;
                border-radius: 0 !important;
              }
            }
          `}</style>
          <div className="hidden print:block lh-print-area bg-white text-black">
            <LetterheadThemePreview
              themeSettings={themeSettings}
              entityName={entityName}
              addressLine1={addressLine1}
              addressLine2={addressLine2}
              phone={phone}
              email={email}
              kraPin={kraPin}
              regNumber={regNumber}
              logoUrl={logoUrl}
            />
          </div>
        </>,
        document.body
      )}
    </Dialog>
  );
}
