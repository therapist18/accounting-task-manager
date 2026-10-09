import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { fetchCompanyEmployees, ContractEmployeeInfo } from '../utils/data';
import { EcJobProfile, fetchJobProfiles, fetchGlobalJobProfiles, matchJobProfile } from '../utils/jobProfileData';
import { EmploymentOffer, fetchLatestOffer, fetchCompanyOffers, copyOfferToIndividual } from '../utils/employmentOfferData';
import { resolveEffectiveSettings } from '../utils/clauseEngine';
import { buildStandardPlaceholderValues } from '../utils/standardPlaceholders';
import {
  buildGuestEmployee,
  makeGuestDraftOffer,
  insertGuestIndividual,
  EMPTY_GUEST_DRAFT,
  type GuestPersonDraft,
} from '../utils/guestPerson';
import { readProgress } from '../utils/sessionProgress';
import { useMasterFieldValues } from '../hooks/useMasterFieldValues';
import type { EcPlaceholder } from '../utils/ecPlaceholders';
import type { JobField } from '../../master-fields/components/types/database';
import { fetchCompanies, Company } from '../../companies/database';
import { fetchSignatoryNameForCompany } from '../utils/companySettings';
import { fetchPayrollStatutoryLine } from '../utils/payrollIntegration';
import type { StatutoryDeductionsBreakdown } from '../utils/statutoryDeductions';
import { fetchClauses, EcClause } from '../utils/clauseLibraryData';
import { detectTokens } from '../utils/placeholderDetection';
import { SearchableSelect } from './SearchableSelect';
import { fieldSelectOptions } from '../utils/fieldOptions';
import { StatutoryDeductionsField } from './StatutoryDeductionsField';
import type { ManualStatutoryFigures } from '../utils/statutoryDeductions';
import { MasterFieldEditControl, MultiSourceValueControl, SourceValueEditor, linkedMasterFieldIds } from './MasterFieldEditControl';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SettingsTable, SettingsGroupRow, SettingsRow } from './SettingsTable';
import { Badge } from '@/components/ui/badge';
import { Loader2, UserRound, UserPlus, RotateCcw, RefreshCw, AlertCircle, FileText, CheckCircle2, Search, X, Wallet, FileSpreadsheet, Upload, Mail, Settings } from 'lucide-react';
import { generateEcContractExcel, EC_SHEET_NAME } from '../utils/ecExcelExport';
import { importEcContractExcel } from '../utils/ecExcelImport';
import { cn } from '@/lib/utils';
import { ENTITY_TYPES } from '@/lib/constants/entity-types';
import { useToast } from '@/components/ui/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { letterFieldsFor, letterTokenKeys, type LetterField } from '../utils/letterTemplates';
import type { DocumentTab, EmploymentLetters } from '../hooks/useEmploymentLetters';

interface ContractEditorProps {
  companyId: string | null;
  employeeId: string | null;
  contractData: any;
  setContractData: (data: any) => void;
  selectedJobProfile: EcJobProfile | null;
  setSelectedJobProfile: (profile: EcJobProfile | null) => void;
  // Contract vs Letters - the Letters tab swaps the job profile picker and
  // Compensation card for a letter type picker and the letter-only Details
  // card, and scopes the same Contract Fields panel to the letter's tokens.
  documentTab: DocumentTab;
  onDocumentTabChange: (tab: DocumentTab) => void;
  letters: EmploymentLetters;
  // Guest mode - a one-off external person typed in on this page instead of
  // picked from the registry (see utils/guestPerson.ts). The draft lives in
  // page state so it survives editor remounts; onGuestSaved fires with the
  // new registry_individuals id once "Save person to registry" succeeds.
  guestMode?: boolean;
  guestDraft?: GuestPersonDraft;
  setGuestDraft?: Dispatch<SetStateAction<GuestPersonDraft>>;
  onGuestSaved?: (individualId: number) => void;
}

const getSourceLabel = (
  p: Pick<EcPlaceholder, 'source_kind' | 'settings_key' | 'offer_field' | 'master_field_id' | 'master_field_links'>,
  masterFields: Map<number, JobField>
) => {
  switch (p.source_kind) {
    case 'master_field': {
      const linkedId = p.master_field_links?.[0]?.master_field_id ?? p.master_field_id;
      const field = linkedId != null ? masterFields.get(Number(linkedId)) : undefined;
      return p.settings_key || field?.label || field?.field_key || 'Not linked';
    }
    case 'settings_cascade':
      return p.settings_key || 'Profile';
    case 'job_profile':
      return p.settings_key || 'Profile';
    case 'offer':
      return p.offer_field || 'Profile';
    default:
      return 'Profile';
  }
};

export function ContractEditor({
  companyId,
  employeeId,
  contractData,
  setContractData,
  selectedJobProfile,
  setSelectedJobProfile,
  documentTab,
  onDocumentTabChange,
  letters,
  guestMode = false,
  guestDraft,
  setGuestDraft,
  onGuestSaved,
}: ContractEditorProps) {
  const isLetters = documentTab === 'letters';
  const [employee, setEmployee] = useState<ContractEmployeeInfo | null>(null);
  const [profiles, setProfiles] = useState<EcJobProfile[]>([]);
  // Copy-from sources: everyone in the company with a saved contract.
  const [companyEmployees, setCompanyEmployees] = useState<ContractEmployeeInfo[]>([]);
  const [companyOffers, setCompanyOffers] = useState<EmploymentOffer[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(false);
  const [signatoryName, setSignatoryName] = useState('');
  const [payrollStatutoryLine, setPayrollStatutoryLine] = useState<StatutoryDeductionsBreakdown | null>(null);
  const [dataFilter, setDataFilter] = useState<'all' | 'with' | 'missing'>('all');
  const [fieldSearch, setFieldSearch] = useState('');
  const { toast } = useToast();

  // Height of the sticky toolbar+column-header block, measured live so the
  // per-entity group headers below can stick right underneath it instead of
  // guessing a fixed pixel offset that would drift whenever the toolbar wraps
  // to a second line (mobile) or the column header row hides (below md).
  const stickyHeaderObserverRef = useRef<ResizeObserver | null>(null);
  const [stickyHeaderHeight, setStickyHeaderHeight] = useState(0);
  // A callback ref rather than a plain ref + mount-only effect: the toolbar
  // block only exists once an employee is actually selected - until then this
  // component returns the "No Employee Selected"/loading placeholder, which
  // has no toolbar to measure. A mount-only effect would observe nothing in
  // that case and leave stickyHeaderHeight stuck at 0, pinning the group
  // headers to the very top of the scrollport where the toolbar (z-30) hides
  // them behind it. React re-invokes the callback ref whenever the toolbar
  // (re)mounts, so the observer always latches onto the real element.
  const stickyHeaderRef = useCallback((el: HTMLDivElement | null) => {
    stickyHeaderObserverRef.current?.disconnect();
    stickyHeaderObserverRef.current = null;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setStickyHeaderHeight(entry.contentRect.height);
    });
    observer.observe(el);
    stickyHeaderObserverRef.current = observer;
  }, []);
  useEffect(() => () => stickyHeaderObserverRef.current?.disconnect(), []);

  useEffect(() => {
    let cancelled = false;
    fetchSignatoryNameForCompany(companyId).then((name) => { if (!cancelled) setSignatoryName(name); });
    return () => { cancelled = true; };
  }, [companyId]);

  useEffect(() => {
    let cancelled = false;
    fetchPayrollStatutoryLine(companyId, employee?.individualId).then((line) => { if (!cancelled) setPayrollStatutoryLine(line); });
    return () => { cancelled = true; };
  }, [companyId, employee?.individualId]);

  const offer: Partial<EmploymentOffer> = contractData.offer || {};
  const updateOffer = (patch: Partial<EmploymentOffer>) => {
    setContractData((prev: any) => ({ ...prev, offer: { ...(prev.offer || {}), ...patch } }));
  };

  useEffect(() => {
    async function loadData() {
      if (!companyId || !employeeId) {
        setEmployee(null);
        return;
      }
      setLoading(true);

      const [emps, companyProfiles, globalProfiles, companies, offers] = await Promise.all([
        fetchCompanyEmployees(companyId),
        fetchJobProfiles(companyId),
        fetchGlobalJobProfiles(),
        fetchCompanies(),
        fetchCompanyOffers(companyId),
      ]);
      const target = emps.find(e => String(e.individualId) === employeeId) || null;
      setEmployee(target);
      setCompanyEmployees(emps);
      setCompanyOffers(offers);
      
      const hasOwnPositionProfiles = companyProfiles.some((p) => p.scope === 'position' && p.is_active);
      const jobProfiles = hasOwnPositionProfiles ? companyProfiles : [...companyProfiles, ...globalProfiles];
      setProfiles(jobProfiles);
      setCompany(companies.find((c) => String(c.id) === String(companyId)) || null);

      const individualId = target ? target.individualId : Number(employeeId);

      // Staged session progress (utils/sessionProgress.ts) for this person -
      // the offer edits/profile choice typed in on the last visit. Staged
      // content wins over whatever is already in ec_employment_offers: the
      // DB is only written by Generate, so the local copy is the newer one.
      const staged = readProgress({ companyId, employeeId, guestMode: false });
      const stagedOffer = staged?.contractData?.offer &&
        String(staged.contractData.offer.individual_id) === String(individualId)
        ? staged.contractData.offer
        : null;

      const matched = target ? matchJobProfile(jobProfiles, target) : null;
      // Profile preference: whatever page.tsx restored into props for this
      // exact switch (kept only if the profile still exists), else the
      // staged choice, else the auto-match. selectedJobProfile is read from
      // the render this effect was created for - not a dependency - so a
      // later profile change never re-runs the whole load.
      const propProfile = selectedJobProfile && jobProfiles.some((p) => p.id === selectedJobProfile.id) ? selectedJobProfile : null;
      const stagedProfileRaw = staged?.jobProfile ?? null;
      const stagedProfile = stagedProfileRaw && jobProfiles.some((p) => p.id === stagedProfileRaw.id) ? stagedProfileRaw : null;
      const chosenProfile = propProfile || stagedProfile || matched;
      setSelectedJobProfile(chosenProfile);

      const existingOffer = target ? await fetchLatestOffer(companyId, individualId) : null;

      const freshOffer: Partial<EmploymentOffer> = {
        job_profile_id: chosenProfile?.id,
        company_id: String(companyId),
        individual_id: individualId,
        basic_salary: target?.basicSalary || null,
        currency: 'KES',
        allowances: [],
        start_date: target?.startDate || new Date().toISOString().split('T')[0],
        end_date: null,
        settings_overrides: {},
        placeholder_overrides: {},
        status: 'draft',
      };

      setContractData((prev: any) => {
        // prev.offer holds the same staged snapshot when page.tsx restored
        // it directly into state before this load ran - second choice
        // behind the store read so either restore path yields the unsaved
        // edits, never a stale copy of the DB offer.
        const prevOffer = prev?.offer && String(prev.offer.individual_id) === String(individualId) ? prev.offer : null;
        return {
          ...prev,
          employee: target,
          offer: stagedOffer || prevOffer || existingOffer || freshOffer,
        };
      });

      setLoading(false);
    }
    loadData();
    // selectedJobProfile is intentionally read from the switch render, not
    // listed as a dependency - a profile change must not re-run the load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, employeeId]);

  // ---------------------------------------------------------------------
  // Guest mode (external person) - two effects instead of loadData above:
  //
  // A) Infrastructure load - profiles + the issuing company, mirroring
  //    loadData minus the employee lookup (there is no registry row to look
  //    up) and the offer fetch (a brand-new person has no offers). Deps
  //    exclude the draft so typing never refetches.
  // B) Draft sync - the typed draft IS the employee record in guest mode, so
  //    it is mirrored into employee state and contractData on every keystroke
  //    (no fetching) - that's what the preview, placeholder values and
  //    letters all read, exactly like a registry employee.
  // ---------------------------------------------------------------------
  const guestDraftRef = useRef(guestDraft);
  useEffect(() => { guestDraftRef.current = guestDraft; }, [guestDraft]);

  useEffect(() => {
    if (!guestMode || !companyId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [companyProfiles, globalProfiles, companies] = await Promise.all([
        fetchJobProfiles(companyId),
        fetchGlobalJobProfiles(),
        fetchCompanies(),
      ]);
      if (cancelled) return;

      const hasOwnPositionProfiles = companyProfiles.some((p) => p.scope === 'position' && p.is_active);
      const jobProfiles = hasOwnPositionProfiles ? companyProfiles : [...companyProfiles, ...globalProfiles];
      setProfiles(jobProfiles);
      setCompany(companies.find((c) => String(c.id) === String(companyId)) || null);

      const draft = guestDraftRef.current;
      if (draft) {
        // A restored session (page.tsx's staged snapshot) may carry an
        // explicit profile choice and unsaved offer edits for this exact
        // external person - keep them, with the auto-match only as the
        // fallback for a fresh one. An empty draft never pulls staged
        // content, so starting a new person can't inherit the previous
        // person's offer.
        const canRestore = !!(draft.individualId || draft.fullName.trim());
        const staged = canRestore ? readProgress({ companyId, employeeId: null, guestMode: true, guestDraft: draft }) : undefined;
        const stagedOffer = staged?.contractData?.offer || null;
        const propProfile = selectedJobProfile && jobProfiles.some((p) => p.id === selectedJobProfile.id) ? selectedJobProfile : null;
        const stagedProfileRaw = staged?.jobProfile ?? null;
        const stagedProfile = stagedProfileRaw && jobProfiles.some((p) => p.id === stagedProfileRaw.id) ? stagedProfileRaw : null;
        const matched = matchJobProfile(jobProfiles, buildGuestEmployee(draft, companyId));
        const chosenProfile = propProfile || stagedProfile || matched;
        setSelectedJobProfile(chosenProfile);
        setContractData((prev: any) => ({
          ...prev,
          offer: stagedOffer
            ? { ...stagedOffer, company_id: String(companyId) }
            : prev.offer
              ? { ...prev.offer, job_profile_id: prev.offer.job_profile_id ?? chosenProfile?.id }
              : makeGuestDraftOffer(draft, companyId, chosenProfile?.id),
        }));
      }

      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestMode, companyId]);

  useEffect(() => {
    if (!guestMode || !guestDraft || !companyId) return;
    const synthetic = buildGuestEmployee(guestDraft, companyId);
    setEmployee(synthetic);
    setContractData((prev: any) => ({
      ...prev,
      employee: synthetic,
      // Only the guest-owned fields are patched; salary/allowances/overrides
      // typed in the panels above survive untouched. individual_id flips from
      // 0 to the real registry id once the person is saved.
      offer: prev.offer
        ? {
            ...prev.offer,
            company_id: String(companyId),
            individual_id: synthetic.individualId,
            start_date: guestDraft.startDate || prev.offer.start_date,
          }
        : makeGuestDraftOffer(guestDraft, companyId),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestDraft, guestMode, companyId]);

  const handleProfileChange = (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId) || null;
    setSelectedJobProfile(profile);
    updateOffer({ job_profile_id: profile?.id });
  };

  // Replaces this person's draft with another person's saved contract terms
  // (see copyOfferToIndividual for what is and isn't carried over). Local
  // only, like every other edit here - nothing is written until Generate.
  const handleCopyFromOffer = (sourceOfferId: string) => {
    const source = companyOffers.find((o) => o.id === sourceOfferId);
    if (!source || !employee || !companyId) return;
    const settingsPlaceholderKeys = new Set(
      ecPlaceholders.filter((p) => p.source_kind === 'settings_cascade').map((p) => p.key)
    );
    const copied = copyOfferToIndividual(
      source,
      { individualId: employee.individualId, companyId, basicSalary: employee.basicSalary },
      settingsPlaceholderKeys
    );
    // Keep this person's own saved offer id (if any) so Generate updates
    // their existing contract rather than adding a second live one.
    const ownOfferId = offer.id && String(offer.individual_id) === String(employee.individualId) ? offer.id : undefined;
    setContractData((prev: any) => ({ ...prev, offer: { ...copied, ...(ownOfferId ? { id: ownOfferId } : {}) } }));
    setSelectedJobProfile(profiles.find((p) => p.id === source.job_profile_id) || null);
    const sourceName = companyEmployees.find((e) => e.individualId === source.individual_id)?.fullName || 'the selected employee';
    toast({ title: 'Contract copied', description: `Terms copied from ${sourceName}. Review the fields, then Generate to save.` });
  };

  const copySourceOptions = useMemo(() => {
    const profileNames = new Map(profiles.map((p) => [p.id, p.name]));
    return companyOffers
      .filter((o) => String(o.individual_id) !== String(employee?.individualId))
      .map((o) => {
        const name = companyEmployees.find((e) => e.individualId === o.individual_id)?.fullName || `Individual #${o.individual_id}`;
        const profileName = profileNames.get(o.job_profile_id);
        return { value: o.id, label: profileName ? `${name} - ${profileName}` : name };
      });
  }, [companyOffers, companyEmployees, profiles, employee?.individualId]);

  // Manual statutory figures live in settings_overrides (beside the
  // show_statutory_table toggle). Any raw-HTML override of the table typed
  // into the old text input is cleared so it can't shadow them.
  const handleStatutoryManualChange = (figures: ManualStatutoryFigures | undefined) => {
    const settingsOverrides = { ...(offer.settings_overrides || {}) };
    if (figures) settingsOverrides.statutory_deductions_manual = figures;
    else delete settingsOverrides.statutory_deductions_manual;
    const placeholderOverrides = { ...(offer.placeholder_overrides || {}) };
    delete placeholderOverrides.statutory_deductions_table;
    updateOffer({ settings_overrides: settingsOverrides, placeholder_overrides: placeholderOverrides });
  };

  const handlePlaceholderOverride = (key: string, value: string | undefined) => {
    const next = { ...(offer.placeholder_overrides || {}) };
    if (value === undefined) delete next[key];
    else next[key] = value;
    updateOffer({ placeholder_overrides: next });
  };

  const handleRefreshMasterFieldValues = async () => {
    try {
      await refreshMasterFieldValues();
      toast({ title: 'Refreshed', description: 'Data & Values updated with the latest source data.' });
    } catch (err: any) {
      toast({ title: 'Refresh failed', description: err?.message || 'Could not fetch the latest values.', variant: 'destructive' });
    }
  };

  const [exportingExcel, setExportingExcel] = useState(false);
  const [importingExcel, setImportingExcel] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      await generateEcContractExcel({
        employeeName: employee?.fullName || 'Employee',
        jobProfileName: selectedJobProfile?.name || 'No Profile',
        placeholders: profileScopedPlaceholders,
        placeholderValues,
        basicSalary: offer.basic_salary,
        currency: offer.currency,
      });
      toast({ title: 'Exported', description: 'Contract fields exported to Excel.' });
    } catch (err: any) {
      toast({ title: 'Export failed', description: err?.message || 'Could not export contract fields.', variant: 'destructive' });
    } finally {
      setExportingExcel(false);
    }
  };

  const handleImportExcel = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportingExcel(true);
    try {
      const result = await importEcContractExcel(file, profileScopedPlaceholders, placeholderValues);
      if (!result) {
        toast({ title: 'Import failed', description: `"${EC_SHEET_NAME}" sheet not found — import a file exported from this page.`, variant: 'destructive' });
        return;
      }
      const offerPatch: Record<string, any> = {};
      if (Object.keys(result.placeholderOverrides).length > 0) {
        offerPatch.placeholder_overrides = { ...(offer.placeholder_overrides || {}), ...result.placeholderOverrides };
      }
      if (result.basicSalary !== undefined) offerPatch.basic_salary = result.basicSalary;
      if (result.currency !== undefined) offerPatch.currency = result.currency;
      if (Object.keys(offerPatch).length > 0) updateOffer(offerPatch);
      toast({
        title: 'Imported',
        description: `${result.fieldsChanged} field(s) updated${result.skippedLocked ? `, ${result.skippedLocked} read-only field(s) skipped` : ''}.`,
      });
    } catch (err: any) {
      toast({ title: 'Import failed', description: err?.message || 'Could not import this file.', variant: 'destructive' });
    } finally {
      setImportingExcel(false);
    }
  };

  const positionProfiles = profiles.filter(p => p.scope === 'position');
  const effectiveSettings = useMemo(() => resolveEffectiveSettings([
    selectedJobProfile, offer.settings_overrides ? { settings: offer.settings_overrides } : null,
  ]), [selectedJobProfile, offer]);

  // || null (not just undefined) so an unsaved guest's placeholder id of 0
  // never reaches the master-field machinery as if it were a real person -
  // until they're saved, field resolution/editing stays company-scoped only.
  const { ecPlaceholders, masterFieldValues, masterFields, isResolving, refresh: refreshMasterFieldValues } = useMasterFieldValues(employee?.individualId || null, companyId);

  const placeholderValues = useMemo(
    () => (employee ? buildStandardPlaceholderValues(employee, company, offer as EmploymentOffer, effectiveSettings, offer.placeholder_overrides, masterFieldValues, selectedJobProfile, ecPlaceholders, signatoryName, payrollStatutoryLine) : {}),
    [employee, company, offer, effectiveSettings, masterFieldValues, selectedJobProfile, ecPlaceholders, signatoryName, payrollStatutoryLine]
  );

  const [allClauses, setAllClauses] = useState<EcClause[]>([]);
  useEffect(() => { fetchClauses().then(setAllClauses); }, []);

  const profilePlaceholderKeys = useMemo(() => {
    if (!selectedJobProfile) return [];
    const clauseIds = new Set(Object.values(selectedJobProfile.section_clauses || {}));
    const profileClauses = allClauses.filter((c) => clauseIds.has(c.id));
    const keys = new Set<string>();
    for (const clause of profileClauses) {
      for (const token of detectTokens(clause.content)) keys.add(token);
    }
    return Array.from(keys);
  }, [selectedJobProfile, allClauses]);

  // The letter's tokens (header, subject, body, sign-off) - in the Letters tab
  // the Contract Fields panel lists the EC placeholders among these instead of
  // the job profile's clause tokens, with the same sources and overrides.
  const letterKeys = useMemo(() => letterTokenKeys(letters.letter), [letters.letter]);

  const profileScopedPlaceholders = useMemo(() => {
    if (isLetters) return ecPlaceholders.filter((p) => letterKeys.includes(p.key));
    if (!selectedJobProfile) return [];
    return ecPlaceholders.filter((p) => profilePlaceholderKeys.includes(p.key));
  }, [ecPlaceholders, selectedJobProfile, profilePlaceholderKeys, isLetters, letterKeys]);

  // What's left for the Details card: tokens nothing in the contract value
  // map resolves (same rule ContractPreview renders with). Registry keys and
  // standard contract values both count as resolved elsewhere.
  const letterFields = useMemo(() => {
    const resolvedElsewhere = new Set([...ecPlaceholders.map((p) => p.key), ...Object.keys(placeholderValues)]);
    return letterFieldsFor(letters.letter, resolvedElsewhere);
  }, [letters.letter, ecPlaceholders, placeholderValues]);

  const placeholderIsMissing = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const p of profileScopedPlaceholders) {
      const val = placeholderValues[p.key] ?? '';
      const overrideVal = offer.placeholder_overrides?.[p.key];
      const effectiveVal = overrideVal ?? val;
      map.set(p.id, !effectiveVal);
    }
    return map;
  }, [profileScopedPlaceholders, placeholderValues, offer.placeholder_overrides]);

  const missingCount = useMemo(() => profileScopedPlaceholders.filter((p) => placeholderIsMissing.get(p.id)).length, [profileScopedPlaceholders, placeholderIsMissing]);

  const dataFilteredPlaceholders = useMemo(() => {
    let result = profileScopedPlaceholders;
    if (dataFilter !== 'all') {
      result = result.filter((p) => {
        const missing = !!placeholderIsMissing.get(p.id);
        return dataFilter === 'missing' ? missing : !missing;
      });
    }
    const query = fieldSearch.trim().toLowerCase();
    if (query) {
      result = result.filter((p) =>
        p.label?.toLowerCase().includes(query) ||
        p.key?.toLowerCase().includes(query) ||
        p.group_label?.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query)
      );
    }
    return result;
  }, [profileScopedPlaceholders, dataFilter, placeholderIsMissing, fieldSearch]);

  if (!companyId || (!employeeId && !guestMode)) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 bg-slate-50 dark:bg-slate-950/50">
        <div className="p-4 bg-white dark:bg-slate-900 rounded-full shadow-sm mb-4">
          <UserRound className="w-10 h-10 text-slate-300 dark:text-slate-700" />
        </div>
        <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">No Person Selected</h3>
        <p className="text-base mt-1 max-w-sm text-center">
          Please select an employee from the sidebar &mdash; or use the <span className="font-medium">External person</span> button to draft for someone who isn&apos;t in the registry &mdash; to begin reviewing or generating a contract.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 bg-slate-50 dark:bg-slate-950/50">
        <Loader2 className="w-8 h-8 animate-spin mb-4 text-indigo-600" />
        <p className="text-base font-medium tracking-wide animate-pulse">Loading workspace...</p>
      </div>
    );
  }

  const entityGroups = new Map<string, { placeholders: EcPlaceholder[]; label: string }>();
  for (const p of dataFilteredPlaceholders) {
    const entity = (p.entity_type && p.entity_type.length > 0) ? p.entity_type[0] : 'none';
    if (!entityGroups.has(entity)) {
      const label = entity === 'none' ? 'General' : ENTITY_TYPES.find((t) => t.value === entity)?.label || entity;
      entityGroups.set(entity, { placeholders: [], label });
    }
    entityGroups.get(entity)!.placeholders.push(p);
  }
  const sortedEntities = Array.from(entityGroups.entries()).sort(([a], [b]) => a === 'none' ? 1 : b === 'none' ? -1 : a.localeCompare(b));

  // Letter-only fields (Letters tab) sit in the same list as their own
  // "Letter" group - same search, same All/With Data/Missing filter and counts.
  const letterFieldIsMissing = (key: string) => !(letters.values[key] || '').trim();
  const fieldQuery = fieldSearch.trim().toLowerCase();
  const passesFieldFilter = (missing: boolean, label: string, key: string) => {
    if (dataFilter === 'missing' && !missing) return false;
    if (dataFilter === 'with' && missing) return false;
    return !fieldQuery || label.toLowerCase().includes(fieldQuery) || key.includes(fieldQuery);
  };
  const shownLetterFields = isLetters
    ? letterFields.filter((f) => passesFieldFilter(letterFieldIsMissing(f.key), f.label, f.key))
    : [];

  // Compensation (Contract tab) - Basic Salary & Currency are written
  // straight to offer.basic_salary/offer.currency rather than through the
  // generic placeholder override: basic_salary is the one figure every
  // salary-derived value reads directly ({{basic_salary}}/{{gross_salary}}
  // and the statutory_deductions_table PAYE/SHIF/AHL/NSSF breakdown all
  // compute off offer.basic_salary itself, see standardPlaceholders.ts), so a
  // placeholder_overrides string would only patch the displayed text in one
  // spot. See ec_placeholders' `editable` column comment - these two rows are
  // deliberately not editable there, so this group is the one place to change
  // them. Listed as their own group in the same table.
  const compensationRows = isLetters ? [] : [
    {
      key: 'basic_salary',
      label: 'Basic Salary',
      missing: offer.basic_salary == null,
      input: (
        <Input
          type="number"
          min={0}
          value={offer.basic_salary ?? ''}
          onChange={(e) => updateOffer({ basic_salary: e.target.value === '' ? null : Number(e.target.value) })}
          placeholder="e.g. 120000"
          className="h-9 text-base px-3 rounded-md border-slate-200 bg-white dark:bg-slate-950"
        />
      ),
    },
    {
      key: 'currency',
      label: 'Currency',
      missing: false,
      input: (
        <select
          value={offer.currency || 'KES'}
          onChange={(e) => updateOffer({ currency: e.target.value })}
          className="h-9 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-base text-slate-900 dark:text-slate-100"
        >
          {['KES', 'USD', 'GBP', 'EUR'].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      ),
    },
  ];
  const shownCompensationRows = compensationRows.filter((r) => passesFieldFilter(r.missing, r.label, r.key));

  const totalFieldCount = profileScopedPlaceholders.length + (isLetters ? letterFields.length : 0) + compensationRows.length;
  const totalMissingCount = missingCount
    + (isLetters ? letterFields.filter((f) => letterFieldIsMissing(f.key)).length : 0)
    + compensationRows.filter((r) => r.missing).length;
  const shownFieldCount = dataFilteredPlaceholders.length + shownLetterFields.length + shownCompensationRows.length;
  // Running row number across all groups of the Fields table (# column + zebra).
  let rowIndex = 0;

  return (
    <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-950 relative">
      {/* Compact header - one row: employee, Contract/Letters switch, and the
          job profile (contract) or letter type (letters) picker. Kept tight so
          the fields table gets the room. */}
      <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 z-30 shrink-0 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 shrink-0 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white font-bold text-base">
            {employee?.fullName?.charAt(0) || <UserRound className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate leading-tight">{employee?.fullName}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
              {employee?.isGuest
                ? employee.individualId
                  ? `External person · Registry #${employee.individualId}`
                  : 'External person · Not in registry'
                : `EMP-${employee?.employeeNumber || '000000'}`}
              {' · '}{employee?.jobTitle || 'No Title'} · {employee?.department || 'No Dept'}
            </p>
          </div>
        </div>

        {/* Contract / Letters - same employee, values and theme; switching only
            changes what the preview renders and which fields are listed. */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200/80 dark:border-slate-700 shrink-0">
          {([
            { key: 'contract', label: 'Contract', icon: FileText },
            { key: 'letters', label: 'Letters', icon: Mail },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => onDocumentTabChange(tab.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 h-8 rounded-md text-base font-medium transition-colors',
                documentTab === tab.key
                  ? 'bg-custom-blue text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-700'
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-[300px] shrink-0">
          <div className="flex-1 min-w-0" title={isLetters ? 'Letter type' : 'Job profile'}>
            {isLetters ? (
              <SearchableSelect
                value={letters.letterKey}
                onChange={letters.setLetterKey}
                placeholder="Select a letter..."
                searchPlaceholder="Search letters..."
                options={letters.catalog.map((l) => ({ value: l.key, label: l.title }))}
              />
            ) : (
              <SearchableSelect
                value={selectedJobProfile?.id || null}
                onChange={handleProfileChange}
                placeholder="Select a job profile..."
                searchPlaceholder="Search profiles..."
                options={positionProfiles.map((p) => ({ value: p.id, label: p.company_id ? p.name : `${p.name} (Generic)` }))}
              />
            )}
          </div>
          {isLetters && (
            <Link
              href="/dashboard/employment-contracts/job-profiles?tab=letters"
              className="w-9 h-9 shrink-0 flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-custom-blue hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              title="Manage letter types and templates"
            >
              <Settings className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 [&>[data-radix-scroll-area-viewport]>div]:!block">
        <div className="px-4 pt-0 pb-8">

          {/* Guest mode: the person's details, typed in here. Sits above the
              sticky toolbar so it scrolls away and leaves the full field
              list its height; the toolbar sticks underneath it as usual. */}
          {guestMode && companyId && guestDraft && setGuestDraft && (
            <GuestPersonCard
              draft={guestDraft}
              setDraft={setGuestDraft}
              companyId={companyId}
              onSaved={onGuestSaved}
            />
          )}

          {/* Sticky toolbar + column header block - pinned to the top of the
              ScrollArea's own scrollport while reviewing a long field list.
              Height is measured (see stickyHeaderRef) so the per-entity group
              headers further down know exactly how far to stick below it. */}
          <div
            ref={stickyHeaderRef}
            className="sticky top-0 z-30 -mx-4 px-4 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-sm"
          >
          {/* Toolbar: one row - search, data filter, actions. */}
          <div className="flex items-center gap-2 py-2.5 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
              {/* Field search */}
              <div className="relative flex-1 min-w-[160px] max-w-xs">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  value={fieldSearch}
                  onChange={(e) => setFieldSearch(e.target.value)}
                  placeholder={isLetters ? 'Search letter fields...' : 'Search contract fields...'}
                  className="h-9 w-full pl-9 pr-8 text-base bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                />
                {fieldSearch && (
                  <button
                    onClick={() => setFieldSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    title="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Modern Segmented Control */}
              <div className="p-0.5 bg-slate-200/50 dark:bg-slate-800/80 rounded-lg inline-flex items-center">
                {([
                  { key: 'all', label: 'All', count: totalFieldCount },
                  { key: 'with', label: 'With Data', count: totalFieldCount - totalMissingCount },
                  { key: 'missing', label: 'Missing', count: totalMissingCount },
                ] as const).map((tab) => {
                  const isActive = dataFilter === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setDataFilter(tab.key)}
                      className={cn(
                        "px-3 h-8 rounded-md text-base font-medium transition-all duration-200 flex items-center gap-1.5 whitespace-nowrap",
                        isActive 
                          ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm" 
                          : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800"
                      )}
                    >
                      {tab.label}
                      <span className={cn(
                        "text-sm px-1.5 py-0.5 rounded-full font-bold", 
                        isActive 
                          ? (tab.key === 'missing' && tab.count > 0 ? "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400" : "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300") 
                          : "bg-transparent text-inherit"
                      )}>
                        {tab.count}
                      </span>
                    </button>
                  )
                })}
              </div>

              {!isLetters && !guestMode && employee && (
                <div className="ml-auto w-[220px]" title="Copy another employee's saved contract terms into this draft">
                  <SearchableSelect
                    value={null}
                    onChange={handleCopyFromOffer}
                    placeholder="Copy contract from..."
                    searchPlaceholder="Search employees..."
                    emptyText="No other saved contracts in this company."
                    options={copySourceOptions}
                    className="h-9 rounded-lg"
                  />
                </div>
              )}

              <button
                onClick={handleRefreshMasterFieldValues}
                disabled={isResolving}
                className={cn(!isLetters && !guestMode && employee ? '' : 'ml-auto', "w-9 h-9 flex items-center justify-center rounded-lg text-slate-600 bg-white dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm disabled:opacity-50")}
                title="Refresh master field values"
              >
                <RefreshCw className={cn("w-4 h-4", isResolving && "animate-spin text-indigo-500")} />
              </button>

              <button
                onClick={handleExportExcel}
                disabled={exportingExcel || profileScopedPlaceholders.length === 0}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-600 bg-white dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm disabled:opacity-50"
                title="Export contract fields to Excel"
              >
                {exportingExcel ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              </button>
              <button
                onClick={() => importFileRef.current?.click()}
                disabled={importingExcel}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-600 bg-white dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm disabled:opacity-50"
                title="Import contract fields from Excel"
              >
                {importingExcel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              </button>
              <input ref={importFileRef} type="file" accept=".xlsx" className="hidden" onChange={handleImportExcel} />
            </div>
          </div>

          </div>

          {/* Empty States */}
          {totalFieldCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 bg-white/50 dark:bg-slate-900/30 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl">
              <FileText className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-4" />
              <h4 className="text-slate-700 dark:text-slate-300 font-medium">No Fields Available</h4>
              <p className="text-base text-slate-500 mt-1">
                {isLetters
                  ? 'This letter only uses the employee/company basics and the Letter Details above.'
                  : selectedJobProfile ? 'This profile\'s clauses don\'t reference any dynamic placeholders.' : 'Select a job profile above to load required contract fields.'}
              </p>
            </div>
          ) : shownFieldCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 bg-white/50 dark:bg-slate-900/30 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl">
              <CheckCircle2 className="w-12 h-12 text-emerald-400/50 mb-4" />
              <h4 className="text-slate-700 dark:text-slate-300 font-medium">You're All Set</h4>
              <p className="text-base text-slate-500 mt-1">
                {fieldSearch.trim()
                  ? `No fields match "${fieldSearch.trim()}".`
                  : dataFilter === 'missing' ? 'Awesome! No fields are missing data.' : 'No matching fields found for this filter.'}
              </p>
            </div>
          ) : (
            
            /* Main Content List - one table (see FieldsTableHead below) */
            <div className="mt-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-clip">
              <table className="w-full table-fixed border-separate border-spacing-0 text-base [&>tbody>tr:last-child>td]:border-b-0">
                <FieldsColGroup />
                <FieldsTableHead top={stickyHeaderHeight} />
                <tbody>
                  {shownCompensationRows.length > 0 && (
                    <>
                      <FieldGroupRow label="Compensation" count={shownCompensationRows.length} />
                      {shownCompensationRows.map((r) => (
                        <FieldRow key={r.key} index={rowIndex++} label={r.label} token={`{{${r.key}}}`} source="Employment offer" isMissing={r.missing}>
                          {r.input}
                        </FieldRow>
                      ))}
                    </>
                  )}
                  {shownLetterFields.length > 0 && (
                    <>
                      <FieldGroupRow label="Letter" count={shownLetterFields.length} />
                      {shownLetterFields.map((f) => (
                        <LetterFieldRow
                          key={f.key}
                          index={rowIndex++}
                          field={f}
                          value={letters.values[f.key] || ''}
                          onChange={(v) => letters.setValue(f.key, v)}
                        />
                      ))}
                    </>
                  )}
                  {sortedEntities.map(([entityKey, group]) => (
                    <Fragment key={entityKey}>
                      <FieldGroupRow label={group.label} count={group.placeholders.length} />
                      {group.placeholders.map((p) => {
                        const val = placeholderValues[p.key] ?? '';
                        const overrideVal = offer.placeholder_overrides?.[p.key];
                        const isOverridden = overrideVal !== undefined;
                        const effectiveVal = overrideVal ?? val;
                        return (
                          <PlaceholderRow
                            key={p.id}
                            index={rowIndex++}
                            placeholder={p}
                            value={val}
                            overrideValue={overrideVal}
                            isMissing={!effectiveVal}
                            isOverridden={isOverridden}
                            masterFields={masterFields}
                            employee={employee}
                            companyId={companyId}
                            onOverride={(v) => handlePlaceholderOverride(p.key, v)}
                            onRefresh={refreshMasterFieldValues}
                            valueCell={p.key === 'statutory_deductions_table' ? (
                              <StatutoryDeductionsField
                                grossSalary={placeholderValues.gross_salary || ''}
                                payrollLine={payrollStatutoryLine}
                                manual={effectiveSettings.statutory_deductions_manual || null}
                                hidden={effectiveSettings.show_statutory_table === false}
                                onManualChange={handleStatutoryManualChange}
                              />
                            ) : undefined}
                          />
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ----------------------------------------------------------------------
// A typed-in row with no placeholder of its own (Compensation) - same cells
// as PlaceholderRow, the input as its value.
// ----------------------------------------------------------------------

function FieldRow({ index, label, token, source, isMissing, children }: {
  index: number;
  label: string;
  token: string;
  // Data Source column - where this value is written.
  source: string;
  isMissing?: boolean;
  children: ReactNode;
}) {
  return (
    <tr className={cn('transition-colors', fieldRowClass(index, isMissing ? 'amber' : undefined))}>
      <td className={cn(FIELD_TD, 'text-center text-slate-400 tabular-nums font-medium')}>{index + 1}</td>
      <FieldLabelCell label={label} token={token} isMissing={!!isMissing} />
      <td className={FIELD_TD}>
        <span className={cn(SOURCE_BADGE, 'bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800')}>{source}</span>
      </td>
      <td className={FIELD_TD}>{children}</td>
      <td className={cn(FIELD_TD, 'border-r-0')} />
    </tr>
  );
}

// ----------------------------------------------------------------------
// Fields table - same design as the Email Center's tables (emails/
// components/table.tsx): one bordered card, sticky slate header, thin
// gridlines, zebra rows, a # column and a full-width row per group. Missing
// values tint the row (rose = required, amber = optional) instead of a
// separate card per field.
// ----------------------------------------------------------------------

const FIELD_TH = 'px-3 py-2.5 text-left text-base font-semibold whitespace-nowrap border-b border-r border-white/20 dark:border-slate-700 bg-custom-blue dark:bg-blue-900 text-white';
const FIELD_TD = 'px-3 py-2.5 text-base text-slate-700 dark:text-slate-200 border-b border-r border-slate-200/70 dark:border-slate-800 align-middle';
const FIELD_COLUMNS = ['#', 'Placeholder Field', 'Data Source', 'Resolved Output', ''];

// Opaque backgrounds, as in the Email Center's zebraRow.
const fieldRowClass = (index: number, tint?: 'rose' | 'amber') =>
  tint === 'rose' ? 'bg-rose-50 hover:bg-rose-100/70 dark:bg-rose-950/30 dark:hover:bg-rose-950/50'
  : tint === 'amber' ? 'bg-amber-50/70 hover:bg-amber-100/60 dark:bg-amber-950/20 dark:hover:bg-amber-950/40'
  : index % 2 === 0 ? 'bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800'
  : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-900/60 dark:hover:bg-slate-800';

function FieldsTableHead({ top }: { top: number }) {
  return (
    <thead>
      <tr>
        {FIELD_COLUMNS.map((label, i) => (
          <th
            key={i}
            style={{ top }}
            className={cn(FIELD_TH, 'sticky z-20', i === 0 && 'text-center', i === FIELD_COLUMNS.length - 1 && 'border-r-0')}
          >
            {label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

// Shared by the Fields table and the input sections so their columns line up.
function FieldsColGroup() {
  return (
    <colgroup>
      <col className="w-12" />
      <col className="w-[32%]" />
      <col className="w-[18%]" />
      <col />
      <col className="w-[84px]" />
    </colgroup>
  );
}

function FieldGroupRow({ label, count }: { label: string; count?: number }) {
  return (
    <tr>
      <td
        colSpan={FIELD_COLUMNS.length}
        className="px-3 py-1.5 bg-slate-50 dark:bg-slate-950 text-sm font-bold uppercase tracking-wide text-slate-500 border-b border-slate-200/80 dark:border-slate-800"
      >
        {label}
        {count !== undefined && <span className="ml-2 font-semibold text-slate-400 tabular-nums">{count}</span>}
      </td>
    </tr>
  );
}

function FieldLabelCell({ label, token, isMissing, required, modified }: {
  label: string;
  token: string;
  isMissing: boolean;
  required?: boolean;
  modified?: boolean;
}) {
  return (
    <td className={FIELD_TD}>
      <div className="flex items-center gap-2 min-w-0">
        {isMissing && <AlertCircle className={cn('w-4 h-4 shrink-0', required ? 'text-rose-500' : 'text-amber-500')} />}
        {/* Label only - the {{token}} is in the tooltip, not taking a line. */}
        <span className={cn('font-semibold truncate', isMissing && required ? 'text-rose-900 dark:text-rose-200' : 'text-slate-800 dark:text-slate-100')} title={`${label} - ${token}`}>
          {label}
        </span>
        {modified && (
          <Badge variant="outline" className="text-xs uppercase font-bold tracking-wider h-5 px-1.5 rounded shrink-0 bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30">
            Modified
          </Badge>
        )}
      </div>
    </td>
  );
}

const SOURCE_BADGE = 'px-2 py-0.5 rounded-md text-sm font-medium truncate max-w-full inline-block border';

// A letter-only field (Letters tab) as a row of the same table - typed in,
// so the value cell is the input itself. Kept in page state for the letter
// only, never written to the employment offer.
function LetterFieldRow({ index, field, value, onChange }: {
  index: number;
  field: LetterField;
  value: string;
  onChange: (value: string) => void;
}) {
  const isMissing = !value.trim();
  return (
    <tr className={cn('transition-colors', fieldRowClass(index, isMissing ? 'amber' : undefined))}>
      <td className={cn(FIELD_TD, 'text-center text-slate-400 tabular-nums font-medium')}>{index + 1}</td>
      <FieldLabelCell label={field.label} token={`{{${field.key}}}`} isMissing={isMissing} />
      <td className={FIELD_TD}>
        <span
          className={cn(SOURCE_BADGE, 'bg-indigo-50 text-indigo-700 border-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800')}
          title={field.linked
            ? "Prefilled from the template placeholder's master field - edit to override for this letter only"
            : 'Typed in for this letter only - not saved to any record'}
        >
          {field.linked ? 'Master field' : 'Letter input'}
        </span>
      </td>
      <td className={FIELD_TD}>
        {field.type === 'textarea' ? (
          <Textarea
            rows={2}
            value={value}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
            className="text-base px-3 py-2 resize-none rounded-md border-slate-200 bg-white dark:bg-slate-950 min-h-0"
          />
        ) : (
          <Input
            type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
            value={value}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 text-base px-3 rounded-md border-slate-200 bg-white dark:bg-slate-950"
          />
        )}
      </td>
      <td className={cn(FIELD_TD, 'border-r-0')} />
    </tr>
  );
}

function PlaceholderRow({
  index,
  placeholder: p,
  value,
  overrideValue,
  isMissing,
  isOverridden,
  masterFields,
  employee,
  companyId,
  onOverride,
  onRefresh,
  valueCell
}: {
  index: number;
  placeholder: EcPlaceholder;
  value: string;
  overrideValue: string | undefined;
  isMissing: boolean;
  isOverridden: boolean;
  masterFields: Map<number, JobField>;
  employee: ContractEmployeeInfo | null;
  companyId: string | null;
  onOverride: (val: string | undefined) => void;
  onRefresh: () => void;
  // Replaces the default value control for fields with their own editor
  // (e.g. the statutory deductions table).
  valueCell?: ReactNode;
}) {
  const effectiveVal = overrideValue ?? value;
  const sourceLabel = getSourceLabel(p, masterFields);
  // 0 = unsaved external person (guestPerson.ts) - behaves as "no person"
  // for master-field scoping/editing until they're saved to the registry.
  const individualId = employee?.individualId || null;
  // Linked to more than one master field - the value cell becomes the
  // source picker (TemplateGenerationDialog's multi-source design).
  const linkedIds = linkedMasterFieldIds(p);
  const multiSource = linkedIds.length > 1 && p.type !== 'image' && p.type !== 'boolean';
  // Save-to-source editing (pencil) takes over this row's value cell - never
  // a second input squeezed into the actions column.
  const [editingFieldId, setEditingFieldId] = useState<number | null>(null);

  return (
    <tr className={cn('transition-colors', fieldRowClass(index, isMissing ? (p.required ? 'rose' : 'amber') : undefined))}>
      {/* An overridden value is marked on the # cell's left edge. */}
      <td className={cn(FIELD_TD, 'text-center text-slate-400 tabular-nums font-medium', isOverridden && !isMissing && 'shadow-[inset_3px_0_0_0_#6366f1]')}>
        {index + 1}
      </td>

      <FieldLabelCell label={p.label} token={`{{${p.key}}}`} isMissing={isMissing} required={p.required} modified={isOverridden} />

      <td className={FIELD_TD}>
        <span className={cn(
          SOURCE_BADGE,
          p.source_kind === 'master_field' ? "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" :
          p.source_kind === 'settings_cascade' ? "bg-sky-50 text-sky-700 border-sky-100 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800" :
          p.source_kind === 'offer' ? "bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800" :
          p.source_kind === 'job_profile' ? "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800" :
          "bg-gray-50 text-gray-500 border-gray-100 dark:bg-gray-800/50 dark:text-gray-400 dark:border-gray-700"
        )} title={sourceLabel}>
          {sourceLabel}
        </span>
      </td>

      <td className={FIELD_TD}>
        {valueCell ? (
          valueCell
        ) : editingFieldId != null ? (
          <SourceValueEditor
            placeholder={p}
            masterFieldId={editingFieldId}
            masterFields={masterFields}
            individualId={individualId}
            companyId={companyId}
            // A single-link placeholder's resolved value IS that field's
            // value; otherwise SourceValueEditor fetches the field's own.
            initialValue={linkedIds.length === 1 ? value : undefined}
            onDone={() => setEditingFieldId(null)}
            onSaved={onRefresh}
          />
        ) : multiSource ? (
          <MultiSourceValueControl
            placeholder={p}
            masterFields={masterFields}
            individualId={individualId}
            companyId={companyId}
            value={value}
            overrideValue={overrideValue}
            onOverride={p.editable ? onOverride : undefined}
            onSaved={onRefresh}
          />
        ) : p.editable && fieldSelectOptions(p.key, effectiveVal) ? (
          (() => {
            const select = fieldSelectOptions(p.key, effectiveVal)!;
            return (
              <SearchableSelect
                value={select.selected}
                onChange={(v) => onOverride(v)}
                placeholder={p.required ? 'Select (required)...' : 'Select...'}
                searchPlaceholder={`Search ${p.label.toLowerCase()}...`}
                options={select.options.map((o) => ({ value: o, label: o }))}
                className={cn(
                  'h-9 rounded-md',
                  isOverridden && 'border-indigo-200 bg-indigo-50/40 text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-900/10 dark:text-indigo-100'
                )}
              />
            );
          })()
        ) : p.editable ? (
          <Input
            className={cn(
              "h-9 text-base px-3 rounded-md border-slate-200 bg-white dark:bg-slate-950 dark:border-slate-700",
              isOverridden && "border-indigo-200 bg-indigo-50/40 text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-900/10 dark:text-indigo-100"
            )}
            value={effectiveVal}
            onChange={(e) => onOverride(e.target.value)}
            placeholder={p.required ? "Value is required..." : "Optional / Leave blank"}
          />
        ) : effectiveVal ? (
          <span className="block truncate" title={effectiveVal}>{effectiveVal}</span>
        ) : (
          <span className={cn('italic', p.required ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400')}>
            {p.required ? 'Missing (Required)' : 'No value computed'}
          </span>
        )}
      </td>

      <td className={cn(FIELD_TD, 'border-r-0')}>
        <div className="flex items-center justify-end gap-1">
          {p.source_kind === 'master_field' && !multiSource && editingFieldId == null && (
            <MasterFieldEditControl
              placeholder={p}
              masterFields={masterFields}
              individualId={individualId}
              companyId={companyId}
              onStartEdit={setEditingFieldId}
            />
          )}
          {p.editable && isOverridden && (
            <button
              type="button"
              title="Revert to computed default"
              onClick={() => onOverride(undefined)}
              className="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ----------------------------------------------------------------------
// Guest mode's person card - the identity fields typed in for a one-off
// external person (see utils/guestPerson.ts). Same two-column
// label | value table design as the workspace's placeholder/settings
// tables (SettingsTable): one bordered card, group header row, thin
// gridlines - not a decorated card of its own. Everything else in the
// workspace reads the resulting ContractEmployeeInfo exactly like a
// registry employee; "Save person to registry" is what makes them a real
// registry_individuals row, unlocking document filing and letter/master
// field resolution for them. Inputs lock after saving - further edits to
// the person belong in the Individuals module.
// ----------------------------------------------------------------------

const GUEST_FIELDS: {
  key: Exclude<keyof GuestPersonDraft, 'individualId'>;
  label: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
}[] = [
  { key: 'fullName', label: 'Full name', placeholder: 'e.g. Jane Wanjiku', required: true },
  { key: 'nationalId', label: 'National ID', placeholder: 'e.g. 12345678' },
  { key: 'kraPin', label: 'KRA PIN', placeholder: 'e.g. A000000000X' },
  { key: 'nssfNumber', label: 'NSSF No.', placeholder: 'Optional' },
  { key: 'shifNumber', label: 'SHIF No.', placeholder: 'Optional' },
  { key: 'contactEmail', label: 'Email', type: 'email', placeholder: 'name@example.com' },
  { key: 'contactPhone', label: 'Phone', placeholder: 'e.g. 0712 345 678' },
  { key: 'jobTitle', label: 'Job title', placeholder: 'e.g. Consultant' },
  { key: 'department', label: 'Department', placeholder: 'e.g. Audit' },
  { key: 'startDate', label: 'Start date', type: 'date' },
];

function GuestPersonCard({ draft, setDraft, companyId, onSaved }: {
  draft: GuestPersonDraft;
  setDraft: Dispatch<SetStateAction<GuestPersonDraft>>;
  companyId: string;
  onSaved?: (individualId: number) => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const isSaved = draft.individualId != null;
  const canSave = !isSaved && !saving && draft.fullName.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const result = await insertGuestIndividual(draft, companyId);
      if ('error' in result) {
        toast({ title: 'Could not save the person', description: result.error, variant: 'destructive' });
        return;
      }
      onSaved?.(result.id);
      toast({
        title: 'Saved to registry',
        description: `${draft.fullName.trim()} is now an individual - you can file the finished document against their record and start a new external person.`,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3">
      <SettingsTable>
        <SettingsGroupRow
          icon={UserPlus}
          accent="indigo"
          label="External Person"
          description={
            isSaved
              ? 'Filed under their registry record - edits to the person belong in the Individuals module.'
              : 'Type their details to draft now; save to the registry to file the finished document against their record.'
          }
          action={
            <div className="flex items-center gap-2">
              {isSaved ? (
                <Badge variant="outline" className="text-xs font-semibold bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800 whitespace-nowrap">
                  In registry · #{draft.individualId}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs font-semibold bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800 whitespace-nowrap">
                  Not in registry yet
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                onClick={() => setDraft({ ...EMPTY_GUEST_DRAFT })}
                title={isSaved ? 'Start a new external person - this one stays listed under the company' : 'Discard this draft'}
              >
                {isSaved ? 'New person' : 'Clear'}
              </Button>
              {!isSaved && (
                <Button
                  size="sm"
                  className="h-8 px-3.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                  onClick={handleSave}
                  disabled={!canSave}
                  title={draft.fullName.trim() ? undefined : 'Enter the full name first'}
                >
                  {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <UserPlus className="w-4 h-4 mr-1.5" />}
                  Save person to registry
                </Button>
              )}
            </div>
          }
        />
        {GUEST_FIELDS.map((f) => (
          <SettingsRow
            key={f.key}
            title={f.placeholder}
            label={
              <>
                {f.label}
                {f.required && <span className="text-rose-500 ml-0.5">*</span>}
              </>
            }
          >
            <Input
              type={f.type || 'text'}
              value={draft[f.key]}
              placeholder={f.placeholder}
              disabled={isSaved || saving}
              onChange={(e) => setDraft((prev) => ({ ...prev, [f.key]: e.target.value }))}
              className="h-9 text-base px-3 rounded-md border-slate-200 bg-white dark:bg-slate-950 dark:border-slate-700 disabled:opacity-60"
            />
          </SettingsRow>
        ))}
      </SettingsTable>
    </div>
  );
}
