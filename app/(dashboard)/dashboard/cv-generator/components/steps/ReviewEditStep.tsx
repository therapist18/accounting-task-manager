// @ts-nocheck
"use client";

import { ArrowRight, ChevronDown, ChevronRight, Copy, Crosshair, Download, PenLine, FileText as CoverLetterIcon } from "lucide-react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Button } from "@/components/ui/button";
import { CvPreviewPanel } from "../CvPreviewPanel";
import type { ComboOption } from "../CreatableCombobox";
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
  sectionGroups: { label: string; sections: { id: string; label: string; icon: any; count: number }[] }[];
  sectionMeta: { id: string; label: string; icon: any; count: number }[];
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
  previewRef: React.RefObject<HTMLDivElement>;
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
  return (
    <PanelGroup direction="horizontal" className="flex-1">
      {/* Left — Sections Sidebar (Collapsible Accordion) */}
      <Panel defaultSize={14} minSize={10} className="bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="px-3 py-2.5 border-b border-slate-200 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">Sections</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sectionGroups.map((group) => (
            <div key={group.label}>
              <button
                onClick={() => setCollapsedGroups(prev => ({ ...prev, [group.label]: !prev[group.label] }))}
                className="w-full flex items-center gap-1.5 px-2 py-1 rounded text-sm font-bold text-slate-400 uppercase tracking-wider hover:text-slate-600"
              >
                {collapsedGroups[group.label] ? <ChevronRight className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
                {group.label}
              </button>
              {!collapsedGroups[group.label] && (
                <div className="space-y-0.5 mt-0.5">
                  {group.sections.map((sec) => {
                    const Icon = sec.icon
                    const isActive = activeSection === sec.id
                    const isComplete = sec.count > 0 || (sec.id === 'contact')
                    return (
                      <button
                        key={sec.id}
                        onClick={() => setActiveSection(sec.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-left transition-all ${
                          isActive ? 'bg-custom-blue text-white shadow-sm' : 'hover:bg-slate-50 text-slate-600'
                        }`}
                      >
                        <Icon className={`h-3 w-3 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                        <span className="text-sm font-semibold flex-1 truncate">{sec.label}</span>
                        <span className={`text-sm font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                          isActive ? 'bg-white/20 text-white' : isComplete ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
                        }`}>
                          {sec.count}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
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
          <Button size="sm" onClick={() => setShowAdvancedExport(true)} variant="outline" className="w-full text-xs h-7 border-slate-200"><Download className="h-3 w-3 mr-1" /> Advanced Export</Button>
          <Button size="sm" onClick={() => setWorkflowStep('collaboration')} className="w-full text-xs bg-custom-blue hover:bg-[#2d5a94] h-7">
            Client Collaboration <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </Panel>

      <PanelResizeHandle className="w-1.5 bg-slate-100 hover:bg-custom-blue/30 transition-colors cursor-col-resize flex-shrink-0" />

      {/* Center — Editor Panel */}
      <Panel defaultSize={41} minSize={25} className="bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-700 uppercase tracking-wider">{sectionMeta.find(s => s.id === activeSection)?.label || 'Section'}</h2>
          <span className="text-sm text-slate-400">Confidence Score <span className="text-emerald-600 font-bold">92%</span></span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6">

          {activeSection === 'contact' && (
            <ContactEditor cvData={cvData} setCvData={setCvData} applicantId={applicantId} linkedIndividualId={linkedIndividualId} />
          )}

          {activeSection === 'summary' && (
            <SummaryEditor cvData={cvData} setCvData={setCvData} onOpenAiWriter={() => setShowAiWriter(true)} />
          )}

          {activeSection === 'experience' && (
            <ExperienceEditor cvData={cvData} setCvData={setCvData} collapsedItems={collapsedItems} toggleItem={toggleItem} onOpenAiWriter={() => setShowAiWriter(true)} />
          )}

          {activeSection === 'education' && (
            <EducationEditor cvData={cvData} setCvData={setCvData} collapsedItems={collapsedItems} toggleItem={toggleItem} />
          )}

          {activeSection === 'skills' && (
            <SkillsEditor cvData={cvData} setCvData={setCvData} collapsedItems={collapsedItems} toggleItem={toggleItem} />
          )}

          {activeSection === 'internships' && (
            <InternshipsEditor cvData={cvData} setCvData={setCvData} />
          )}

          {activeSection === 'projects' && (
            <ProjectsEditor cvData={cvData} setCvData={setCvData} />
          )}

          {activeSection === 'languages' && (
            <LanguagesEditor cvData={cvData} setCvData={setCvData} />
          )}

          {activeSection === 'references' && (
            <ReferencesEditor cvData={cvData} setCvData={setCvData} companyOptions={companyOptions} onCreateCompany={handleCreateCompany} />
          )}

          {activeSection === 'certifications' && (
            <CertificationsEditor cvData={cvData} setCvData={setCvData} />
          )}

          {activeSection === 'achievements' && (
            <AchievementsEditor cvData={cvData} setCvData={setCvData} />
          )}

          {activeSection === 'additionalInfo' && (
            <AdditionalInfoEditor cvData={cvData} setCvData={setCvData} />
          )}

          {activeSection === 'declaration' && (
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
