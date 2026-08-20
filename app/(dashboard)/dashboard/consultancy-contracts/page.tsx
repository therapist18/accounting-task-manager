'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Columns2, RefreshCw, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CompaniesSidebar } from './components/CompaniesSidebar';
import { DataValuesPanel } from './components/DataValuesPanel';
import { ContractPreview } from './components/ContractPreview';
import { fetchCompanies, Company } from '../companies/database';
import { fetchDefaultTemplate, updateTemplate, CcTemplate } from './utils/ccTemplate';
import type { Placeholder } from '../templates/document-template-manager/types';
import { resolveCompanyRole, fetchCcData, resolveCcPlaceholders, resolveCcBlockPlaceholders } from './utils/ccResolver';
import { fetchLatestEngagement, createEngagement, updateEngagement, CcEngagement } from './utils/ccEngagements';
import { ContractThemeSettings, DEFAULT_CONTRACT_THEME } from './utils/themeEngine';
import type { ContractThemePanelTab } from './components/ContractThemePanel';
import { useCompanyDirectors } from './hooks/useCompanyDirectors';
import type { JobField } from '../master-fields/components/types/database';
import type { ImageStyle, ImageStyleMap } from './utils/imageStyles';

export default function ConsultancyContractsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [template, setTemplate] = useState<CcTemplate | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const [resolvedValues, setResolvedValues] = useState<Record<string, string>>({});
  const [arrayData, setArrayData] = useState<Record<string, Record<string, string>[]>>({});
  const [masterFields, setMasterFields] = useState<Map<number, JobField>>(new Map());
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [entityOverrides, setEntityOverrides] = useState<Record<string, string>>({});
  const [engagement, setEngagement] = useState<CcEngagement | null>(null);
  const [engagementStatuses, setEngagementStatuses] = useState<Record<string, 'draft' | 'active' | 'superseded'>>({});
  const [selectedDirectorIds, setSelectedDirectorIds] = useState<string[]>([]);
  // Per-instance image size/align overrides (see utils/imageStyles.ts) set
  // from Data & Values' image controls, keyed by placeholder key or
  // blockName_rowIdx_childKey. Runtime-only (not persisted with the rest of
  // placeholder_overrides), so it's scoped to the currently selected
  // company - reset alongside resolvedValues/overrides below.
  const [imageStyles, setImageStyles] = useState<ImageStyleMap>({});
  const handleImageStyleChange = useCallback((fieldKey: string, styleKey: keyof ImageStyle, value: any) => {
    setImageStyles((prev) => ({ ...prev, [fieldKey]: { ...prev[fieldKey], [styleKey]: value } }));
  }, []);
  const { directors } = useCompanyDirectors(selectedCompanyId);
  const selectedDirectors = useMemo(
    () => directors.filter((d) => selectedDirectorIds.includes(d.id)),
    [directors, selectedDirectorIds]
  );

  // Contract Settings panel (Theme/Color/Font/Header/Consultant) - owned
  // here, not inside ContractPreview, so the toolbar's "Consultant" label
  // can open it directly on the Consultant tab (see handleOpenThemePanel),
  // not just the Palette button inside ContractPreview.
  const [themePanelOpen, setThemePanelOpen] = useState(false);
  const [themePanelTab, setThemePanelTab] = useState<ContractThemePanelTab>('theme');
  const handleOpenThemePanel = useCallback((tab: ContractThemePanelTab) => {
    setThemePanelTab(tab);
    setThemePanelOpen(true);
  }, []);

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

  // Platform-wide data: companies and the one standard template (which
  // carries its own placeholders - see the `placeholders` memo below) -
  // loaded once, independent of company selection.
  useEffect(() => {
    (async () => {
      const [companyList, tmpl] = await Promise.all([
        fetchCompanies(),
        fetchDefaultTemplate(),
      ]);
      setCompanies(companyList);
      setTemplate(tmpl);
    })();
  }, []);

  const handleRefresh = useCallback(async () => {
    setLoadingCompanyData(true);
    try {
      const [companyList, tmpl] = await Promise.all([
        fetchCompanies(),
        fetchDefaultTemplate(),
      ]);
      setCompanies(companyList);
      setTemplate(tmpl);
      toast.success('Data refreshed');
    } catch (error) {
      console.error('Error refreshing data:', error);
      toast.error('Failed to refresh data');
    } finally {
      setLoadingCompanyData(false);
    }
  }, []);

  // Placeholders live directly on the template row (cc_templates.placeholders,
  // a DTM Placeholder[] maintained by Settings' Re-scan/PlaceholderFormDialog -
  // see settings/page.tsx). Used directly by the ccResolver functions.
  const placeholders: Placeholder[] = useMemo(
    () => template?.placeholders || [],
    [template]
  );

  // Components (DataValuesPanel, ContractPreview) expect a `key` field on
  // each placeholder. DTM Placeholder uses `name` as the identifier, so
  // we map once to add `key: p.name` for component props.
  const ccPlaceholders = useMemo(
    () => placeholders.map((p) => ({ ...p, key: p.name })),
    [placeholders]
  );

  const groupedPlaceholders = useMemo(() => {
    type PWithKey = Placeholder & { key: string };
    const empty = { topLevel: [] as PWithKey[], flatChildren: [] as PWithKey[], blocks: {} as Record<string, { config: PWithKey; children: PWithKey[] }> };
    if (!ccPlaceholders.length) return empty;
    const topLevel: PWithKey[] = [];
    const flatChildren: PWithKey[] = [];
    const blocks: Record<string, { config: PWithKey; children: PWithKey[] }> = {};
    for (const p of ccPlaceholders) {
      if (p.is_block_start) {
        blocks[p.name] = { config: p, children: [] };
      } else if (p.parent_name && blocks[p.parent_name]) {
        blocks[p.parent_name].children.push(p);
      } else if (p.parent_name) {
        flatChildren.push(p);
      } else {
        topLevel.push(p);
      }
    }
    return { topLevel, flatChildren, blocks };
  }, [ccPlaceholders]);

  // All placeholders except block parents — passed to DataValuesPanel for
  // scalar display.  Block children are rendered separately by array blocks.
  const scalarPlaceholders = useMemo(
    () => [...groupedPlaceholders.topLevel, ...groupedPlaceholders.flatChildren],
    [groupedPlaceholders]
  );

  // The Consultant (Booksmart Consultancy Limited, picked from the dropdown
  // below and persisted on the template) vs the Client (selected from the
  // sidebar) are the same template rendered for the same document, so they
  // need two separate resolveEcPlaceholderValues calls against two different
  // companyIds, split via resolveCompanyRole (explicit company_role first,
  // else the consultant_ key-prefix heuristic - see ccPlaceholderAdapter.ts).
  // The chosen consultant id lives on the template's own classification
  // JSONB (see ccTemplate.ts) rather than a companies-table column, so no
  // schema change is needed to introduce it.
  const consultantCompanyId = template?.consultant_company_id ?? null;
  const consultantCompany = useMemo(
    () => companies.find((c) => String(c.id) === String(consultantCompanyId)) || null,
    [companies, consultantCompanyId]
  );
  // The Consultant's own directors/shareholders (e.g. its signatories block) -
  // mirrors the `directors` hook call above, which only ever fetches the
  // CLIENT's. Without this, any array/block placeholder scoped to the
  // Consultant (entity_type other than 'company') had no source data to
  // resolve against at all - see resolveContractValues below.
  const { directors: consultantDirectors } = useCompanyDirectors(consultantCompany ? String(consultantCompany.id) : null);
  const handleConsultantChange = async (companyId: string) => {
    if (!template) return;
    // Clearing the previous signatory too - it's a director id scoped to
    // the OLD consultant company, meaningless (and potentially resolving to
    // the wrong person entirely, if the id happens to collide) once the
    // consultant company itself changes.
    setTemplate({ ...template, consultant_company_id: companyId, consultant_signatory_id: null });
    const updated = await updateTemplate(
      template.id,
      { consultant_company_id: companyId, consultant_signatory_id: null },
      template.classification
    );
    if (!updated) toast.error('Failed to save Consultant company');
  };

  // Which of the Consultant's own directors (consultantDirectors above)
  // signs on its behalf - explicit choice, not auto-picked (see
  // ccTemplate.ts's consultant_signatory_id comment for why this exists:
  // individual-scoped Consultant placeholders like consultant_signatory_name
  // have no other way to know which individual to resolve against).
  const consultantSignatoryId = template?.consultant_signatory_id ?? null;
  const handleSignatoryChange = async (individualId: string) => {
    if (!template) return;
    setTemplate({ ...template, consultant_signatory_id: individualId });
    const updated = await updateTemplate(template.id, { consultant_signatory_id: individualId }, template.classification);
    if (!updated) toast.error('Failed to save Consultant signatory');
  };

  // Scoped to scalarPlaceholders (excludes block parents/children, which are
  // resolved separately below via consultantBlockPlaceholders/
  // clientBlockPlaceholders) - split via resolveCompanyRole (explicit
  // company_role first, else the consultant_ key-prefix heuristic).
  const [consultantPlaceholders, clientPlaceholders] = useMemo(() => {
    const consultant: Placeholder[] = [];
    const client: Placeholder[] = [];
    for (const p of scalarPlaceholders) (resolveCompanyRole({ key: p.name, company_role: p.company_role }) === 'consultant' ? consultant : client).push(p);
    return [consultant, client];
  }, [scalarPlaceholders]);

  // Same Consultant/Client split as consultantPlaceholders/clientPlaceholders
  // above, but for BLOCK placeholders (director arrays etc.) - resolved by
  // block, not individually, since a block's children rarely carry their own
  // consultant_/client_ prefix; only the block's own parent placeholder
  // reliably does. Each block's parent+children travel together for
  // resolveCcBlockPlaceholders.
  const [consultantBlockPlaceholders, clientBlockPlaceholders] = useMemo(() => {
    const consultant: Placeholder[] = [];
    const client: Placeholder[] = [];
    for (const block of Object.values(groupedPlaceholders.blocks)) {
      const target = resolveCompanyRole({ key: block.config.name, company_role: block.config.company_role }) === 'consultant' ? consultant : client;
      target.push(block.config, ...block.children);
    }
    return [consultant, client];
  }, [groupedPlaceholders]);

  // Resolves both sides' placeholders (Consultant against consultantCompany,
  // Client against the given client id) and merges the results into one map.
  // Uses a single consolidated data fetch via fetchCcData for all entity IDs,
  // then resolves synchronously via processPlaceholderValue for each side.
  const resolveContractValues = useCallback(async (clientCompanyId: string) => {
    // Collect ALL entity IDs upfront for a single data fetch
    const allIndividualIds = [
      ...directors.map((d) => d.id),
      ...consultantDirectors.map((d) => d.id),
    ];
    const allCompanyIds = [
      clientCompanyId,
      ...(consultantCompany ? [String(consultantCompany.id)] : []),
    ];

    // Single data fetch for everything
    const { combinedCache, masterFields: mf } = await fetchCcData(placeholders, [...allCompanyIds, ...allIndividualIds]);

    // Client resolution
    const clientDirectorArray = directors.map((d) => ({ id: d.id, full_name: d.name, position: d.position }));
    const clientRelationshipData = {
      company: { id: clientCompanyId },
      directors: clientDirectorArray,
      principal: null, dependants: [], understudy: null, sponsor: null,
    };
    const clientValues = resolveCcPlaceholders(clientPlaceholders, clientRelationshipData, combinedCache, mf);
    const clientArrays = resolveCcBlockPlaceholders(
      clientBlockPlaceholders,
      clientDirectorArray.length > 0 ? { director: clientDirectorArray } : {},
      combinedCache, mf,
    );

    // Consultant resolution
    let consultantValues: Record<string, string> = {};
    let consultantArrays: Record<string, Record<string, string>[]> = {};
    if (consultantCompany) {
      const consultantDirectorArray = consultantDirectors.map((d) => ({ id: d.id, full_name: d.name, position: d.position }));
      const consultantRelationshipData = {
        company: { id: String(consultantCompany.id) },
        directors: consultantDirectorArray,
        principal: null, dependants: [], understudy: null, sponsor: null,
      };
      consultantValues = resolveCcPlaceholders(consultantPlaceholders, consultantRelationshipData, combinedCache, mf);
      consultantArrays = resolveCcBlockPlaceholders(
        consultantBlockPlaceholders,
        consultantDirectorArray.length > 0 ? { director: consultantDirectorArray } : {},
        combinedCache, mf,
      );
    }

    return {
      values: { ...clientValues, ...consultantValues },
      masterFields: mf,
      arrayValues: { ...clientArrays, ...consultantArrays },
    };
  }, [placeholders, consultantCompany, directors, consultantDirectors, clientPlaceholders, clientBlockPlaceholders, consultantPlaceholders, consultantBlockPlaceholders]);

  // Per-company: resolve master-field-sourced values and load any saved
  // engagement (overrides + status) for the selected client.
  useEffect(() => {
    if (!selectedCompanyId || placeholders.length === 0) {
      setResolvedValues({});
      setArrayData({});
      setMasterFields(new Map());
      setOverrides({});
      setEngagement(null);
      setSelectedDirectorIds([]);
      setImageStyles({});
      return;
    }
    let cancelled = false;
    setLoadingCompanyData(true);
    setImageStyles({});
    (async () => {
      const [{ values, masterFields: fields, arrayValues }, existingEngagement] = await Promise.all([
        resolveContractValues(selectedCompanyId),
        fetchLatestEngagement(selectedCompanyId),
      ]);
      if (cancelled) return;
      setResolvedValues(values);
      setArrayData(arrayValues);
      setMasterFields(fields);
      setOverrides(existingEngagement?.placeholder_overrides || {});
      setEngagement(existingEngagement);
      setSelectedDirectorIds(existingEngagement?.selected_director_ids || []);

      // Restore arrayData from previously saved flat overrides (keys like
      // blockName_rowIdx_childKey) so user edits survive a page reload.
      if (existingEngagement?.placeholder_overrides) {
        const savedOverrides = existingEngagement.placeholder_overrides;
        const restoredArrays: Record<string, Record<string, string>[]> = {};
        for (const [key, val] of Object.entries(savedOverrides)) {
          const match = key.match(/^([^_]+)_(\d+)_(.+)$/);
          if (match) {
            const [, blockName, idxStr, childKey] = match;
            const idx = parseInt(idxStr, 10);
            if (!restoredArrays[blockName]) restoredArrays[blockName] = [];
            if (!restoredArrays[blockName][idx]) restoredArrays[blockName][idx] = {};
            restoredArrays[blockName][idx][childKey] = val;
          }
        }
        // Merge restored arrays with freshly resolved ones — user edits
        // take priority over resolved values.
        if (Object.keys(restoredArrays).length > 0) {
          setArrayData((prev) => {
            const merged = { ...prev };
            for (const [blockName, restoredRows] of Object.entries(restoredArrays)) {
              const prevRows = merged[blockName] || [];
              // Only use restored rows if they have more entries than resolved
              // (user added entities) or differ from resolved (user edited cells).
              if (restoredRows.length >= prevRows.length || JSON.stringify(restoredRows) !== JSON.stringify(prevRows)) {
                merged[blockName] = restoredRows;
              }
            }
            return merged;
          });
        }
      }

      if (existingEngagement) {
        setEngagementStatuses((prev) => ({ ...prev, [selectedCompanyId]: existingEngagement.status }));
      }
      setLoadingCompanyData(false);
    })();
    return () => { cancelled = true; };
  }, [selectedCompanyId, placeholders, resolveContractValues]);

  // Manual "refresh source data" trigger - re-resolves master-field values
  // for the current company without touching overrides/engagement/directors,
  // for MasterFieldEditControl's onSaved callback (DataValuesPanel.tsx) after
  // an inline edit writes a new value back to its source record.
  const handleRefreshMasterFieldValues = async () => {
    if (!selectedCompanyId || placeholders.length === 0) return;
    const { values, masterFields: fields, arrayValues } = await resolveContractValues(selectedCompanyId);
    setResolvedValues(values);
    setArrayData(arrayValues);
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

  // Scalar overrides exclude the flat array keys (blockName_rowIdx_childKey)
  // that are mixed into placeholder_overrides for persistence — those are
  // only meaningful for the arrayData restore logic above.
  const scalarOverrides = useMemo(() => {
    const result: Record<string, string> = {};
    for (const [key, val] of Object.entries(overrides)) {
      if (!/^\w+_\d+_\w+$/.test(key)) result[key] = val;
    }
    return result;
  }, [overrides]);

  const handleOverrideChange = (key: string, value: string | undefined) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  // Array/block editing handlers — mutate arrayData in-place via state.
  const handleArrayCellChange = useCallback((blockName: string, rowIdx: number, childKey: string, value: string) => {
    setArrayData((prev) => {
      const rows = prev[blockName];
      if (!rows || !rows[rowIdx]) return prev;
      const next = { ...prev, [blockName]: rows.map((r, i) => i === rowIdx ? { ...r, [childKey]: value } : r) };
      return next;
    });
  }, []);

  const handleArrayDeleteColumn = useCallback((blockName: string, colIdx: number) => {
    setArrayData((prev) => {
      const rows = prev[blockName];
      if (!rows || !rows[colIdx]) return prev;
      return { ...prev, [blockName]: rows.filter((_, i) => i !== colIdx) };
    });
  }, []);

  // Derive the next entity label from the block config so the blank row
  // carries sensible default keys for the user to fill.
  const handleArrayAddEntity = useCallback((blockName: string) => {
    setArrayData((prev) => {
      const rows = prev[blockName] || [];
      // New row starts empty — the user fills each field.
      return { ...prev, [blockName]: [...rows, {}] };
    });
  }, []);

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
    const updated = await updateTemplate(template.id, { theme_settings: next }, template.classification);
    if (!updated) toast.error('Failed to save theme');
  };

  const handleSave = async () => {
    if (!selectedCompanyId) return;
    setSaving(true);
    try {
      // Flatten arrayData into placeholder_overrides so it persists via the
      // existing JSONB column (convention: blockName_rowIdx_childKey).
      const flatArrayOverrides: Record<string, string> = {};
      for (const [blockName, rows] of Object.entries(arrayData)) {
        rows.forEach((row, idx) => {
          for (const [childKey, val] of Object.entries(row)) {
            flatArrayOverrides[`${blockName}_${idx}_${childKey}`] = val;
          }
        });
      }
      const mergedOverrides = { ...overrides, ...flatArrayOverrides };

      const saved = engagement
        ? await updateEngagement(engagement.id, { placeholder_overrides: mergedOverrides, selected_director_ids: selectedDirectorIds })
        : await createEngagement({
            company_id: selectedCompanyId,
            template_id: template?.id ?? null,
            placeholder_overrides: mergedOverrides,
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
      <div className="flex items-center justify-between gap-6 px-7 py-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shrink-0 z-10 shadow-sm relative">
        <div className="flex items-center gap-7">
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Consultancy Contracts
          </h1>
          <div className="hidden md:flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1.5 rounded-full border border-slate-200 dark:border-slate-800/80">
            <button
              onClick={() => togglePanel('sidebar')}
              title={collapsed.sidebar ? 'Show clients panel' : 'Hide clients panel'}
              className={cn("p-2 rounded-full transition-all", collapsed.sidebar ? "text-slate-400 hover:text-slate-600" : "bg-custom-blue text-white shadow-sm")}
            >
              {collapsed.sidebar ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
            <button
              onClick={() => togglePanel('data')}
              title={collapsed.data ? 'Show data & values panel' : 'Hide data & values panel'}
              className={cn("p-2 rounded-full transition-all", collapsed.data ? "text-slate-400 hover:text-slate-600" : "bg-custom-blue text-white shadow-sm")}
            >
              <Columns2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => togglePanel('preview')}
              title={collapsed.preview ? 'Show preview panel' : 'Hide preview panel'}
              className={cn("p-2 rounded-full transition-all", collapsed.preview ? "text-slate-400 hover:text-slate-600" : "bg-custom-blue text-white shadow-sm")}
            >
              {collapsed.preview ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
            </button>
            <button
              onClick={handleRefresh}
              disabled={loadingCompanyData}
              title="Refresh data"
              className={cn("p-2 rounded-full transition-all", "text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800")}
            >
              {loadingCompanyData ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Read-only "Client" summary (picked from the sidebar list on the
            left) next to a CLICKABLE "Consultant" summary - clicking it
            opens the Contract Settings panel directly on the Consultant tab
            (see handleOpenThemePanel/ContractThemePanel.tsx), so there's no
            guessing where Consultant/Signatory configuration lives. Styled
            as cards (icon + stacked label/value) rather than inline text so
            they read clearly instead of getting lost in the toolbar. */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50 min-w-0">
            <Building2 className="w-5 h-5 text-slate-400 shrink-0" />
            <div className="leading-tight min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Client</div>
              <div className={cn(
                "text-sm font-bold truncate max-w-[220px]",
                selectedCompany ? "text-slate-800 dark:text-slate-100" : "text-slate-400 italic font-medium"
              )}>
                {selectedCompany?.company_name || 'None selected'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleOpenThemePanel('consultant')}
            title="Open Consultant settings"
            className={cn(
              "flex items-center gap-2.5 px-4 py-2 rounded-xl border transition-colors min-w-0 text-left",
              consultantCompany
                ? "border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800"
                : "border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-900/10 hover:bg-amber-100/70 dark:hover:bg-amber-900/20"
            )}
          >
            <Building2 className={cn("w-5 h-5 shrink-0", consultantCompany ? "text-slate-400" : "text-amber-500")} />
            <div className="leading-tight min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Consultant</div>
              <div className={cn(
                "text-sm font-bold truncate max-w-[220px]",
                consultantCompany ? "text-slate-800 dark:text-slate-100" : "text-amber-600 dark:text-amber-400"
              )}>
                {consultantCompany?.company_name || 'Not set - click to configure'}
              </div>
            </div>
          </button>
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
              placeholders={scalarPlaceholders}
              allPlaceholders={ccPlaceholders}
              resolvedValues={resolvedValues}
              arrayData={arrayData}
              overrides={scalarOverrides}
              onOverrideChange={handleOverrideChange}
              masterFields={masterFields}
              companyId={selectedCompanyId}
              consultantCompanyId={consultantCompany ? String(consultantCompany.id) : null}
              onRefresh={handleRefreshMasterFieldValues}
              onCellChange={handleArrayCellChange}
              onDeleteColumn={handleArrayDeleteColumn}
              onAddEntity={handleArrayAddEntity}
              imageStyles={imageStyles}
              onImageStyleChange={handleImageStyleChange}
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
              arrayData={arrayData}
              overrides={scalarOverrides}
              engagement={engagement}
              themeSettings={themeSettings}
              onThemeChange={handleThemeChange}
              saving={saving}
              onSave={handleSave}
              selectedDirectors={selectedDirectors}
              placeholders={ccPlaceholders}
              imageStyles={imageStyles}
              themePanelOpen={themePanelOpen}
              themePanelTab={themePanelTab}
              onThemePanelOpen={handleOpenThemePanel}
              onThemePanelClose={() => setThemePanelOpen(false)}
              companies={companies}
              consultantCompanyId={consultantCompanyId}
              onConsultantChange={handleConsultantChange}
              consultantDirectors={consultantDirectors}
              consultantSignatoryId={consultantSignatoryId}
              onSignatoryChange={handleSignatoryChange}
            />
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
