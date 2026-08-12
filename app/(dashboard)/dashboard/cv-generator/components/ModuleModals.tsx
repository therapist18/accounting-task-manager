// @ts-nocheck
"use client";

import AIWriterModule from "./AIWriterModule";
import ATSOptimizer from "./ATSOptimizer";
import JobMatch from "./JobMatch";
import CoverLetterGenerator from "./CoverLetter";
import ResumeVersions from "./ResumeVersions";
import ResumeAnalytics from "./ResumeAnalytics";
import AdvancedExport from "./AdvancedExport";

interface ModuleModalsProps {
  cvData: any;
  setCvData: (updater: any) => void;
  previewRef: React.RefObject<HTMLDivElement>;
  showAiWriter: boolean;
  setShowAiWriter: (v: boolean) => void;
  showAtsOptimizer: boolean;
  setShowAtsOptimizer: (v: boolean) => void;
  showJobMatch: boolean;
  setShowJobMatch: (v: boolean) => void;
  showCoverLetter: boolean;
  setShowCoverLetter: (v: boolean) => void;
  showResumeVersions: boolean;
  setShowResumeVersions: (v: boolean) => void;
  cvVersions: any[];
  setCvVersions: (updater: any) => void;
  showAnalytics: boolean;
  setShowAnalytics: (v: boolean) => void;
  showAdvancedExport: boolean;
  setShowAdvancedExport: (v: boolean) => void;
}

// AI & Tools feature modals, each closing on backdrop click.
export function ModuleModals({
  cvData,
  setCvData,
  previewRef,
  showAiWriter,
  setShowAiWriter,
  showAtsOptimizer,
  setShowAtsOptimizer,
  showJobMatch,
  setShowJobMatch,
  showCoverLetter,
  setShowCoverLetter,
  showResumeVersions,
  setShowResumeVersions,
  cvVersions,
  setCvVersions,
  showAnalytics,
  setShowAnalytics,
  showAdvancedExport,
  setShowAdvancedExport,
}: ModuleModalsProps) {
  return (
    <>
      {showAiWriter && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowAiWriter(false); }}>
          <AIWriterModule cvData={cvData} setCvData={setCvData} onClose={() => setShowAiWriter(false)} />
        </div>
      )}
      {showAtsOptimizer && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowAtsOptimizer(false); }}>
          <ATSOptimizer cvData={cvData} onClose={() => setShowAtsOptimizer(false)} />
        </div>
      )}
      {showJobMatch && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowJobMatch(false); }}>
          <JobMatch cvData={cvData} onClose={() => setShowJobMatch(false)} />
        </div>
      )}
      {showCoverLetter && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowCoverLetter(false); }}>
          <CoverLetterGenerator cvData={cvData} onClose={() => setShowCoverLetter(false)} />
        </div>
      )}
      {showResumeVersions && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowResumeVersions(false); }}>
          <ResumeVersions cvData={cvData} setCvData={setCvData} cvVersions={cvVersions} setCvVersions={setCvVersions} onClose={() => setShowResumeVersions(false)} />
        </div>
      )}
      {showAnalytics && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowAnalytics(false); }}>
          <ResumeAnalytics cvData={cvData} onClose={() => setShowAnalytics(false)} />
        </div>
      )}
      {showAdvancedExport && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowAdvancedExport(false); }}>
          <AdvancedExport cvData={cvData} previewRef={previewRef as React.RefObject<HTMLDivElement>} onClose={() => setShowAdvancedExport(false)} />
        </div>
      )}
    </>
  );
}
