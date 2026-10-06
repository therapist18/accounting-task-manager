'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, FileDown, Download, ChevronDown, FileWarning, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DocumentViewer, type DocumentViewerHandle } from '@/components/contracts/DocumentViewer';
import { downloadBlob, buildWordDocBlob, printElementAsPdf } from '@/lib/documentExport';
import { applyWordSafeDomFixes } from '@/lib/documentTheme';
import { fetchCompanies, Company } from '../../companies/database';
import { ContractsSidebar } from '../components/ContractsSidebar';
import { fetchCompanyEmployees, ContractEmployeeInfo } from '../utils/data';
import { fetchSignatoryNameForCompany } from '../utils/companySettings';
import { applyThemeToHtml, DEFAULT_CONTRACT_THEME } from '../utils/themeEngine';
import {
  LETTER_TEMPLATES, getLetterTemplate, renderLetterHtml,
  type LetterContext, type LetterTypeKey,
} from '../utils/letterTemplates';

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function EmploymentLettersPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [employee, setEmployee] = useState<ContractEmployeeInfo | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [signatoryName, setSignatoryName] = useState('');
  const [letterType, setLetterType] = useState<LetterTypeKey>('resignation');
  // Keyed by letter type so switching type and back keeps what was typed.
  const [valuesByType, setValuesByType] = useState<Record<string, Record<string, string>>>({});
  const viewerRef = useRef<DocumentViewerHandle>(null);

  const template = getLetterTemplate(letterType);

  // The sidebar only reports ids - load the full employee + company here.
  useEffect(() => {
    let cancelled = false;
    if (!companyId || !employeeId) { setEmployee(null); setCompany(null); return; }
    Promise.all([fetchCompanyEmployees(companyId), fetchCompanies(), fetchSignatoryNameForCompany(companyId)])
      .then(([emps, comps, signatory]) => {
        if (cancelled) return;
        setEmployee(emps.find((e) => String(e.individualId) === employeeId) || null);
        setCompany(comps.find((c) => String(c.id) === companyId) || null);
        setSignatoryName(signatory);
      });
    return () => { cancelled = true; };
  }, [companyId, employeeId]);

  const values = useMemo(() => {
    const defaults: Record<string, string> = {};
    for (const f of template.fields) {
      if (f.defaultValue) defaults[f.key] = f.defaultValue === 'today' ? todayIso() : f.defaultValue;
    }
    return { ...defaults, ...(valuesByType[letterType] || {}) };
  }, [template, valuesByType, letterType]);

  const setValue = (key: string, v: string) =>
    setValuesByType((prev) => ({ ...prev, [letterType]: { ...(prev[letterType] || {}), [key]: v } }));

  const ctx: LetterContext | null = employee ? {
    employee_name: employee.fullName,
    employee_number: employee.employeeNumber,
    national_id: employee.nationalId,
    job_title: employee.jobTitle,
    department: employee.department,
    start_date: employee.startDate,
    company_name: company?.company_name || '',
    signatory_name: signatoryName,
  } : null;

  const themed = (html: string, wordSafe = false) =>
    applyThemeToHtml(html, DEFAULT_CONTRACT_THEME, wordSafe ? { wordSafe: true } : undefined);

  const previewHtml = ctx ? themed(renderLetterHtml(template, values, ctx, { forExport: false })) : '';
  const exportHtml = ctx ? themed(renderLetterHtml(template, values, ctx, { forExport: true })) : '';

  const baseName = employee ? `${employee.fullName.replace(/\s+/g, '_')}_${template.title.replace(/[^\w]+/g, '_')}` : '';

  const handlePdf = () => {
    if (!employee) return;
    printElementAsPdf({ element: viewerRef.current?.getPrintArea() ?? null, fileName: baseName })
      .catch((err) => console.error('PDF generation failed', err));
  };

  const handleWord = () => {
    if (!ctx || !employee) return;
    const wordHtml = themed(renderLetterHtml(template, values, ctx, { forExport: true }), true);
    const styleMatch = wordHtml.match(/<style>([\s\S]*?)<\/style>/);
    const themeCss = styleMatch ? styleMatch[1] : '';
    let bodyContent = wordHtml.replace(/<style>[\s\S]*?<\/style>/, '');
    if (typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(`<div>${bodyContent}</div>`, 'text/html');
      applyWordSafeDomFixes(doc, {
        themeCss,
        rootSelector: `.contract-theme-${DEFAULT_CONTRACT_THEME.theme}`,
        fontFamily: DEFAULT_CONTRACT_THEME.fontFamily,
        bookmarkSelector: 'section[id]',
      });
      bodyContent = doc.body.firstElementChild?.innerHTML ?? bodyContent;
    }
    downloadBlob(
      buildWordDocBlob({
        title: `${employee.fullName} ${template.title}`,
        html: bodyContent,
        css: `${themeCss}
  [class^="contract-theme-"] { padding: 0 !important; max-width: 100% !important; margin: 0 !important; }`,
        pageSize: '8.5in 11.7in',
        pageMargin: '0.5in',
      }),
      `${baseName}.doc`
    );
  };

  return (
    <div className="h-screen w-full overflow-hidden bg-[#f3f4f6] dark:bg-[#0a0a0a] flex flex-col">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shrink-0 shadow-sm">
        <Mail className="w-5 h-5 text-custom-blue" />
        <h1 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">Employment Letters</h1>
        <p className="hidden md:block text-sm text-slate-400 ml-2">Resignation, termination, dismissal and other separation letters.</p>
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="w-72 shrink-0 min-h-0">
          <ContractsSidebar
            selectedCompanyId={companyId}
            selectedEmployeeId={employeeId}
            onCompanySelect={setCompanyId}
            onSelectEmployee={(c, e) => { setCompanyId(c); setEmployeeId(e); }}
          />
        </div>

        {/* Letter type + fields */}
        <div className="w-96 shrink-0 min-h-0 overflow-y-auto bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">Letter type</h2>
            <div className="space-y-1">
              {LETTER_TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setLetterType(t.key)}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                    letterType === t.key
                      ? 'bg-custom-blue text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  )}
                >
                  <span className="flex items-center gap-2 font-medium"><FileText className="w-4 h-4 shrink-0" />{t.title}</span>
                  <span className={cn('block text-xs mt-0.5 ml-6', letterType === t.key ? 'text-blue-100' : 'text-slate-400')}>{t.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 space-y-4">
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">Details</h2>
            {template.fields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label className="text-xs text-slate-500">{f.label}</Label>
                {f.type === 'textarea' ? (
                  <Textarea
                    rows={3}
                    value={values[f.key] || ''}
                    placeholder={f.placeholder}
                    onChange={(e) => setValue(f.key, e.target.value)}
                    className="text-sm"
                  />
                ) : (
                  <Input
                    type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                    value={values[f.key] || ''}
                    placeholder={f.placeholder}
                    onChange={(e) => setValue(f.key, e.target.value)}
                    className="h-9 text-sm"
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 min-w-0 min-h-0">
          {!employee ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 bg-white dark:bg-slate-900">
              <FileWarning className="w-12 h-12 mb-4 text-slate-300 dark:text-slate-700" />
              <h3 className="text-base font-medium text-slate-700 dark:text-slate-300">No Employee Selected</h3>
              <p className="text-sm mt-1">Pick an employee to draft a letter.</p>
            </div>
          ) : (
            <DocumentViewer
              ref={viewerRef}
              html={previewHtml}
              printHtml={exportHtml.replace(/id="section-/g, 'id="pdf-section-')}
              contentKey={`${employee.individualId}:${letterType}`}
              className="bg-slate-100/50 dark:bg-slate-900 shadow-inner"
              empty={<div className="flex items-center justify-center h-full text-slate-400 text-sm">Nothing to preview yet.</div>}
              leading={<span className="text-sm font-medium text-slate-600 dark:text-slate-300 truncate">{template.title}</span>}
              actions={
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="h-8 px-3 flex items-center gap-1.5 rounded-lg text-xs font-medium bg-slate-50 border border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0">
                      <Download className="w-3.5 h-3.5" />
                      Export
                      <ChevronDown className="w-3 h-3 ml-0.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40 rounded-xl">
                    <DropdownMenuItem onClick={handlePdf}>
                      <FileDown className="w-3.5 h-3.5 mr-2 text-slate-400" /> PDF Document
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleWord}>
                      <FileText className="w-3.5 h-3.5 mr-2 text-slate-400" /> Word Document
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
