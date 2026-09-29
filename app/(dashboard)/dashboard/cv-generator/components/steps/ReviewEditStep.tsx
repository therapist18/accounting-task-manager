"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertCircle, ArrowRight, ChevronDown, ChevronRight, Copy, Crosshair, Database, Download, PenLine, FileText as CoverLetterIcon, LayoutGrid, ListTree, Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Button } from "@/components/ui/button";
import { CvPreviewPanel } from "../CvPreviewPanel";
import { CvVariablesTable } from "../CvVariablesTable";
import { type DocumentViewerHandle } from "@/components/contracts/DocumentViewer";
import type { ComboOption } from "../CreatableCombobox";
import { generateCvVariablesTemplate } from "../../utils/cvExcelExport";
import { importCvVariablesFile } from "../../utils/cvExcelImport";
import {
  ContactEditor,
  SummaryEditor,
  ExperienceEditor,
  InternshipsEditor,
  EducationEditor,
  SkillsEditor,
  ProjectsEditor,
  LanguagesEditor,
  ReferencesEditor,
  CertificationsEditor,
  AchievementsEditor,
  AdditionalInfoEditor,
  DeclarationEditor,
} from "../editors/SectionEditors";

interface ReviewEditStepProps {
  sectionGroups: { label: string; sections: { id: string; label: string; icon: any; count: number; incomplete?: boolean }[] }[];
  sectionMeta: { id: string; label: string; icon: any; count: number; incomplete?: boolean }[];
  collapsedGroups: Record<string, boolean>;
  setCollapsedGroups: (updater: any) => void;
  activeSection: string;
  setActiveSection: (id: string) => void;
  setShowAiWriter: (v: boolean) => void;
  setShowJobMatch: (v: boolean) => void;
  setShowCoverLetter: (v: boolean) => void;
  setShowResumeVersions: (v: boolean) => void;
  setShowAdvancedExport: (v: boolean) => void;
  setWorkflowStep: (step: string) => void;
  cvData: any;
  setCvData: (updater: any) => void;
  applicantId: string | null;
  linkedIndividualId: number | null;
  collapsedItems: Record<string, boolean>;
  toggleItem: (key: string) => void;
  companyOptions: ComboOption[];
  handleCreateCompany: (label: string) => Promise<string>;
  selectedLayout: string;
  cvSettings: any;
  previewRef: React.RefObject<DocumentViewerHandle | null>;
}

export function ReviewEditStep({
  sectionGroups,
  sectionMeta,
  collapsedGroups,
  setCollapsedGroups,
  activeSection,
  setActiveSection,
  setShowAiWriter,
  setShowJobMatch,
  setShowCoverLetter,
  setShowResumeVersions,
  setShowAdvancedExport,
  setWorkflowStep,
  cvData,
  setCvData,
  applicantId,
  linkedIndividualId,
  collapsedItems,
  toggleItem,
  companyOptions,
  handleCreateCompany,
  selectedLayout,
  cvSettings,
  previewRef,
}: ReviewEditStepProps) {
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'form' | 'table'>('form');
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const handleExportVariables = async () => {
    setExporting(true);
    try {
      await generateCvVariablesTemplate(cvData);
      toast.success('CV data exported');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to export CV data');
    } finally {
      setExporting(false);
    }
  };

  const handleImportVariables = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const result = await importCvVariablesFile(file, cvData);
      if (!result) {
        toast.error('Could not find any recognizable sheets in this file — import a file exported from this page.');
        return;
      }
      setCvData(result.cvData);
      const sectionsSummary = result.summary.sections.map((s) => `${s.label}: ${s.rowsImported}`).join(', ');
      const missingTotal = result.summary.sections.reduce((sum, s) => sum + s.rowsWithMissingRequired, 0);
      toast.success('CV data imported', {
        description: [
          result.summary.scalarFieldsRead > 0 ? `${result.summary.scalarFieldsRead} contact/detail field(s)` : null,
          sectionsSummary || null,
          missingTotal > 0 ? `${missingTotal} row(s) still missing required fields` : null,
        ].filter(Boolean).join(' • ') || undefined,
      });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to import CV data');
    } finally {
      setImporting(false);
    }
  };

  const isSectionComplete = (sec: { id: string; count: number; incomplete?: boolean }) =>
    sec.incomplete !== undefined ? !sec.incomplete : sec.count > 0 || sec.id === 'contact';
  const totalSections = sectionMeta.length;
  const missingSections = sectionMeta.filter((sec) => !isSectionComplete(sec));
  const completeCount = totalSections - missingSections.length;

  const goToNextMissing = () => {
    if (!missingSections.length) return;
    const orderedIds = sectionMeta.map((s) => s.id);
    const missingIds = missingSections.map((s) => s.id);
    const curPos = orderedIds.indexOf(activeSection);
    const next = missingIds.find((id) => orderedIds.indexOf(id) > curPos) || missingIds[0];
    setActiveSection(next);
  };

  return (
    <PanelGroup direction="horizontal" className="flex-1">
      {/* Left — Sections Sidebar (Collapsible Accordion) */}
      <Panel defaultSize={14} minSize={10} className="bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="px-3 py-2.5 border-b border-slate-200 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">Sections</span>
            <span className={`text-sm font-bold ${missingSections.length ? 'text-amber-600' : 'text-emerald-600'}`}>
              {completeCount}/{totalSections}
            </span>
          </div>
          {missingSections.length > 0 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowMissingOnly((v) => !v)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1 rounded text-sm font-semibold border transition-colors ${
                  showMissingOnly
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                }`}
                title="Show only sections with no data"
              >
                <AlertCircle className="h-3 w-3" />
                {missingSections.length} missing
              </button>
              {!showMissingOnly && (
                <button
                  onClick={goToNextMissing}
                  className="px-2 py-1 rounded text-sm font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200"
                  title="Jump to next missing section"
                >
                  Next
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sectionGroups.map((group) => {
            const visibleSections = showMissingOnly
              ? group.sections.filter((sec) => !isSectionComplete(sec))
              : group.sections;
            if (!visibleSections.length) return null;
            return (
              <div key={group.label}>
                <button
                  onClick={() => setCollapsedGroups((prev: Record<string, boolean>) => ({ ...prev, [group.label]: !prev[group.label] }))}
                  className="w-full flex items-center gap-1.5 px-2 py-1 rounded text-sm font-bold text-slate-400 uppercase tracking-wider hover:text-slate-600"
                >
                  {(!showMissingOnly && collapsedGroups[group.label]) ? <ChevronRight className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
                  {group.label}
                </button>
                {(showMissingOnly || !collapsedGroups[group.label]) && (
                  <div className="space-y-0.5 mt-0.5">
                    {visibleSections.map((sec) => {
                      const Icon = sec.icon
                      const isActive = activeSection === sec.id
                      const isComplete = isSectionComplete(sec)
                      return (
                        <button
                          key={sec.id}
                          onClick={() => setActiveSection(sec.id)}
                          className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-left transition-all ${
                            isActive
                              ? 'bg-custom-blue text-white shadow-sm'
                              : isComplete
                                ? 'hover:bg-slate-50 text-slate-600'
                                : 'bg-amber-50/60 hover:bg-amber-50 text-slate-700 ring-1 ring-amber-200'
                          }`}
                        >
                          <Icon className={`h-3 w-3 ${isActive ? 'text-white' : isComplete ? 'text-slate-400' : 'text-amber-500'}`} />
                          <span className="text-sm font-semibold flex-1 truncate">{sec.label}</span>
                          <span className={`text-sm font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                            isActive ? 'bg-white/20 text-white' : isComplete ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {sec.count}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* AI & Tools Panel */}
        <div className="border-t border-slate-200 p-2 space-y-1.5">
          <span className="text-sm font-bold text-slate-400 uppercase tracking-wider px-1 block">AI &amp; Tools</span>
          <button onClick={() => setShowAiWriter(true)} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left hover:bg-purple-50 text-slate-600 text-sm font-semibold"><PenLine className="h-3 w-3 text-purple-500" /> AI Writer</button>
          <button onClick={() => setShowJobMatch(true)} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left hover:bg-blue-50 text-slate-600 text-sm font-semibold"><Crosshair className="h-3 w-3 text-blue-600" /> Job Match</button>
          <button onClick={() => setShowCoverLetter(true)} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left hover:bg-green-50 text-slate-600 text-sm font-semibold"><CoverLetterIcon className="h-3 w-3 text-green-600" /> Cover Letter</button>
          <button onClick={() => setShowResumeVersions(true)} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left hover:bg-slate-50 text-slate-600 text-sm font-semibold"><Copy className="h-3 w-3 text-slate-500" /> Versions</button>
        </div>
        <div className="border-t border-slate-200 p-3 space-y-1.5">
          <Button asChild size="sm" variant="outline" className="w-full text-xs h-7 border-slate-200">
            <Link href="/dashboard/cv-generator/settings"><Database className="h-3 w-3 mr-1" /> Field Sources</Link>
          </Button>
          <Button size="sm" onClick={() => setShowAdvancedExport(true)} variant="outline" className="w-full text-xs h-7 border-slate-200"><Download className="h-3 w-3 mr-1" /> Advanced Export</Button>
          <Button size="sm" onClick={handleExportVariables} disabled={exporting} variant="outline" className="w-full text-xs h-7 border-slate-200">
            {exporting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <FileSpreadsheet className="h-3 w-3 mr-1" />} Export to Excel
          </Button>
          <Button size="sm" onClick={() => importFileRef.current?.click()} disabled={importing} variant="outline" className="w-full text-xs h-7 border-slate-200">
            {importing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />} Import from Excel
          </Button>
          <input ref={importFileRef} type="file" accept=".xlsx" className="hidden" onChange={handleImportVariables} />
          <Button size="sm" onClick={() => setWorkflowStep('collaboration')} className="w-full text-xs bg-custom-blue hover:bg-[#2d5a94] h-7">
            Client Collaboration <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </Panel>

      <PanelResizeHandle className="w-1.5 bg-slate-100 hover:bg-custom-blue/30 transition-colors cursor-col-resize flex-shrink-0" />

      {/* Center — Editor Panel */}
      <Panel defaultSize={41} minSize={25} className="bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-700 uppercase tracking-wider truncate">
            {viewMode === 'table' ? 'All Variables' : (sectionMeta.find(s => s.id === activeSection)?.label || 'Section')}
          </h2>
          <div className="flex items-center gap-3 shrink-0">
            <div className="p-0.5 bg-slate-100 rounded-lg inline-flex items-center shadow-inner">
              <button
                onClick={() => setViewMode('form')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${viewMode === 'form' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                title="Form view — one section at a time"
              >
                <ListTree className="h-3 w-3" /> Form
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${viewMode === 'table' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                title="Table view — all sections and fields at once"
              >
                <LayoutGrid className="h-3 w-3" /> Table
              </button>
            </div>
            <span className="text-sm text-slate-400">Confidence Score <span className="text-emerald-600 font-bold">92%</span></span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6">

          {viewMode === 'table' && (
            <CvVariablesTable cvData={cvData} setCvData={setCvData} />
          )}

          {viewMode === 'form' && activeSection === 'contact' && (
            <ContactEditor cvData={cvData} setCvData={setCvData} applicantId={applicantId} linkedIndividualId={linkedIndividualId} />
          )}

          {viewMode === 'form' && activeSection === 'summary' && (
            <SummaryEditor cvData={cvData} setCvData={setCvData} onOpenAiWriter={() => setShowAiWriter(true)} />
          )}

          {viewMode === 'form' && activeSection === 'experience' && (
            <ExperienceEditor cvData={cvData} setCvData={setCvData} collapsedItems={collapsedItems} toggleItem={toggleItem} onOpenAiWriter={() => setShowAiWriter(true)} />
          )}

          {viewMode === 'form' && activeSection === 'education' && (
            <EducationEditor cvData={cvData} setCvData={setCvData} collapsedItems={collapsedItems} toggleItem={toggleItem} />
          )}

          {viewMode === 'form' && activeSection === 'skills' && (
            <SkillsEditor cvData={cvData} setCvData={setCvData} collapsedItems={collapsedItems} toggleItem={toggleItem} />
          )}

          {viewMode === 'form' && activeSection === 'internships' && (
            <InternshipsEditor cvData={cvData} setCvData={setCvData} />
          )}

          {viewMode === 'form' && activeSection === 'projects' && (
            <ProjectsEditor cvData={cvData} setCvData={setCvData} />
          )}

          {viewMode === 'form' && activeSection === 'languages' && (
            <LanguagesEditor cvData={cvData} setCvData={setCvData} />
          )}

          {viewMode === 'form' && activeSection === 'references' && (
            <ReferencesEditor cvData={cvData} setCvData={setCvData} companyOptions={companyOptions} onCreateCompany={handleCreateCompany} />
          )}

          {viewMode === 'form' && activeSection === 'certifications' && (
            <CertificationsEditor cvData={cvData} setCvData={setCvData} />
          )}

          {viewMode === 'form' && activeSection === 'achievements' && (
            <AchievementsEditor cvData={cvData} setCvData={setCvData} />
          )}

          {viewMode === 'form' && activeSection === 'additionalInfo' && (
            <AdditionalInfoEditor cvData={cvData} setCvData={setCvData} />
          )}

          {viewMode === 'form' && activeSection === 'declaration' && (
            <DeclarationEditor cvData={cvData} setCvData={setCvData} />
          )}

        </div>
      </Panel>

      <PanelResizeHandle className="w-1.5 bg-slate-100 hover:bg-custom-blue/30 transition-colors cursor-col-resize flex-shrink-0" />

      {/* Right — Preview Panel (Review & Edit step) */}
      <Panel defaultSize={45} minSize={25} className="overflow-hidden flex flex-col">
        <CvPreviewPanel
          cvData={cvData}
          cvSettings={cvSettings}
          selectedLayout={selectedLayout}
          previewRef={previewRef}
          title="Live Preview"
        />
      </Panel>
    </PanelGroup>
  );
}
