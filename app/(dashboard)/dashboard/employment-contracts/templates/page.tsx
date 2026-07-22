'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, PlusCircle, Settings, Trash2, LayoutTemplate, Star } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { CONTRACT_SECTIONS, defaultSectionKeys, type ContractSectionKey } from '../utils/contractStructure';
import {
  EcContractTemplate, fetchContractTemplates, createContractTemplate, updateContractTemplate, deleteContractTemplate,
} from '../utils/contractTemplateData';
import {
  ContractThemeSettings, DEFAULT_CONTRACT_THEME, DocumentTheme, BrandingStrategy, THEME_DEFAULTS, COLOR_PRESETS,
} from '../utils/themeEngine';
import { fetchCompanies, Company } from '../../companies/database';

const BRANDING_OPTIONS: { id: BrandingStrategy; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'theme_header', label: 'Theme Header' },
  { id: 'company_letterhead', label: 'Company Letterhead' },
  { id: 'embedded', label: 'Embedded' },
];

interface Draft {
  id?: string;
  name: string;
  companyId: string | null; // null = platform default
  sectionKeys: ContractSectionKey[];
  themeSettings: ContractThemeSettings;
  brandingStrategy: BrandingStrategy;
  isDefault: boolean;
}

function emptyDraft(companyId: string | null): Draft {
  return {
    name: '',
    companyId,
    sectionKeys: defaultSectionKeys(),
    themeSettings: DEFAULT_CONTRACT_THEME,
    brandingStrategy: 'theme_header',
    isDefault: false,
  };
}

export default function EmploymentContractTemplatesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string>('');
  const [templates, setTemplates] = useState<EcContractTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft(null));
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const comps = await fetchCompanies();
      setCompanies(comps);
      if (comps.length > 0) setCompanyId(String(comps[0].id));
    })();
  }, []);

  const load = async () => {
    setIsLoading(true);
    setTemplates(await fetchContractTemplates());
    setIsLoading(false);
  };

  useEffect(() => { load(); }, []);

  const companyTemplates = useMemo(() => templates.filter((t) => t.company_id === companyId), [templates, companyId]);
  const platformTemplates = useMemo(() => templates.filter((t) => !t.company_id), [templates]);

  const openNew = (scope: 'company' | 'platform') => {
    setDraft(emptyDraft(scope === 'company' ? companyId : null));
    setDialogOpen(true);
  };

  const openEdit = (template: EcContractTemplate) => {
    setDraft({
      id: template.id,
      name: template.name,
      companyId: template.company_id,
      sectionKeys: template.section_keys,
      themeSettings: template.theme_settings,
      brandingStrategy: template.branding_strategy,
      isDefault: template.is_default,
    });
    setDialogOpen(true);
  };

  const toggleSection = (key: ContractSectionKey) => {
    setDraft((d) => ({
      ...d,
      sectionKeys: d.sectionKeys.includes(key) ? d.sectionKeys.filter((k) => k !== key) : [...d.sectionKeys, key],
    }));
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    if (draft.sectionKeys.length === 0) {
      toast({ title: 'Select at least one section', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload: Partial<EcContractTemplate> = {
      name: draft.name.trim(),
      company_id: draft.companyId,
      section_keys: draft.sectionKeys,
      theme_settings: draft.themeSettings,
      branding_strategy: draft.brandingStrategy,
      is_default: draft.isDefault,
    };
    try {
      if (draft.id) {
        await updateContractTemplate(draft.id, payload);
        toast({ title: 'Template updated' });
      } else {
        await createContractTemplate(payload);
        toast({ title: 'Template created' });
      }
      setDialogOpen(false);
      await load();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to save template', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await deleteContractTemplate(id);
    if (ok) {
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      toast({ title: 'Template deleted' });
    } else {
      toast({ title: 'Error', description: 'Failed to delete template', variant: 'destructive' });
    }
  };

  const renderCard = (template: EcContractTemplate) => (
    <Card
      key={template.id}
      onClick={() => openEdit(template)}
      className="cursor-pointer border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden"
    >
      <CardHeader className="p-5">
        <CardTitle className="flex justify-between items-start gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
          <span className="flex items-center gap-2 min-w-0">
            <LayoutTemplate className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="truncate">{template.name}</span>
          </span>
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-50" onClick={(e) => { e.stopPropagation(); openEdit(template); }}>
              <Settings className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); setDeletingId(template.id); }}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardTitle>
        <CardDescription className="flex flex-col gap-3 pt-2">
          <div className="flex flex-wrap gap-1.5">
            {template.is_default && (
              <Badge variant="outline" className="text-[10px] font-semibold bg-amber-50 text-amber-700 border-amber-200 rounded-full px-2 py-0.5 flex items-center gap-1">
                <Star className="h-2.5 w-2.5" fill="currentColor" /> Default
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] font-semibold bg-blue-50 text-blue-700 border-blue-200 rounded-full px-2 py-0.5">
              {THEME_DEFAULTS[template.theme_settings?.theme as DocumentTheme]?.label || template.theme_settings?.theme}
            </Badge>
            <Badge variant="outline" className="text-[10px] font-semibold bg-slate-50 text-slate-600 border-slate-200 rounded-full px-2 py-0.5">
              {template.section_keys?.length || 0} / {CONTRACT_SECTIONS.length} sections
            </Badge>
          </div>
        </CardDescription>
      </CardHeader>
    </Card>
  );

  return (
    <div className="h-[calc(100vh-2rem)] w-full overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 gap-4">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Contract Templates</h1>
          <p className="text-xs text-slate-500">Theme and section layout used when generating an employment contract</p>
        </div>
        <Select value={companyId} onValueChange={setCompanyId}>
          <SelectTrigger className="h-9 w-64 shrink-0"><SelectValue placeholder="Select company..." /></SelectTrigger>
          <SelectContent>
            {companies.map((c) => (
              <SelectItem key={String(c.id)} value={String(c.id)}>{c.company_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-6">
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs defaultValue="company">
              <TabsList className="bg-slate-100 dark:bg-slate-800 mb-4">
                <TabsTrigger value="company" className="text-xs">This Company</TabsTrigger>
                <TabsTrigger value="platform" className="text-xs">Platform Defaults</TabsTrigger>
              </TabsList>

              <TabsContent value="company">
                <div className="flex justify-end mb-3">
                  <Button size="sm" className="h-8 text-xs" onClick={() => openNew('company')} disabled={!companyId}>
                    <PlusCircle className="h-3.5 w-3.5 mr-1.5" /> New Template
                  </Button>
                </div>
                {companyTemplates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-dashed rounded-2xl border-slate-200 dark:border-slate-800">
                    <LayoutTemplate className="h-10 w-10 text-slate-300 mb-3" />
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">No templates for this company</h3>
                    <p className="text-xs text-slate-500 mt-1">Falls back to a Platform Default template if one exists.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {companyTemplates.map(renderCard)}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="platform">
                <div className="flex justify-end mb-3">
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openNew('platform')}>
                    <PlusCircle className="h-3.5 w-3.5 mr-1.5" /> New Platform Template
                  </Button>
                </div>
                {platformTemplates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-dashed rounded-2xl border-slate-200 dark:border-slate-800">
                    <LayoutTemplate className="h-10 w-10 text-slate-300 mb-3" />
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">No platform default yet</h3>
                    <p className="text-xs text-slate-500 mt-1">Companies without their own template need one of these to generate contracts.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {platformTemplates.map(renderCard)}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </ScrollArea>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">{draft.id ? 'Edit Template' : 'New Template'}</DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-5 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Name</Label>
                  <Input className="h-9" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Standard Contract" />
                </div>
                <div className="flex items-center justify-between border border-slate-200 dark:border-slate-800 rounded-lg px-3 h-9 mt-[22px]">
                  <Label className="text-xs">Default in scope</Label>
                  <Switch checked={draft.isDefault} onCheckedChange={(v) => setDraft({ ...draft, isDefault: v })} />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-600">Sections included</Label>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                  {CONTRACT_SECTIONS.map((section) => (
                    <label key={section.key} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                      <Checkbox checked={draft.sectionKeys.includes(section.key)} onCheckedChange={() => toggleSection(section.key)} />
                      {section.title}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-600">Theme</Label>
                <div className="grid grid-cols-2 gap-4">
                  <Select
                    value={draft.themeSettings.theme}
                    onValueChange={(v) => setDraft({ ...draft, themeSettings: { ...draft.themeSettings, theme: v as DocumentTheme } })}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(THEME_DEFAULTS) as DocumentTheme[]).map((id) => (
                        <SelectItem key={id} value={id}>{THEME_DEFAULTS[id].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={draft.brandingStrategy}
                    onValueChange={(v) => setDraft({ ...draft, brandingStrategy: v as BrandingStrategy })}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BRANDING_OPTIONS.map((opt) => (
                        <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {COLOR_PRESETS.map((preset) => {
                    const isActive = draft.themeSettings.primaryColor === preset.primary && draft.themeSettings.accentColor === preset.accent;
                    return (
                      <button
                        key={preset.name}
                        type="button"
                        title={preset.name}
                        onClick={() => setDraft({ ...draft, themeSettings: { ...draft.themeSettings, primaryColor: preset.primary, accentColor: preset.accent } })}
                        className="relative w-full aspect-square rounded-lg border-2 transition-all hover:scale-105"
                        style={{ background: `linear-gradient(135deg, ${preset.primary} 50%, ${preset.accent} 50%)`, borderColor: isActive ? '#376bae' : 'transparent' }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {draft.id ? 'Save changes' : 'Create template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent className="rounded-2xl max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-slate-800">Are you sure?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-500">
              This will permanently delete this template. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-4">
            <AlertDialogCancel className="h-9 px-4 rounded-full text-xs font-semibold">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deletingId) handleDelete(deletingId); setDeletingId(null); }}
              className="h-9 px-4 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-md shadow-red-500/10 border-0"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
