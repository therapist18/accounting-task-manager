// @ts-nocheck
"use client";

import { AlertCircle, Check, CheckCircle2, RefreshCw, Sparkles } from "lucide-react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { analyzeCVCompleteness, getCVDiffs } from "../../utils/cvGeneratorData";

interface CollaborationStepProps {
  collabTargetCountry: 'kenya' | 'other';
  setCollabTargetCountry: (v: 'kenya' | 'other') => void;
  collabTargetRole: string;
  setCollabTargetRole: (v: string) => void;
  cvData: any;
  currentPortalDraftId: string | null;
  cvDrafts: { id: string; name: string; data: any; createdAt: string; isPortalDraft: boolean }[];
  hasSavedDraft: boolean;
  applicantId: string | null;
  setDraftNameInput: (v: string) => void;
  setSavingDraftForPortal: (v: boolean) => void;
  setShowSaveDraftModal: (v: boolean) => void;
  setWorkflowStep: (step: string) => void;
  setClientSubmission: (data: any) => void;
  setHasClientSubmission: (v: boolean) => void;
  hasClientSubmission: boolean;
  checkForClientSubmission: () => void;
  clientSubmission: any;
  acceptedFields: Record<string, boolean>;
  setAcceptedFields: (updater: any) => void;
  handleMergeUpdates: () => void;
}

export function CollaborationStep({
  collabTargetCountry,
  setCollabTargetCountry,
  collabTargetRole,
  setCollabTargetRole,
  cvData,
  currentPortalDraftId,
  cvDrafts,
  hasSavedDraft,
  applicantId,
  setDraftNameInput,
  setSavingDraftForPortal,
  setShowSaveDraftModal,
  setWorkflowStep,
  setClientSubmission,
  setHasClientSubmission,
  hasClientSubmission,
  checkForClientSubmission,
  clientSubmission,
  acceptedFields,
  setAcceptedFields,
  handleMergeUpdates,
}: CollaborationStepProps) {
  return (
    <PanelGroup direction="horizontal" className="flex-1 overflow-hidden">
      {/* Left Column: Configuration & Audit */}
      <Panel defaultSize={45} minSize={30} className="bg-white border border-slate-200 shadow-sm p-6 flex flex-col gap-6 overflow-y-auto text-left">

        {/* Header section */}
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-custom-blue" />
            Client Review Link Setup
          </h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Generate an interactive portal link for your client. Instead of writing WhatsApp questionnaires, send this link so they can complete missing fields, verify employment gaps, and choose their CV layout style.
          </p>
        </div>

        {/* Portal Customization Form */}
        <div className="space-y-4 border-t border-slate-100 pt-4">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Configure Dynamic Questions</h4>
          <div className="grid grid-cols-2 gap-4 text-left">
            <div className="space-y-1.5 text-left">
              <Label className="text-sm font-bold text-slate-500 uppercase tracking-wider">Job Region / Context</Label>
              <Select
                value={collabTargetCountry}
                onValueChange={(val: 'kenya' | 'other') => setCollabTargetCountry(val)}
              >
                <SelectTrigger className="h-9 text-xs text-left">
                  <SelectValue placeholder="Select Country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kenya">Applying for Kenya (Permit/Driving/Residency)</SelectItem>
                  <SelectItem value="other">General / International</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 text-left">
              <Label className="text-sm font-bold text-slate-500 uppercase tracking-wider">Target Job Category</Label>
              <Select
                value={collabTargetRole}
                onValueChange={(val: string) => setCollabTargetRole(val)}
              >
                <SelectTrigger className="h-9 text-xs text-left">
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="software-engineer">Software &amp; Cloud Engineer</SelectItem>
                  <SelectItem value="accountant">Accountant / Financial Officer</SelectItem>
                  <SelectItem value="teacher">Teacher / Academic Educator</SelectItem>
                  <SelectItem value="healthcare">Healthcare Professional</SelectItem>
                  <SelectItem value="other">Other / Standard Profile</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Audit readiness section */}
        {(() => {
          const { completionPercent, checklist, gaps } = analyzeCVCompleteness(cvData);
          return (
            <div className="space-y-4 border-t border-slate-100 pt-4">
              <h4 className="text-xs font-bold text-slate-505 text-slate-500 uppercase tracking-wider font-semibold">AI CV Readiness Audit</h4>

              {/* Progress */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">Current Completeness:</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  completionPercent > 80 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                }`}>{completionPercent}%</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-350 ${
                  completionPercent > 80 ? 'bg-emerald-500' : 'bg-amber-500'
                }`} style={{ width: `${completionPercent}%` }} />
              </div>

              {/* Gap Detection Details */}
              {gaps.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200/50 rounded-lg text-xs text-amber-755 text-amber-700">
                  <div className="font-bold flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {gaps.length} Employment Gaps Detected
                  </div>
                  <ul className="list-disc pl-4 mt-1 space-y-0.5 text-sm text-amber-600">
                    {gaps.map((g: any, i: number) => (
                      <li key={i}>{g.gapYears}yr gap between {g.prevCompany} &amp; {g.currCompany} ({g.from}-{g.to})</li>
                    ))}
                  </ul>
                  <p className="text-sm text-amber-500 mt-1 font-semibold">Client will automatically be asked to declare activities for this gap.</p>
                </div>
              )}

              {/* Missing checklist */}
              <div className="space-y-1.5">
                {checklist.filter(item => item.missing).map(item => (
                  <div key={item.id} className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 p-2 rounded border border-slate-100">
                    <AlertCircle className="h-3.5 w-3.5 text-slate-400" />
                    <span>Missing <strong>{item.label}</strong> details</span>
                    {item.missingItems && item.missingItems.length > 0 && (
                      <span className="text-sm text-slate-400">({item.missingItems.join(', ')})</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Secure link box */}
        {(() => {
          // A portal-specific draft blob (currentPortalDraftId / cvDrafts) is only
          // needed to resolve the storage backup path. Whether we can actually share
          // a link is broader: it's also true whenever this applicant already has a
          // bcl_cv_snapshot saved in the database (hasSavedDraft is set on load in
          // that case), so we don't force a redundant "Save Draft" step.
          const draftId = currentPortalDraftId || (cvDrafts.length > 0 ? cvDrafts[0].id : null);
          const canShareLink = hasSavedDraft || !!draftId;
          const getCollabPortalLink = () => {
            const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
            const draftParam = draftId ? `&draftId=${draftId}` : '';
            const applicantParam = applicantId ? `&applicantId=${applicantId}` : '';
            return `${origin}/dashboard/cv-generator?portal=true${draftParam}${applicantParam}`;
          };
          const collabLink = getCollabPortalLink();
          return (
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-3.5 mt-auto">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">Secure Review URL</span>
                {canShareLink
                  ? <span className="text-sm bg-emerald-50 text-emerald-600 font-extrabold uppercase px-1.5 py-0.5 rounded">Draft Ready</span>
                  : <span className="text-sm bg-amber-50 text-amber-600 font-extrabold uppercase px-1.5 py-0.5 rounded">Save Draft First</span>
                }
              </div>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={canShareLink ? collabLink : 'Save draft first to generate secure link...'}
                  className="h-8 text-xs font-mono bg-white select-all text-slate-500"
                />
                <Button size="sm" onClick={async () => {
                  if (!canShareLink) {
                    // No draft/snapshot exists yet - save one first
                    setDraftNameInput(`CV - ${cvData.personalInfo?.fullName || 'Draft'} - ${new Date().toLocaleDateString()}`);
                    setSavingDraftForPortal(true);
                    setShowSaveDraftModal(true);
                  } else {
                    // Draft/snapshot already exists - just copy the link
                    navigator.clipboard.writeText(collabLink);
                    toast.success("Client review link copied to clipboard!");
                  }
                }} className="text-xs h-8 px-3">
                  {canShareLink ? 'Copy' : 'Save & Copy'}
                </Button>
              </div>
            </div>
          );
        })()}

        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setWorkflowStep('client-portal');
            }}
            className="text-xs h-9 bg-white border-slate-200 hover:bg-slate-50 text-slate-700 font-bold"
          >
            Open Client View (Demo)
          </Button>
          <Button
            size="sm"
            onClick={() => {
              const mockSubmission = JSON.parse(JSON.stringify(cvData));
              mockSubmission.personalInfo.linkedin = 'linkedin.com/in/ajay-yadav-specialist';
              mockSubmission.personalInfo.github = 'github.com/ajay-yadav-developer';
              mockSubmission.summary = "REVISED SUMMARY: Results-driven Senior Web Automation Engineer with 6+ years of expertise. Speeds up data parsing pipelines by 40%. Certified in AWS Cloud architecture.";
              mockSubmission.skills = [
                ...mockSubmission.skills,
                { category: "Cloud & AI", items: "AWS Core, ChatGPT Prompt Engineering, Docker Containers" }
              ];
              mockSubmission.languages = [
                ...mockSubmission.languages,
                { language: "Swahili", proficiency: "Basic" }
              ];
              setClientSubmission(mockSubmission);
              setHasClientSubmission(true);
              toast.success("Simulated client updates loaded! Check the right side panel.");
            }}
            className="text-xs h-9 bg-blue-600 hover:bg-blue-750 text-white font-bold"
          >
            Simulate Client Submission
          </Button>
        </div>
      </Panel>

      <PanelResizeHandle className="w-1.5 bg-slate-100 hover:bg-custom-blue/30 transition-colors cursor-col-resize flex-shrink-0" />

      {/* Right Column: Git-Style Review & Merge Panel */}
      <Panel defaultSize={55} minSize={30} className="bg-white border border-slate-200 shadow-sm p-6 flex flex-col gap-4 overflow-hidden text-left">

        {!hasClientSubmission ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-4">
            <div className="h-16 w-16 bg-blue-50 text-custom-blue rounded-full flex items-center justify-center animate-pulse">
              <RefreshCw className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Awaiting Client Updates...</h3>
              <p className="text-xs text-slate-400 max-w-sm mt-1 mx-auto leading-relaxed">
                Once the client opens the link, edits details, answers gap questions, and submits their responses, their changes will display here for your approval.
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-150 p-4 rounded-xl text-xs max-w-md text-left text-slate-500">
              <strong className="text-slate-700 block mb-1">💡 Interactive Simulator Guide</strong>
              To test the collaboration loop:
              <ol className="list-decimal pl-4 mt-1 space-y-1 text-sm text-slate-500">
                <li>Click <strong>Open Client View</strong> on the left to act as the client.</li>
                <li>Review the dashboard, answer the gap questions, fill in links, and select a theme.</li>
                <li>Click <strong>Submit to Recruiter</strong> at the end of the portal.</li>
                <li>You'll be redirected back here to review and merge their entries with a full Git-style diff!</li>
              </ol>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-9 border-slate-200 gap-2 hover:bg-slate-50"
              onClick={checkForClientSubmission}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Check for Client Updates
            </Button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col h-full overflow-hidden text-left">
            {/* Header */}
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 animate-bounce" />
                  Client Submission Received!
                </h3>
                <p className="text-sm text-slate-450 mt-0.5">GitHub-style comparison. Accept or reject modifications before updating registry.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm bg-emerald-50 text-emerald-600 font-extrabold uppercase px-2 py-0.5 rounded">Ready for Merge</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const diffs = getCVDiffs(cvData, clientSubmission);
                    const allAccepted: Record<string, boolean> = {};
                    diffs.forEach((d: any) => { allAccepted[d.path] = true; });
                    setAcceptedFields(allAccepted);
                    toast.success('All changes accepted');
                  }}
                  className="text-xs h-7 px-2 font-bold text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                >
                  Accept All
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const diffs = getCVDiffs(cvData, clientSubmission);
                    const allRejected: Record<string, boolean> = {};
                    diffs.forEach((d: any) => { allRejected[d.path] = false; });
                    setAcceptedFields(allRejected);
                    toast.success('All changes rejected');
                  }}
                  className="text-xs h-7 px-2 font-bold text-red-600 border-red-200 hover:bg-red-50"
                >
                  Reject All
                </Button>
              </div>
            </div>

            {/* Diff Items Container */}
            <div className="flex-1 overflow-y-auto pr-1 py-4 space-y-4">
              {(() => {
                const diffs = getCVDiffs(cvData, clientSubmission);
                if (diffs.length === 0) {
                  return <p className="text-xs text-slate-400 italic text-center py-8">Client submitted, but no changes were detected relative to the current CV data.</p>;
                }
                return diffs.map((diff: any) => {
                  const isAccepted = acceptedFields[diff.path] !== false;
                  return (
                    <div key={diff.path} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                      {/* Header */}
                      <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                        <span className="text-xs font-bold text-slate-700">{diff.label}</span>
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            variant={isAccepted ? 'default' : 'outline'}
                            onClick={() => {
                              setAcceptedFields(prev => ({ ...prev, [diff.path]: true }));
                            }}
                            className={`text-sm h-6 px-2.5 font-bold ${
                              isAccepted ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'text-slate-500'
                            }`}
                          >
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant={!isAccepted ? 'destructive' : 'outline'}
                            onClick={() => {
                              setAcceptedFields(prev => ({ ...prev, [diff.path]: false }));
                            }}
                            className={`text-sm h-6 px-2.5 font-bold ${
                              !isAccepted ? 'bg-red-650 hover:bg-red-755 text-white' : 'text-slate-550 text-slate-500'
                            }`}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>

                      {/* Side-by-side diff */}
                      <div className="grid grid-cols-2 text-xs leading-normal">
                        {/* Left - Old Registry */}
                        <div className="p-3 bg-red-50/30 border-r border-slate-100 text-red-800 font-mono text-sm whitespace-pre-line text-left">
                          <span className="text-xs uppercase font-bold text-red-400 block font-sans mb-1">- Registry Original</span>
                          {diff.oldVal}
                        </div>
                        {/* Right - Client New */}
                        <div className="p-3 bg-emerald-50/30 text-emerald-800 font-mono text-sm whitespace-pre-line text-left">
                          <span className="text-xs uppercase font-bold text-emerald-400 block font-sans mb-1">+ Client Submitted</span>
                          {diff.newVal}
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Actions footer */}
            <div className="border-t border-slate-100 pt-4 flex gap-3 justify-end shrink-0">
              <Button
                variant="outline"
                onClick={() => {
                  setHasClientSubmission(false);
                  setClientSubmission(null);
                  setAcceptedFields({});
                  toast.info("Client submission discarded.");
                }}
                className="text-xs h-10 border-slate-200 hover:bg-slate-550 hover:bg-slate-50"
              >
                Discard Submission
              </Button>
              <Button
                onClick={handleMergeUpdates}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 px-6 gap-2"
              >
                Merge Approved Updates <Check className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Panel>
    </PanelGroup>
  );
}
