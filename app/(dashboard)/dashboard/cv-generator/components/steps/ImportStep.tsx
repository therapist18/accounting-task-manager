// @ts-nocheck
"use client";

import { CheckCircle2, ChevronDown, ChevronRight, FileText, Loader2, Save, Search, Trash2, Upload, Users, X, ZoomIn, ZoomOut } from "lucide-react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CVLayout } from "../cv-designs";
import { EMPTY_CV_DATA } from "../../utils/cvGeneratorData";

interface ImportStepProps {
  isExtracting: boolean;
  extractionProgress: string;
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  individualSearch: string;
  handleIndividualSearchChange: (value: string) => void;
  isSearching: boolean;
  searchResults: any[];
  handleSelectIndividual: (individual: any) => void;
  selectedIndividual: any;
  setSelectedIndividual: (v: any) => void;
  setIndividualPhoto: (v: any) => void;
  setPendingPhotoPreview: (v: any) => void;
  setPendingPhotoFile: (v: any) => void;
  setShowSavePhotoPrompt: (v: boolean) => void;
  setShowSaveCvPrompt: (v: boolean) => void;
  applyIndividualToCV: () => void;
  setCvData: (updater: any) => void;
  setWorkflowStep: (step: string) => void;
  setActiveSection: (id: string) => void;
  showDraftsList: boolean;
  setShowDraftsList: (updater: any) => void;
  cvDrafts: { id: string; name: string; data: any; createdAt: string; isPortalDraft: boolean }[];
  loadDraft: (draft: any) => void;
  deleteDraft: (id: string) => void;
  zoomLevel: number;
  setZoomLevel: (updater: any) => void;
  cvData: any;
  cvSettings: any;
  selectedLayout: string;
  previewRef: React.RefObject<HTMLDivElement>;
}

export function ImportStep({
  isExtracting,
  extractionProgress,
  handleFileUpload,
  individualSearch,
  handleIndividualSearchChange,
  isSearching,
  searchResults,
  handleSelectIndividual,
  selectedIndividual,
  setSelectedIndividual,
  setIndividualPhoto,
  setPendingPhotoPreview,
  setPendingPhotoFile,
  setShowSavePhotoPrompt,
  setShowSaveCvPrompt,
  applyIndividualToCV,
  setCvData,
  setWorkflowStep,
  setActiveSection,
  showDraftsList,
  setShowDraftsList,
  cvDrafts,
  loadDraft,
  deleteDraft,
  zoomLevel,
  setZoomLevel,
  cvData,
  cvSettings,
  selectedLayout,
  previewRef,
}: ImportStepProps) {
  return (
    <PanelGroup direction="horizontal" className="flex-1">
      <Panel defaultSize={55} minSize={30} className="flex flex-col gap-4 overflow-y-auto p-4">
        {/* Top row: 3 import cards */}
        <div className="grid grid-cols-3 gap-4">
          {/* Upload CV */}
          <div className="bg-white border border-slate-200 shadow-sm p-5 flex flex-col items-center text-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-blue-50 flex items-center justify-center">
              <Upload className="h-5 w-5 text-custom-blue" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Upload CV</h3>
              <p className="text-xs text-slate-400 mt-0.5">Parse an existing CV file</p>
            </div>
            <div className="flex flex-wrap gap-1 justify-center">
              <span className="text-xs font-medium bg-slate-100 text-slate-500 px-2 py-0.5 rounded">PDF</span>
              <span className="text-xs font-medium bg-slate-100 text-slate-500 px-2 py-0.5 rounded">DOCX</span>
              <span className="text-xs font-medium bg-slate-100 text-slate-500 px-2 py-0.5 rounded">TXT</span>
            </div>
            <Input type="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg" onChange={handleFileUpload} className="hidden" id="import-file-upload" disabled={isExtracting} />
            <Button asChild variant="outline" className="w-full h-8 text-xs" disabled={isExtracting}>
              <label htmlFor="import-file-upload" className="cursor-pointer">Choose File</label>
            </Button>
            {isExtracting && (
              <div className="flex items-center gap-2 text-xs text-custom-blue">
                <div className="w-3 h-3 border-2 border-custom-blue border-t-transparent rounded-full animate-spin" />
                {extractionProgress}
              </div>
            )}
          </div>

          {/* Import From Registry */}
          <div className="bg-white border border-slate-200 shadow-sm p-5 flex flex-col gap-3">
            <div className="flex flex-col items-center text-center gap-2">
              <div className="h-12 w-12 rounded-2xl bg-blue-50 flex items-center justify-center">
                <Users className="h-5 w-5 text-custom-blue" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Import From Registry</h3>
                <p className="text-xs text-slate-400 mt-0.5">Search the individual registry</p>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input className="pl-9 pr-4 h-8 text-xs bg-slate-50 border-slate-200 focus:bg-white" placeholder="Search by name..." value={individualSearch} onChange={(e) => handleIndividualSearchChange(e.target.value)} />
              {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-slate-400" />}
            </div>
            {searchResults.length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-[160px] overflow-y-auto">
                {searchResults.map((ind: any) => (
                  <button key={ind.id} onClick={() => handleSelectIndividual(ind)} className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-slate-100 last:border-0 transition-colors">
                    <div className="text-xs font-semibold text-slate-800">{ind.full_name}</div>
                    <div className="text-xs text-slate-400">{ind.gender}</div>
                  </button>
                ))}
              </div>
            )}
            {selectedIndividual && (
              <div className="border border-blue-200 rounded-lg bg-blue-50/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">{selectedIndividual.full_name}</span>
                  <button onClick={() => { setSelectedIndividual(null); setIndividualPhoto(null); setPendingPhotoPreview(null); setPendingPhotoFile(null); setShowSavePhotoPrompt(false); setShowSaveCvPrompt(false); }} className="text-slate-400 hover:text-slate-600 p-1"><X className="h-3 w-3" /></button>
                </div>
                <Button onClick={applyIndividualToCV} className="w-full h-7 text-xs" size="sm"><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Apply to CV</Button>
              </div>
            )}
            {!selectedIndividual && !searchResults.length && !isSearching && individualSearch.length < 2 && (
              <p className="text-xs text-slate-400 text-center py-1">Type a name to search</p>
            )}
          </div>

          {/* Start From Scratch */}
          <div className="bg-white border border-slate-200 shadow-sm p-5 flex flex-col items-center text-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-blue-50 flex items-center justify-center">
              <FileText className="h-5 w-5 text-custom-blue" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Start From Scratch</h3>
              <p className="text-xs text-slate-400 mt-0.5">Build your CV manually</p>
            </div>
            <Button onClick={() => { setCvData(EMPTY_CV_DATA); setWorkflowStep('review-edit'); setActiveSection('contact'); }} className="w-full h-8 text-xs bg-custom-blue hover:bg-[#2d5a94]">Start Building</Button>
          </div>
        </div>

        {/* Saved Drafts Section */}
        <div className="bg-white border border-slate-200 shadow-sm rounded-lg overflow-hidden">
          <button
            onClick={() => setShowDraftsList(prev => !prev)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Save className="h-4 w-4 text-custom-blue" />
              <span className="text-sm font-bold text-slate-800">Saved Drafts</span>
              {cvDrafts.length > 0 && (
                <span className="bg-custom-blue text-white text-xs font-bold px-2 py-0.5 rounded-full">{cvDrafts.length}</span>
              )}
            </div>
            {showDraftsList ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
          </button>

          {showDraftsList && (
            <div className="border-t border-slate-100">
              {cvDrafts.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">No saved drafts yet. Save a draft from Review &amp; Edit.</p>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[240px] overflow-y-auto">
                  {cvDrafts.map((draft) => (
                    <div key={draft.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 group">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-800 truncate">{draft.name}</span>
                          {draft.isPortalDraft && (
                            <span className="text-xs bg-blue-50 text-blue-600 font-semibold px-1.5 py-0.5 rounded shrink-0">Portal</span>
                          )}
                        </div>
                        <span className="text-xs text-slate-400">{new Date(draft.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        {draft.data?.personalInfo?.fullName && (
                          <span className="text-xs text-slate-500 block">{draft.data.personalInfo.fullName}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 ml-3">
                        <Button size="sm" onClick={() => loadDraft(draft)} className="h-7 text-xs bg-custom-blue hover:bg-[#2d5a94] text-white px-3">Load</Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteDraft(draft.id)} className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Panel>

      <PanelResizeHandle className="w-1.5 bg-slate-100 hover:bg-custom-blue/30 transition-colors cursor-col-resize flex-shrink-0" />

      <Panel defaultSize={45} minSize={25} className="bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Preview</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setZoomLevel(Math.max(0.4, zoomLevel - 0.05))} className="p-1 hover:bg-slate-100 rounded"><ZoomOut className="h-3.5 w-3.5 text-slate-500" /></button>
            <span className="text-sm font-bold text-slate-600 min-w-[36px] text-center">{Math.round(zoomLevel * 100)}%</span>
            <button onClick={() => setZoomLevel(Math.min(1.2, zoomLevel + 0.05))} className="p-1 hover:bg-slate-100 rounded"><ZoomIn className="h-3.5 w-3.5 text-slate-500" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-6 flex items-start justify-center bg-slate-50 custom-scrollbar">
          <div style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top center', transition: 'transform 0.15s ease-out' }} className="shrink-0">
            <div ref={previewRef} id="cv-preview-container" style={{ width: '210mm', minHeight: '297mm', background: 'white' }}><CVLayout cvData={cvData} cvSettings={cvSettings} selectedLayout={selectedLayout} /></div>
          </div>
        </div>
      </Panel>
    </PanelGroup>
  );
}
