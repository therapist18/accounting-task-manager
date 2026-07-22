import { useEffect, useMemo, useRef, useState } from 'react';
import supabase from '@/lib/supabase/client';
import { PreviewPanel } from '../../tasks-requirements/components/PreviewPanel';
import { replacePlaceholders } from '../../tasks-requirements/utils/templateFormatters';
import { EDITOR_PREVIEW_STYLES } from '../../tasks-requirements/utils/templateUtils';
import { Button } from '@/components/ui/button';
import { Download, Loader2, Save, FileText, FileWarning, Palette, FileDown } from 'lucide-react';
import { saveAs } from 'file-saver';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { ContractThemePanel } from './ContractThemePanel';
import { ContractThemeSettings, DEFAULT_CONTRACT_THEME, applyThemeToHtml } from '../utils/themeEngine';
import {
  resolveEffectiveSettings, resolveEffectiveClauses, buildDefaultClauseMap, assembleContractHtml,
} from '../utils/clauseEngine';
import { EcClause, fetchClauses } from '../utils/clauseLibraryData';
import { EcJobProfile, fetchJobProfiles, findCompanyDefaults, findDepartmentDefaults } from '../utils/jobProfileData';
import { EcContractTemplate, fetchEffectiveContractTemplate } from '../utils/contractTemplateData';
import { EmploymentOffer, createEmploymentOffer, updateEmploymentOffer } from '../utils/employmentOfferData';
import { buildStandardPlaceholderValues } from '../utils/standardPlaceholders';
import { fetchCompanies, Company } from '../../companies/database';

interface ContractPreviewProps {
  contractData: any;
  setContractData?: (updater: any) => void;
  selectedJobProfile: EcJobProfile | null;
}

export function ContractPreview({ contractData, setContractData, selectedJobProfile }: ContractPreviewProps) {
  const employee = contractData?.employee;
  const offer: Partial<EmploymentOffer> | undefined = contractData?.offer;
  const companyId = employee?.companyId;

  const [clauses, setClauses] = useState<EcClause[]>([]);
  const [orgProfiles, setOrgProfiles] = useState<EcJobProfile[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [contractTemplate, setContractTemplate] = useState<EcContractTemplate | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);

  const [themeOverride, setThemeOverride] = useState<ContractThemeSettings | null>(null);
  const [themePanelOpen, setThemePanelOpen] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const htmlCaptureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadContext() {
      if (!companyId) return;
      setLoadingContext(true);
      const [allClauses, profiles, companies, template] = await Promise.all([
        fetchClauses(),
        fetchJobProfiles(companyId),
        fetchCompanies(),
        fetchEffectiveContractTemplate(companyId),
      ]);
      setClauses(allClauses);
      setOrgProfiles(profiles);
      setCompany(companies.find((c) => String(c.id) === String(companyId)) || null);
      setContractTemplate(template);
      setThemeOverride(null);
      setLoadingContext(false);
    }
    loadContext();
  }, [companyId]);

  const clausesById = useMemo(() => Object.fromEntries(clauses.map((c) => [c.id, c])), [clauses]);
  const defaultClauseMap = useMemo(() => buildDefaultClauseMap(clauses), [clauses]);
  const companyDefaults = useMemo(() => (companyId ? findCompanyDefaults(orgProfiles, companyId) : undefined), [orgProfiles, companyId]);
  const departmentDefaults = useMemo(() => (companyId ? findDepartmentDefaults(orgProfiles, companyId, employee?.department) : undefined), [orgProfiles, companyId, employee]);

  const effectiveSettings = useMemo(() => resolveEffectiveSettings([
    companyDefaults, departmentDefaults, selectedJobProfile, offer ? { settings: offer.settings_overrides } : null,
  ]), [companyDefaults, departmentDefaults, selectedJobProfile, offer]);

  const effectiveClauses = useMemo(() => resolveEffectiveClauses([
    companyDefaults, departmentDefaults, selectedJobProfile, offer ? { section_clauses: offer.section_clauses_overrides } : null,
  ], defaultClauseMap), [companyDefaults, departmentDefaults, selectedJobProfile, offer, defaultClauseMap]);

  const employeeValues = useMemo(
    () => (employee ? buildStandardPlaceholderValues(employee, company, offer as EmploymentOffer) : {}),
    [employee, company, offer]
  );

  const bodyHtml = useMemo(() => {
    if (!contractTemplate || !employee) return '';
    return assembleContractHtml({
      sectionKeys: contractTemplate.section_keys,
      clausesById,
      effectiveClauses,
      effectiveSettings,
      employeePlaceholderValues: employeeValues,
    });
  }, [contractTemplate, clausesById, effectiveClauses, effectiveSettings, employeeValues, employee]);

  const themeSettings: ContractThemeSettings = themeOverride || contractTemplate?.theme_settings || DEFAULT_CONTRACT_THEME;
  const mergedValues = { ...effectiveSettings, ...employeeValues };

  // Theme first (its header/letterhead may inject its own {{company_name}} etc. tokens),
  // then substitute over the whole themed result - same ordering the old flow used, see
  // themeEngine.applyThemeToHtml.
  const themedHtml = bodyHtml ? replacePlaceholders(applyThemeToHtml(bodyHtml, themeSettings), mergedValues) : '';
  const wordSafeHtml = bodyHtml ? replacePlaceholders(applyThemeToHtml(bodyHtml, themeSettings, { wordSafe: true }), mergedValues) : '';

  const updateThemeSettings = (settings: ContractThemeSettings) => setThemeOverride(settings);

  const buildOutput = (): { blob: Blob; fileName: string } | null => {
    if (!employee || !wordSafeHtml) return null;
    const baseName = employee.fullName.replace(/\s+/g, '_');
    const htmlDoc = `<!doctype html><html><head><meta charset="utf-8"><title>${baseName} Employment Contract</title></head><body>${wordSafeHtml}</body></html>`;
    return { blob: new Blob([htmlDoc], { type: 'application/msword' }), fileName: `${baseName}_Employment_Contract.doc` };
  };

  const handleDownloadWord = () => {
    const output = buildOutput();
    if (output) saveAs(output.blob, output.fileName);
  };

  const handleDownloadPdf = async () => {
    const element = htmlCaptureRef.current;
    if (!element || !employee) return;

    setIsGeneratingPdf(true);
    try {
      if (typeof document !== 'undefined' && (document as any).fonts?.ready) {
        try { await (document as any).fonts.ready; } catch { /* ignore */ }
      }
      await Promise.all(
        Array.from(element.querySelectorAll('img')).map((img) =>
          (img as HTMLImageElement).complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                (img as HTMLImageElement).addEventListener('load', () => resolve(), { once: true });
                (img as HTMLImageElement).addEventListener('error', () => resolve(), { once: true });
              })
        )
      );

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      const totalPages = Math.ceil(imgHeight / pageHeight);

      for (let i = 0; i < totalPages; i++) {
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, -(i * pageHeight), imgWidth, imgHeight);
      }

      const baseName = employee.fullName.replace(/\s+/g, '_');
      pdf.save(`${baseName}_Employment_Contract.pdf`);
    } catch (err: any) {
      console.error('PDF generation failed:', err);
      toast.error('Failed to generate PDF. Please try again.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleSaveToDb = async () => {
    const output = buildOutput();
    if (!output || !employee || !offer || !contractTemplate || !selectedJobProfile) return;
    setIsSaving(true);
    try {
      // 1. Persist the Employment Offer itself (may still be an unsaved draft).
      const offerPayload = { ...offer, job_profile_id: selectedJobProfile.id, status: 'active' as const };
      const persistedOffer = offer.id
        ? await updateEmploymentOffer(offer.id, offerPayload)
        : await createEmploymentOffer(offerPayload);
      if (!persistedOffer) throw new Error('Failed to save the employment offer');
      setContractData?.((prev: any) => ({ ...prev, offer: persistedOffer }));

      // 2. Upload the generated document to storage
      const fileName = `generated/${employee.companyId}/${employee.individualId}/${Date.now()}_contract.doc`;
      const { error: uploadError } = await supabase.storage
        .from("kyc-templates") // Can use a separate bucket like "contracts" in real deployment
        .upload(fileName, output.blob, { contentType: output.blob.type });

      if (uploadError) throw new Error('Failed to upload generated document to storage');

      // 3. Save record to acc_employment_contracts
      const { data: { session } } = await supabase.auth.getSession();

      const { data: insertData, error: insertError } = await supabase
        .from('acc_employment_contracts')
        .insert([{
          contract_number: `CNT-${Date.now()}`,
          employee_id: String(employee.individualId),
          company_id: String(employee.companyId),
          template_id: contractTemplate.id,
          status: 'generated',
          docx_path: fileName,
          metadata: {
            jobProfileId: selectedJobProfile.id,
            employmentOfferId: persistedOffer.id,
            contractTemplateId: contractTemplate.id,
            effectiveSettings,
            themeSettings,
          },
          generated_by: session?.user?.id || null
        }])
        .select()
        .single();

      if (insertError) throw new Error('Failed to save contract record');

      // 4. Save audit trail
      if (insertData) {
        await supabase.from('acc_employment_contracts_audit').insert([{
          contract_id: insertData.id,
          action: 'generated',
          user_id: session?.user?.id || null,
          details: `Contract generated for ${employee.fullName}`
        }]);
      }

      toast.success('Contract generated and saved successfully!');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Error saving contract');
    } finally {
      setIsSaving(false);
    }
  };

  if (!employee) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8 text-center bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">
        <FileText className="w-16 h-16 mb-4 text-slate-200 dark:text-slate-700" />
        <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300">Live Document Preview</h3>
        <p className="text-sm">Select an employee and a job profile to view the generated document.</p>
      </div>
    );
  }

  if (!selectedJobProfile) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8 text-center bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">
        <FileWarning className="w-16 h-16 mb-4 text-amber-300" />
        <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300">No Job Profile Selected</h3>
        <p className="text-sm">Pick a Job Profile in the configuration panel to generate this contract.</p>
      </div>
    );
  }

  const hasOutput = !!bodyHtml;

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 relative overflow-hidden">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            Document Preview
          </h2>
          <p className="text-xs text-slate-500">Live preview of the generated contract</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setThemePanelOpen(true)}
            disabled={!contractTemplate}
            className={cn(themePanelOpen && "border-custom-blue text-custom-blue")}
          >
            <Palette className="w-4 h-4 mr-2" /> Theme
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={!hasOutput || loadingContext || isGeneratingPdf}>
            {isGeneratingPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />} PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadWord} disabled={!hasOutput || loadingContext}>
            <Download className="w-4 h-4 mr-2" /> Word
          </Button>
          <Button size="sm" className="bg-custom-blue hover:bg-custom-blue/90 text-white" onClick={handleSaveToDb} disabled={!hasOutput || loadingContext || isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Generate & Save
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative flex flex-col min-h-0">
        {!contractTemplate && !loadingContext ? (
          <div className="flex flex-col items-center justify-center h-full text-red-500 p-8 text-center bg-red-50/50 dark:bg-red-950/50">
            <FileWarning className="w-12 h-12 mb-4 text-red-400" />
            <p className="text-sm font-medium">No Contract Template configured for this company yet. Set one up under "Manage Templates".</p>
          </div>
        ) : (
          <PreviewPanel
            previewContent={themedHtml}
            isPreviewLoading={loadingContext}
            panelClasses="h-full"
            EDITOR_PREVIEW_STYLES={EDITOR_PREVIEW_STYLES}
            templateName={contractTemplate?.name || 'Employment Contract'}
            isWordTemplate={false}
            docxBuffer={undefined}
          />
        )}
      </div>

      <ContractThemePanel
        open={themePanelOpen}
        onClose={() => setThemePanelOpen(false)}
        settings={themeSettings}
        onChange={updateThemeSettings}
      />

      {/* Hidden, unscaled capture target for PDF export - kept out of view but laid out
          at natural size so html2canvas doesn't have to fight any zoom/scale transform. */}
      <div className="fixed left-[-99999px] top-0 pointer-events-none" aria-hidden="true">
        <div ref={htmlCaptureRef} className="bg-white w-[800px] p-10" dangerouslySetInnerHTML={{ __html: themedHtml }} />
      </div>
    </div>
  );
}
