'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Columns2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CompaniesSidebar } from './components/CompaniesSidebar';
import { DataValuesPanel } from './components/DataValuesPanel';
import { ContractPreview } from './components/ContractPreview';
import { fetchCompanies, Company } from '../companies/database';
import { fetchDefaultTemplate, updateTemplate, CcTemplate } from './utils/ccTemplate';
import { fetchPlaceholders, EcPlaceholder } from '../employment-contracts/utils/ecPlaceholders';
import { resolveEcPlaceholderValues } from '../employment-contracts/utils/masterFieldResolver';
import { detectTokens } from './utils/placeholderDetection';
import { fetchLatestEngagement, createEngagement, updateEngagement, CcEngagement } from './utils/ccEngagements';
import { ContractThemeSettings, DEFAULT_CONTRACT_THEME } from './utils/themeEngine';
import { useCompanyDirectors } from './hooks/useCompanyDirectors';
import type { JobField } from '../master-fields/components/types/database';

export default function ConsultancyContractsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [template, setTemplate] = useState<CcTemplate | null>(null);
  const [allPlaceholders, setAllPlaceholders] = useState<EcPlaceholder[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const [resolvedValues, setResolvedValues] = useState<Record<string, string>>({});
  const [masterFields, setMasterFields] = useState<Map<number, JobField>>(new Map());
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [engagement, setEngagement] = useState<CcEngagement | null>(null);
  const [engagementStatuses, setEngagementStatuses] = useState<Record<string, 'draft' | 'active' | 'superseded'>>({});
  const [selectedDirectorIds, setSelectedDirectorIds] = useState<string[]>([]);
  const { directors } = useCompanyDirectors(selectedCompanyId);
  const selectedDirectors = useMemo(
    () => directors.filter((d) => selectedDirectorIds.includes(d.id)),
    [directors, selectedDirectorIds]
  );

  const [loadingCompanyData, setLoadingCompanyData] = useState(false);
  const [saving, setSaving] = useState(false);

  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
  const dataPanelRef = useRef<ImperativePanelHandle>(null);
  const previewPanelRef = useRef<ImperativePanelHandle>(null);
  const [collapsed, setCollapsed] = useState({ sidebar: false, data: false, preview: false });

  const togglePanel = (key: keyof typeof collapsed) => {
    const ref = key === 'sidebar' ? sidebarPanelRef : key === 'data' ? dataPanelRef : previewPanelRef;
    const panel = ref.current;
    if (!panel) return;
    if (panel.isCollapsed()) panel.expand(); else panel.collapse();
  };

  // Platform-wide data: companies, the one standard template, the
  // placeholder registry - loaded once, independent of company selection.
  useEffect(() => {
    (async () => {
      const [companyList, tmpl, ph] = await Promise.all([
        fetchCompanies(),
        fetchDefaultTemplate(),
        fetchPlaceholders(),
      ]);
      setCompanies(companyList);
      setTemplate(tmpl);
      setAllPlaceholders(ph);
    })();
  }, []);

  // ec_placeholders is a shared, module-wide registry (see the note in
  // 20260813000000_consultancy_contract_engine.sql) - narrow it down to just
  // the tokens this contract's template actually uses, so Data & Values
  // doesn't get flooded with Employment Contracts' own working-hours/leave/
  // benefits placeholders.
  const relevantKeys = useMemo(() => new Set(detectTokens(template?.content || '')), [template]);
  const placeholders = useMemo(
    () => allPlaceholders.filter((p) => relevantKeys.has(p.key)),
    [allPlaceholders, relevantKeys]
  );

  // Per-company: resolve master-field-sourced values and load any saved
  // engagement (overrides + status) for the selected client.
  useEffect(() => {
    if (!selectedCompanyId || placeholders.length === 0) {
      setResolvedValues({});
      setMasterFields(new Map());
      setOverrides({});
      setEngagement(null);
      setSelectedDirectorIds([]);
      return;
    }
    let cancelled = false;
    setLoadingCompanyData(true);
    (async () => {
      const [{ values, masterFields: fields }, existingEngagement] = await Promise.all([
        resolveEcPlaceholderValues(placeholders, null, selectedCompanyId),
        fetchLatestEngagement(selectedCompanyId),
      ]);
      if (cancelled) return;
      setResolvedValues(values);
      setMasterFields(fields);
      setOverrides(existingEngagement?.placeholder_overrides || {});
      setEngagement(existingEngagement);
      // A saved engagement's own selection wins; a brand-new engagement has
      // no saved selection yet (undefined, not an empty array) so the
      // default-to-all-directors effect below can still populate it once the
      // company's directors have loaded.
      setSelectedDirectorIds(existingEngagement?.selected_director_ids || []);
      if (existingEngagement) {
        setEngagementStatuses((prev) => ({ ...prev, [selectedCompanyId]: existingEngagement.status }));
      }
      setLoadingCompanyData(false);
    })();
    return () => { cancelled = true; };
  }, [selectedCompanyId, placeholders]);

  // Manual "refresh source data" trigger - re-resolves master-field values
  // for the current company without touching overrides/engagement/directors,
  // for MasterFieldEditControl's onSaved callback (DataValuesPanel.tsx) after
  // an inline edit writes a new value back to its source record.
  const handleRefreshMasterFieldValues = async () => {
    if (!selectedCompanyId || placeholders.length === 0) return;
    const { values, masterFields: fields } = await resolveEcPlaceholderValues(placeholders, null, selectedCompanyId);
    setResolvedValues(values);
    setMasterFields(fields);
  };

  // New engagement (nothing saved yet) for this company: default the
  // Directors picker to everyone who qualifies, since a signed acknowledgement
  // normally names every director/shareholder rather than none. Only fires
  // when there's no engagement row at all - once one exists (even with an
  // empty selection the admin deliberately cleared), its own value is
  // authoritative and this must not overwrite it.
  useEffect(() => {
    if (!selectedCompanyId || engagement || directors.length === 0) return;
    setSelectedDirectorIds((prev) => (prev.length > 0 ? prev : directors.map((d) => d.id)));
  }, [selectedCompanyId, engagement, directors]);

  const handleOverrideChange = (key: string, value: string | undefined) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  // Persisted on cc_templates.theme_settings - a platform-wide choice, not
  // per-company, matching the "one standard format" design. Reuses
  // Employment Contracts' own theme engine/settings shape wholesale (see
  // employment-contracts/utils/themeEngine.ts) rather than a second one.
  const themeSettings: ContractThemeSettings = (template?.theme_settings && Object.keys(template.theme_settings).length > 0)
    ? (template.theme_settings as ContractThemeSettings)
    : DEFAULT_CONTRACT_THEME;
  const handleThemeChange = async (next: ContractThemeSettings) => {
    if (!template) return;
    setTemplate({ ...template, theme_settings: next });
    const updated = await updateTemplate(template.id, { theme_settings: next });
    if (!updated) toast.error('Failed to save theme');
  };

  const handleSave = async () => {
    if (!selectedCompanyId) return;
    setSaving(true);
    try {
      const saved = engagement
        ? await updateEngagement(engagement.id, { placeholder_overrides: overrides, selected_director_ids: selectedDirectorIds })
        : await createEngagement({
            company_id: selectedCompanyId,
            template_id: template?.id ?? null,
            placeholder_overrides: overrides,
            selected_director_ids: selectedDirectorIds,
            status: 'active',
          });
      if (saved) {
        setEngagement(saved);
        setEngagementStatuses((prev) => ({ ...prev, [selectedCompanyId]: saved.status }));
        toast.success('Contract data saved');
      } else {
        toast.error('Failed to save contract data');
      }
    } finally {
      setSaving(false);
    }
  };

  const selectedCompany = companies.find((c) => String(c.id) === selectedCompanyId) || null;

  return (
    <div className="h-screen w-full overflow-hidden bg-[#f3f4f6] dark:bg-[#0a0a0a] flex flex-col shadow-sm">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shrink-0 z-10 shadow-sm relative">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Consultancy Contracts
          </h1>
          <div className="hidden md:flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-full border border-slate-200 dark:border-slate-800/80">
            <button
              onClick={() => togglePanel('sidebar')}
              title={collapsed.sidebar ? 'Show clients panel' : 'Hide clients panel'}
              className={cn("p-1.5 rounded-full transition-all", collapsed.sidebar ? "text-slate-400 hover:text-slate-600" : "bg-custom-blue text-white shadow-sm")}
            >
              {collapsed.sidebar ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
            <button
              onClick={() => togglePanel('data')}
              title={collapsed.data ? 'Show data & values panel' : 'Hide data & values panel'}
              className={cn("p-1.5 rounded-full transition-all", collapsed.data ? "text-slate-400 hover:text-slate-600" : "bg-custom-blue text-white shadow-sm")}
            >
              <Columns2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => togglePanel('preview')}
              title={collapsed.preview ? 'Show preview panel' : 'Hide preview panel'}
              className={cn("p-1.5 rounded-full transition-all", collapsed.preview ? "text-slate-400 hover:text-slate-600" : "bg-custom-blue text-white shadow-sm")}
            >
              {collapsed.preview ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 w-full relative">
        <PanelGroup direction="horizontal" autoSaveId="consultancy-contracts-workspace-layout" className="h-full w-full">
          <Panel
            ref={sidebarPanelRef}
            id="sidebar"
            order={1}
            defaultSize={20}
            minSize={15}
            maxSize={30}
            collapsible
            collapsedSize={0}
            onCollapse={() => setCollapsed((prev) => ({ ...prev, sidebar: true }))}
            onExpand={() => setCollapsed((prev) => ({ ...prev, sidebar: false }))}
            className="bg-white/50 dark:bg-slate-900/50 flex flex-col z-10 overflow-hidden"
          >
            <CompaniesSidebar
              companies={companies}
              selectedCompanyId={selectedCompanyId}
              onSelectCompany={setSelectedCompanyId}
              engagementStatuses={engagementStatuses}
            />
          </Panel>

          <PanelResizeHandle className="relative flex w-2 items-center justify-center group outline-none cursor-col-resize z-20">
            <div className="h-full w-[2px] bg-slate-200/50 dark:bg-slate-800/50 transition-colors group-hover:bg-blue-400 group-active:bg-blue-500 dark:group-hover:bg-blue-500 dark:group-active:bg-blue-600 delay-75" />
          </PanelResizeHandle>

          <Panel
            ref={dataPanelRef}
            id="data"
            order={2}
            defaultSize={35}
            minSize={25}
            collapsible
            collapsedSize={0}
            onCollapse={() => setCollapsed((prev) => ({ ...prev, data: true }))}
            onExpand={() => setCollapsed((prev) => ({ ...prev, data: false }))}
            className="bg-slate-50 dark:bg-slate-950 flex flex-col z-10 overflow-hidden shadow-[0_0_15px_rgba(0,0,0,0.02)]"
          >
            <DataValuesPanel
              companySelected={!!selectedCompanyId}
              loading={loadingCompanyData}
              placeholders={placeholders}
              resolvedValues={resolvedValues}
              overrides={overrides}
              onOverrideChange={handleOverrideChange}
              directors={directors}
              selectedDirectorIds={selectedDirectorIds}
              onDirectorsChange={setSelectedDirectorIds}
              masterFields={masterFields}
              companyId={selectedCompanyId}
              onRefresh={handleRefreshMasterFieldValues}
            />
          </Panel>

          <PanelResizeHandle className="relative flex w-2 items-center justify-center group outline-none cursor-col-resize z-20">
            <div className="h-full w-[2px] bg-slate-200/50 dark:bg-slate-800/50 transition-colors group-hover:bg-blue-400 group-active:bg-blue-500 dark:group-hover:bg-blue-500 dark:group-active:bg-blue-600 delay-75" />
          </PanelResizeHandle>

          <Panel
            ref={previewPanelRef}
            id="preview"
            order={3}
            defaultSize={45}
            minSize={25}
            collapsible
            collapsedSize={0}
            onCollapse={() => setCollapsed((prev) => ({ ...prev, preview: true }))}
            onExpand={() => setCollapsed((prev) => ({ ...prev, preview: false }))}
            className="bg-slate-100/80 dark:bg-slate-900/80 flex flex-col z-10 overflow-hidden"
          >
            <ContractPreview
              company={selectedCompany}
              templateContent={template?.content || ''}
              resolvedValues={resolvedValues}
              overrides={overrides}
              engagement={engagement}
              themeSettings={themeSettings}
              onThemeChange={handleThemeChange}
              saving={saving}
              onSave={handleSave}
              selectedDirectors={selectedDirectors}
              placeholders={placeholders}
            />
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
