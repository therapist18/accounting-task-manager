'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Loader2, PlusCircle, Settings, Trash2, LayoutTemplate, Star,
  PanelLeftClose, PanelLeftOpen,
  PanelRightClose, PanelRightOpen, Columns2, FileText, BookText, Briefcase,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { CONTRACT_SECTIONS, defaultSectionKeys, type ContractSectionKey } from '../utils/contractStructure';
import {
  EcContractTemplate, fetchContractTemplates, createContractTemplate, updateContractTemplate, deleteContractTemplate,
} from '../utils/contractTemplateData';
import {
  ContractThemeSettings, DEFAULT_CONTRACT_THEME, DocumentTheme, BrandingStrategy,
  THEME_DEFAULTS, COLOR_PRESETS, applyThemeToHtml,
} from '../utils/themeEngine';
import { fetchCompanies, Company } from '../../companies/database';
import { CompaniesSidebar } from '../components/CompaniesSidebar';

const BRANDING_OPTIONS: { id: BrandingStrategy; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'theme_header', label: 'Theme Header' },
  { id: 'company_letterhead', label: 'Company Letterhead' },
  { id: 'embedded', label: 'Embedded' },
];

interface Draft {
  id?: string;
  name: string;
  companyId: string | null;
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

const PREVIEW_SAMPLE_HTML = `
<h1>EMPLOYMENT CONTRACT</h1>
<p>This Employment Contract ("Agreement") is entered into as of <strong>{{start_date}}</strong> by and between:</p>
<p><strong>{{company_name}}</strong> (hereinafter referred to as "the Employer") and <strong>{{employee_name}}</strong> (hereinafter referred to as "the Employee").</p>
<h2>1. Appointment</h2>
<p>The Employer hereby engages the Employee in the capacity of <strong>{{job_title}}</strong> in the <strong>{{department}}</strong> department, effective <strong>{{start_date}}</strong>.</p>
<h2>2. Working Hours</h2>
<p>The Employee shall work <strong>{{working_hours}}</strong> per week, Monday through <strong>{{working_days}}</strong>, between <strong>{{start_time}}</strong> and <strong>{{end_time}}</strong>.</p>
<h2>3. Remuneration</h2>
<p>The Employee shall receive a basic salary of <strong>{{currency}} {{basic_salary}}</strong> per month, payable on the <strong>{{payment_day}}</strong> of each month.</p>
<h2>4. Notice Period</h2>
<p>Either party may terminate this contract by giving <strong>{{notice_period}}</strong> written notice.</p>
<h2>5. Signatures</h2>
<div class="signature-block">
  <div class="signature-column"><div class="signature-line"></div><div class="signature-label">Employer</div></div>
  <div class="signature-column"><div class="signature-line"></div><div class="signature-label">Employee</div></div>
</div>
`;

export default function EmploymentContractTemplatesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<EcContractTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft(null));
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
  const editorPanelRef = useRef<ImperativePanelHandle>(null);
  const previewPanelRef = useRef<ImperativePanelHandle>(null);
  const [collapsed, setCollapsed] = useState({ sidebar: false, editor: false, preview: false });

  const togglePanel = (key: keyof typeof collapsed) => {
    const ref = key === 'sidebar' ? sidebarPanelRef : key === 'editor' ? editorPanelRef : previewPanelRef;
    const panel = ref.current;
    if (!panel) return;
    if (panel.isCollapsed()) panel.expand(); else panel.collapse();
  };

  useEffect(() => {
    (async () => {
      const comps = await fetchCompanies();
      setCompanies(comps);
      if (comps.length > 0) setSelectedCompanyId(String(comps[0].id));
    })();
  }, []);

  const load = async () => {
    setIsLoading(true);
    setTemplates(await fetchContractTemplates());
    setIsLoading(false);
  };

  useEffect(() => { load(); }, []);

  const companyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of templates) {
      if (t.company_id) counts[t.company_id] = (counts[t.company_id] || 0) + 1;
    }
    return counts;
  }, [templates]);

  const companyTemplates = useMemo(() =>
    templates.filter((t) => t.company_id === selectedCompanyId),
    [templates, selectedCompanyId]
  );

  const platformTemplates = useMemo(() =>
    templates.filter((t) => !t.company_id),
    [templates]
  );

  const openNew = (scope: 'company' | 'platform') => {
    setDraft(emptyDraft(scope === 'company' ? selectedCompanyId : null));
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

  const previewHtml = useMemo(() => {
    if (!draft.id && !dialogOpen) return '';
    const themed = applyThemeToHtml(PREVIEW_SAMPLE_HTML, draft.themeSettings);
    return themed;
  }, [draft.themeSettings, dialogOpen]);

  const selectedCompany = useMemo(() =>
    companies.find(c => String(c.id) === selectedCompanyId) || null,
    [companies, selectedCompanyId]
  );

  const renderCard = (template: EcContractTemplate) => (
    <Card
      key={template.id}
      onClick={() => openEdit(template)}
      className="cursor-pointer border border-slate-100 dark:border-slate-800 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden"
    >
      <CardHeader className="p-4">
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
        <CardDescription className="flex flex-col gap-2 pt-2">
          <div className="flex flex-wrap gap-1">
            {template.is_default && (
              <Badge variant="outline" className="text-[10px] font-semibold bg-amber-50 text-amber-700 border-amber-200 rounded-full px-2 py-0.5 flex items-center gap-1">
                <Star className="h-2.5 w-2.5" fill="currentColor" /> Default
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] font-semibold bg-blue-50 text-blue-700 border-blue-200 rounded-full px-2 py-0.5">
              {THEME_DEFAULTS[template.theme_settings?.theme as DocumentTheme]?.label || template.theme_settings?.theme}
            </Badge>
            <Badge variant="outline" className="text-[10px] font-semibold bg-slate-50 text-slate-600 border-slate-200 rounded-full px-2 py-0.5">
              {template.section_keys?.length || 0} / {CONTRACT_SECTIONS.length}
            </Badge>
          </div>
        </CardDescription>
      </CardHeader>
    </Card>
  );

  return (
    <div className="max-h-[calc(100vh-1rem)] w-full overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100">Contract Templates</h1>
          <div className="flex items-center gap-1 border-l border-slate-200 dark:border-slate-800 pl-3">
            <button
              onClick={() => togglePanel('sidebar')}
              title={collapsed.sidebar ? 'Show entities panel' : 'Hide entities panel'}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                collapsed.sidebar ? "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" : "text-custom-blue bg-blue-50 dark:bg-blue-900/20"
              )}
            >
              {collapsed.sidebar ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
            <button
              onClick={() => togglePanel('editor')}
              title={collapsed.editor ? 'Show templates panel' : 'Hide templates panel'}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                collapsed.editor ? "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" : "text-custom-blue bg-blue-50 dark:bg-blue-900/20"
              )}
            >
              <Columns2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => togglePanel('preview')}
              title={collapsed.preview ? 'Show preview panel' : 'Hide preview panel'}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                collapsed.preview ? "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" : "text-custom-blue bg-blue-50 dark:bg-blue-900/20"
              )}
            >
              {collapsed.preview ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href="/dashboard/employment-contracts"
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Back to Contracts
          </Link>
          <Link
            href="/dashboard/employment-contracts/clause-library"
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <BookText className="w-3.5 h-3.5" />
            Clauses
          </Link>
          <Link
            href="/dashboard/employment-contracts/job-profiles"
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Briefcase className="w-3.5 h-3.5" />
            Job Profiles
          </Link>
        </div>
      </div>

      <PanelGroup direction="horizontal" className="h-full w-full">
        {/* LEFT PANEL: Companies sidebar */}
        <Panel
          ref={sidebarPanelRef}
          defaultSize={18}
          minSize={14}
          maxSize={28}
          collapsible
          collapsedSize={0}
          onCollapse={() => setCollapsed(prev => ({ ...prev, sidebar: true }))}
          onExpand={() => setCollapsed(prev => ({ ...prev, sidebar: false }))}
          className="bg-white dark:bg-slate-900 flex flex-col z-10 overflow-auto"
        >
          <CompaniesSidebar
            companies={companies}
            selectedCompanyId={selectedCompanyId === null ? '__platform__' : selectedCompanyId}
            onSelectCompany={(id) => setSelectedCompanyId(id === '__platform__' ? null : id)}
            topItems={[{ id: '__platform__', label: 'Platform Defaults', count: platformTemplates.length }]}
            companyCounts={companyCounts}
            subtitle="Manage contract templates"
          />
        </Panel>

        <PanelResizeHandle className="w-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-blue-400 dark:hover:bg-blue-500 transition-colors cursor-col-resize z-20" />

        {/* CENTER PANEL: Template list & management */}
        <Panel
          ref={editorPanelRef}
          defaultSize={50}
          minSize={30}
          collapsible
          collapsedSize={0}
          onCollapse={() => setCollapsed(prev => ({ ...prev, editor: true }))}
          onExpand={() => setCollapsed(prev => ({ ...prev, editor: false }))}
          className="bg-slate-50 dark:bg-slate-950 flex flex-col z-10 !overflow-auto"
        >
          <div className="flex flex-col h-full">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <LayoutTemplate className="w-4 h-4 text-custom-blue" />
                  {selectedCompanyId ? selectedCompany?.company_name || 'Company' : 'Platform Defaults'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedCompanyId ? 'Company-specific contract templates' : 'Platform-wide default templates'}
                </p>
              </div>
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={() => openNew(selectedCompanyId ? 'company' : 'platform')}
              >
                <PlusCircle className="h-3.5 w-3.5 mr-1.5" /> New Template
              </Button>
            </div>

            <ScrollArea className="flex-1 p-4">
              {isLoading ? (
                <div className="flex justify-center items-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {selectedCompanyId === null ? (
                    platformTemplates.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-dashed rounded-2xl border-slate-200 dark:border-slate-800">
                        <LayoutTemplate className="h-10 w-10 text-slate-300 mb-3" />
                        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">No platform default templates</h3>
                        <p className="text-xs text-slate-500 mt-1">Companies without their own template fall back to a platform default.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {platformTemplates.map(renderCard)}
                      </div>
                    )
                  ) : companyTemplates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-dashed rounded-2xl border-slate-200 dark:border-slate-800">
                      <LayoutTemplate className="h-10 w-10 text-slate-300 mb-3" />
                      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">No templates for this company</h3>
                      <p className="text-xs text-slate-500 mt-1">Falls back to a Platform Default template if one exists.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {companyTemplates.map(renderCard)}
                    </div>
                  )}
                </>
              )}
            </ScrollArea>
          </div>
        </Panel>

        <PanelResizeHandle className="w-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-blue-400 dark:hover:bg-blue-500 transition-colors cursor-col-resize z-20" />

        {/* RIGHT PANEL: Theme preview */}
        <Panel
          ref={previewPanelRef}
          defaultSize={32}
          minSize={22}
          collapsible
          collapsedSize={0}
          onCollapse={() => setCollapsed(prev => ({ ...prev, preview: true }))}
          onExpand={() => setCollapsed(prev => ({ ...prev, preview: false }))}
          className="bg-slate-100 dark:bg-slate-900 flex flex-col z-10 border-l border-slate-200 dark:border-slate-800 !overflow-auto"
        >
          <div className="flex flex-col h-full">
            <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <FileText className="w-4 h-4 text-custom-blue" />
                Theme Preview
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">Preview of the selected template's theme</p>
            </div>
            <div className="flex-1 overflow-auto p-3">
              {dialogOpen && previewHtml ? (
                <div
                  className="bg-white rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <FileText className="w-10 h-10 text-slate-300 mb-3" />
                  <p className="text-xs text-slate-500">Open a template editor to preview its theme</p>
                </div>
              )}
            </div>
          </div>
        </Panel>
      </PanelGroup>

      {/* Template Editor Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col rounded-2xl p-0">
          <DialogHeader className="sticky top-0 z-10 bg-white dark:bg-slate-900 px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-800 rounded-t-2xl">
            <DialogTitle className="text-base font-bold">{draft.id ? 'Edit Template' : 'New Template'}</DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 overflow-auto px-6 py-4">
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

          <div className="px-6 pb-6 pt-2 border-t border-slate-200 dark:border-slate-800">
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {draft.id ? 'Save changes' : 'Create template'}
              </Button>
            </DialogFooter>
          </div>
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
