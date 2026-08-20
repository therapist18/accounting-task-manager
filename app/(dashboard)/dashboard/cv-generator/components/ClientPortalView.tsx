"use client";

import { useEffect, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { AlertCircle, Award, Briefcase, Check, FileText, Globe, GraduationCap, BookOpen, MessageSquare, Sparkles, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import supabase from "@/lib/supabase/client";
import { analyzeCVCompleteness, CONSENT_VERSION, PRIVACY_NOTICE } from "../utils/cvGeneratorData";
import {
  ContactEditor,
  SummaryEditor,
  ExperienceEditor,
  EducationEditor,
  SkillsEditor,
  LanguagesEditor,
  ReferencesEditor,
  AchievementsEditor,
} from "./editors/SectionEditors";
import type { ComboOption } from "./CreatableCombobox";

interface ClientPortalViewProps {
  clientEdits: any;
  setClientEdits: (updater: any) => void;
  portalConsentAccepted: boolean;
  portalConsentChecked: boolean;
  setPortalConsentChecked: (v: boolean) => void;
  onAcceptPortalConsent: () => void;
  initiallyMissingSections: Record<string, boolean>;
  portalStep: number;
  setPortalStep: (n: number) => void;
  setWorkflowStep: (step: string) => void;
  handleClientPersonalDetailsChange: (field: string, value: any) => void;
  handleClientGapNoteChange: (gapKey: string, field: 'reason' | 'detail', value: string) => void;
  collabTargetCountry: 'kenya' | 'other';
  portalDraftId: string | null;
  applicantId: string | null;
  linkedIndividualId: number | null;
  portalConsentTimestamp: string | null;
  setClientSubmission: (data: any) => void;
  setHasClientSubmission: (v: boolean) => void;
  companyOptions: ComboOption[];
  onCreateCompany: (label: string) => Promise<string>;
}

export function ClientPortalView({
  clientEdits,
  setClientEdits,
  portalConsentAccepted,
  portalConsentChecked,
  setPortalConsentChecked,
  onAcceptPortalConsent,
  initiallyMissingSections,
  portalStep,
  setPortalStep,
  setWorkflowStep,
  handleClientPersonalDetailsChange,
  handleClientGapNoteChange,
  collabTargetCountry,
  portalDraftId,
  applicantId,
  linkedIndividualId,
  portalConsentTimestamp,
  setClientSubmission,
  setHasClientSubmission,
  companyOptions,
  onCreateCompany,
}: ClientPortalViewProps) {
  // Declared unconditionally, before any early return, so hook call order
  // stays consistent across renders (clientEdits/consent start out false/null
  // and flip to their real values once the parent finishes initializing).
  const [activeSectionId, setActiveSectionId] = useState<string>('');

  // The rest of the app runs a "high-density enterprise" root font-size
  // (11px on desktop, see globals.css) tuned for internal staff tables —
  // wrong for this public-facing candidate portal. Opt the whole document
  // out while this view is mounted, restore it on exit/unmount.
  useEffect(() => {
    document.documentElement.classList.add('cv-portal-view');
    return () => { document.documentElement.classList.remove('cv-portal-view'); };
  }, []);

  if (!clientEdits) return null;

  if (!portalConsentAccepted) {
    return (
      <div className="flex flex-col h-screen overflow-hidden bg-[#FAFAFC] text-slate-800 font-sans">
        <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3 shrink-0">
          <div className="h-9 w-9 rounded-lg bg-custom-blue flex items-center justify-center">
            <FileText className="h-4 w-4 text-white" />
          </div>
          <div className="text-left">
            <h1 className="text-sm font-bold text-slate-900">AI Client Review Portal</h1>
            <p className="text-sm text-slate-500">Collaboration &amp; Verification</p>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 sm:p-6 flex flex-col items-center justify-center custom-scrollbar">
          <div className="w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-md p-8 space-y-5">
            <div>
              <h2 className="text-lg font-extrabold text-slate-800">Before you continue</h2>
              <p className="text-xs text-slate-500 mt-1">Please review how your information will be used.</p>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">{PRIVACY_NOTICE.intro}</p>
            <div className="space-y-3">
              {PRIVACY_NOTICE.points.map(p => (
                <div key={p.title}>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">{p.title}</h4>
                  <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{p.body}</p>
                </div>
              ))}
            </div>
            <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer pt-3 border-t border-slate-100">
              <Checkbox checked={portalConsentChecked} onCheckedChange={(c) => setPortalConsentChecked(!!c)} className="mt-0.5" />
              <span>I have read the above and I consent to BookSmart Consultancy Ltd. collecting, using, and sharing my information as described, for the purpose of preparing and submitting my CV.</span>
            </label>
            <Button
              className="w-full bg-custom-blue hover:bg-custom-blue/90 text-white font-bold h-10"
              disabled={!portalConsentChecked}
              onClick={onAcceptPortalConsent}
            >
              I Agree &amp; Continue
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const { gaps } = analyzeCVCompleteness(clientEdits);
  const missingPhoto = !clientEdits.personalInfo?.photoUrl;

  // Use initial missing state so sections don't disappear when filled
  const missingSkills = initiallyMissingSections.skills;
  const missingEducation = initiallyMissingSections.education;
  const missingSummary = initiallyMissingSections.summary;
  const missingLanguages = initiallyMissingSections.languages;
  const missingReferences = initiallyMissingSections.references;
  const missingNationality = initiallyMissingSections.nationality;
  const missingDOB = initiallyMissingSections.dob;
  const missingMaritalStatus = initiallyMissingSections.maritalStatus;
  const missingLinkedin = initiallyMissingSections.linkedin;
  const missingGithub = initiallyMissingSections.github;

  // For job-specific sections, keep showing if they were initially missing
  const showJobsMissingDesc = initiallyMissingSections.companyDesc;
  const showJobsMissingMonths = initiallyMissingSections.dates;
  const showJobsMissingResponsibilities = initiallyMissingSections.responsibilities;

  const isSubmitted = portalStep === 7;

  // Sections sidebar — mirrors Review & Edit's section list. Each entry maps
  // to the same editor component Review & Edit uses (ContactEditor,
  // ExperienceEditor, etc.) for identical UI, so the granularity here matches
  // those editors rather than each individual missing field. Employment Gaps
  // and Kenya/East Africa Details have no Review & Edit equivalent — they're
  // portal-only prompts — so they keep their own custom UI below.
  const showContact = missingPhoto || missingLinkedin || missingGithub || missingNationality || missingDOB || missingMaritalStatus;
  const showExperience = showJobsMissingDesc || showJobsMissingMonths || showJobsMissingResponsibilities;
  const showGaps = gaps.length > 0;
  const showKenyaDetails = collabTargetCountry === 'kenya' && initiallyMissingSections.initiallyNonKenyan;
  const showAchievement = !clientEdits.achievements || clientEdits.achievements.length === 0;

  const sections = [
    showContact && { id: 'contact', label: 'Contact & Personal Details', icon: User },
    showExperience && { id: 'experience', label: 'Work Experience', icon: Briefcase },
    showGaps && { id: 'gaps', label: 'Employment Gaps', icon: AlertCircle },
    missingSkills && { id: 'skills', label: 'Skills & Expertise', icon: Sparkles },
    missingEducation && { id: 'education', label: 'Education', icon: GraduationCap },
    missingSummary && { id: 'summary', label: 'Professional Summary', icon: BookOpen },
    missingLanguages && { id: 'languages', label: 'Languages', icon: Globe },
    missingReferences && { id: 'references', label: 'References', icon: MessageSquare },
    showKenyaDetails && { id: 'kenyaDetails', label: 'Kenya / East Africa Details', icon: Globe },
    showAchievement && { id: 'achievement', label: 'Key Achievement', icon: Award },
  ].filter(Boolean) as { id: string; label: string; icon: any }[];

  const currentSectionId = sections.some(s => s.id === activeSectionId) ? activeSectionId : (sections[0]?.id || 'submit');
  const currentSectionLabel = currentSectionId === 'submit' ? 'Review & Submit' : (sections.find(s => s.id === currentSectionId)?.label || 'All Set');

  // The recruiter-facing editors carry an "AI Auto-Write / AI Enhance" action
  // — not something an anonymous portal link should be able to trigger, so
  // it's a no-op here instead of the real /api/cv/ai-writer call.
  const handleAiWriterUnavailable = () => {
    toast.info("AI writing tools aren't available here — your recruiter can help polish this after you submit.");
  };

  const submitToRecruiter = async () => {
    const submissionPayload = {
      clientEdits,
      submittedAt: new Date().toISOString(),
      consent: { given: portalConsentAccepted, version: CONSENT_VERSION, timestamp: portalConsentTimestamp },
    };

    // Save to Supabase Storage (backup)
    if (portalDraftId) {
      try {
        const payload = JSON.stringify(submissionPayload);
        const blob = new Blob([payload], { type: 'application/json' });
        await supabase.storage.from('kyc-documents').upload(`cv-drafts/${portalDraftId}/client-submission.json`, blob, { upsert: true, contentType: 'application/json' });
      } catch (e) { console.warn('Storage save failed:', e); }
    }

    // Save to database as snapshot for recruiter verification
    if (portalDraftId) {
      try {
        // The Secure Review URL carries applicantId as a query param (see
        // getCollabPortalLink) which populates the `applicantId` state on
        // mount. Only fall back to the draft.json lookup for older links
        // that were generated before that param existed.
        let targetApplicantId = applicantId;

        if (!targetApplicantId) {
          const { data: draftData } = await supabase.storage
            .from('kyc-documents')
            .download(`cv-drafts/${portalDraftId}/draft.json`);

          if (draftData) {
            const draftText = await draftData.text();
            const draft = JSON.parse(draftText);
            targetApplicantId = draft.applicantId || draft.data?.applicantId;
          }
        }

        if (targetApplicantId) {
          // Update the job_applicant_cvs record with client submission snapshot.
          // Uses its own column (not raw_cv_extracted_details) because that
          // column holds the original AI-extracted CV and is read as a
          // fallback source elsewhere — overwriting it here would destroy it.
          const { error: updateError } = await supabase
            .from('job_applicant_cvs')
            .update({
              client_portal_submission: submissionPayload,
              updated_at: new Date().toISOString(),
            })
            .eq('applicant_id', targetApplicantId);

          if (updateError) {
            console.error('Failed to save submission to database:', updateError);
          } else {
            console.log('Client submission saved to database for applicant:', targetApplicantId);
          }
        }
      } catch (e) {
        console.error('Database save failed:', e);
      }
    }

    setClientSubmission(clientEdits);
    setHasClientSubmission(true);
    setPortalStep(7);
    toast.success('Details submitted! Recruiter will review shortly.');
  };

  // Shared between the desktop (resizable side-by-side panels) and mobile
  // (stacked, tab-strip) layouts below so the section markup isn't duplicated.
  const editorContent = (
    <>
      {currentSectionId === 'contact' && (
        <ContactEditor cvData={clientEdits} setCvData={setClientEdits} applicantId={applicantId} linkedIndividualId={linkedIndividualId} />
      )}

      {currentSectionId === 'experience' && (
        <ExperienceEditor cvData={clientEdits} setCvData={setClientEdits} onOpenAiWriter={handleAiWriterUnavailable} />
      )}

      {currentSectionId === 'gaps' && (
        <div className="space-y-3">
          {gaps.map((gap: any, idx: number) => {
            const gapKey = `${gap.prevCompany || 'prev'}__${gap.currCompany || 'curr'}__${idx}`;
            const gapNote = clientEdits.personalDetails?.employmentGapNotes?.[gapKey] || {};
            return (
              <div key={idx} className="space-y-2">
                <p className="text-sm text-slate-600">There's a <strong>{gap.gapYears}-year gap</strong> between <strong>{gap.prevCompany}</strong> and <strong>{gap.currCompany}</strong>. What were you doing during this time?</p>
                <div className="flex flex-wrap gap-2">
                  {['Studying', 'Freelancing', 'Running Business', 'Career Break', 'Family reasons'].map(ans => (
                    <button key={ans} type="button" onClick={() => handleClientGapNoteChange(gapKey, 'reason', ans)} className={`text-sm px-3 py-1.5 rounded-full border font-semibold transition-all ${gapNote.reason === ans ? 'bg-custom-blue text-white border-custom-blue' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>{ans}</button>
                  ))}
                </div>
                <Input placeholder="Add more detail..." className="h-9 text-sm" value={gapNote.detail || ''} onChange={(e) => handleClientGapNoteChange(gapKey, 'detail', e.target.value)} />
              </div>
            );
          })}
        </div>
      )}

      {currentSectionId === 'skills' && (
        <SkillsEditor cvData={clientEdits} setCvData={setClientEdits} />
      )}

      {currentSectionId === 'education' && (
        <EducationEditor cvData={clientEdits} setCvData={setClientEdits} />
      )}

      {currentSectionId === 'summary' && (
        <SummaryEditor cvData={clientEdits} setCvData={setClientEdits} onOpenAiWriter={handleAiWriterUnavailable} />
      )}

      {currentSectionId === 'languages' && (
        <LanguagesEditor cvData={clientEdits} setCvData={setClientEdits} />
      )}

      {currentSectionId === 'references' && (
        <ReferencesEditor cvData={clientEdits} setCvData={setClientEdits} companyOptions={companyOptions} onCreateCompany={onCreateCompany} />
      )}

      {currentSectionId === 'kenyaDetails' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-bold text-slate-500 uppercase">Work Permit Status</Label>
              <Select value={clientEdits.personalDetails?.kenyaStatus || ''} onValueChange={(val) => handleClientPersonalDetailsChange('kenyaStatus', val)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Citizen">Kenyan Citizen / Permanent Resident</SelectItem>
                  <SelectItem value="Needs Work Permit">Needs Work Permit Sponsorship</SelectItem>
                  <SelectItem value="Willing to bear Special Work Permit expenses">Will bear own permit costs</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-bold text-slate-500 uppercase">Driving Licence</Label>
              <Select value={clientEdits.personalDetails?.drivingExperience || ''} onValueChange={(val) => handleClientPersonalDetailsChange('drivingExperience', val)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select licence" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="No Licence">No Licence</SelectItem>
                  <SelectItem value="Class B (Light vehicles)">Class B — Light vehicles</SelectItem>
                  <SelectItem value="Class C (Heavy trucks)">Class C — Heavy trucks</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-bold text-slate-500 uppercase">Nairobi Neighbourhood</Label>
              <Input placeholder="e.g. Westlands, Kilimani" value={clientEdits.personalDetails?.nairobiRes || ''} onChange={(e) => handleClientPersonalDetailsChange('nairobiRes', e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-bold text-slate-500 uppercase">Notice Period</Label>
              <Select onValueChange={(val) => { const add = clientEdits.additionalInfo || []; const idx = add.findIndex((i: any) => i.label === 'Notice Period'); const updated = [...add]; if (idx > -1) updated[idx] = { label: 'Notice Period', value: val }; else updated.push({ label: 'Notice Period', value: val }); setClientEdits((prev: any) => ({ ...prev, additionalInfo: updated })); }}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select period" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Immediate">Immediate / No Notice</SelectItem>
                  <SelectItem value="1 Month">1 Month</SelectItem>
                  <SelectItem value="2 Months">2 Months</SelectItem>
                  <SelectItem value="3 Months">3 Months</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {currentSectionId === 'achievement' && (
        <AchievementsEditor cvData={clientEdits} setCvData={setClientEdits} />
      )}

      {currentSectionId === 'submit' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500 leading-relaxed">
            {sections.length > 0
              ? `You still have ${sections.length} section${sections.length === 1 ? '' : 's'} to complete. You can submit now or fill those in first.`
              : "You've completed every section. Review your details, then submit to your recruiter."}
          </p>
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 gap-2"
            onClick={submitToRecruiter}
          >
            Submit to Recruiter <Check className="h-4 w-4" />
          </Button>
          <p className="text-sm text-slate-400 text-center">Your details will be reviewed and merged into your finalised CV.</p>
        </div>
      )}
    </>
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#FAFAFC] text-slate-800 font-sans">
      {/* Portal Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-custom-blue flex items-center justify-center shrink-0">
            <FileText className="h-4 w-4 text-white" />
          </div>
          <div className="text-left min-w-0">
            <h1 className="text-sm font-bold text-slate-900 truncate">AI Client Review Portal</h1>
            <p className="text-sm text-slate-500 hidden sm:block">Collaboration &amp; Verification</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <span className="hidden sm:inline-flex text-sm bg-blue-50 text-custom-blue border border-blue-100 px-2 py-0.5 rounded-full font-semibold">Verification Active</span>
          <Button size="sm" variant="outline" onClick={() => { setWorkflowStep('collaboration'); setClientEdits(null); }} className="text-xs border-slate-200 text-slate-650 h-8 px-2 sm:px-3">
            <span className="sm:hidden">Exit</span>
            <span className="hidden sm:inline">Exit to Recruiter View</span>
          </Button>
        </div>
      </div>

      {/* Subtitle bar */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 sm:px-6 py-2 shrink-0">
        <p className="text-xs text-slate-500">Hello, {clientEdits.personalInfo?.fullName || 'there'}! Only sections that still need your input are listed on the left.</p>
      </div>

      {/* Success screen after submit */}
      {isSubmitted ? (
        <div className="flex-1 overflow-auto p-4 sm:p-6 flex flex-col items-center justify-center custom-scrollbar">
          <div className="w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-md p-10 flex flex-col items-center text-center gap-5">
            <div className="h-16 w-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
              <Check className="h-8 w-8 stroke-[3]" />
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-slate-800">Details Submitted!</h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto mt-2 leading-relaxed">
                Thank you! Your details have been saved. The recruiter will review and finalise your CV shortly.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Mobile / tablet — stacked layout: horizontal tab strip on top, editor below */}
          <div className="flex lg:hidden flex-1 flex-col overflow-hidden">
            <div className="border-b border-slate-200 bg-white px-3 py-2 overflow-x-auto shrink-0">
              <div className="flex gap-1.5 w-max">
                {sections.map((sec) => {
                  const Icon = sec.icon;
                  const isActive = currentSectionId === sec.id;
                  return (
                    <button
                      key={sec.id}
                      onClick={() => setActiveSectionId(sec.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
                        isActive ? 'bg-custom-blue text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" /> {sec.label}
                    </button>
                  );
                })}
                <button
                  onClick={() => setActiveSectionId('submit')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
                    currentSectionId === 'submit' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  <Check className="h-3.5 w-3.5" /> Review &amp; Submit
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <h2 className="text-base font-bold text-slate-700">{currentSectionLabel}</h2>
              {editorContent}
            </div>
          </div>

          {/* Desktop — resizable side-by-side sidebar + editor panels.
              PanelGroup sets its own inline display style for layout math,
              which beats Tailwind's `hidden` class on that same element —
              so the responsive toggle has to live on this plain wrapper div
              instead, whose display:none hides the whole subtree regardless
              of PanelGroup's own inline styles. */}
          <div className="hidden lg:flex flex-1 overflow-hidden">
          <PanelGroup direction="horizontal" className="flex-1 overflow-hidden">
            {/* Left — Sections Sidebar */}
            <Panel defaultSize={22} minSize={18} maxSize={32} className="bg-white border-r border-slate-200 overflow-hidden flex flex-col">
              <div className="px-3 py-2.5 border-b border-slate-200">
                <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">Sections To Complete</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {sections.map((sec) => {
                  const Icon = sec.icon;
                  const isActive = currentSectionId === sec.id;
                  return (
                    <button
                      key={sec.id}
                      onClick={() => setActiveSectionId(sec.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all ${
                        isActive ? 'bg-custom-blue text-white shadow-sm' : 'hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                      <span className="text-sm font-semibold flex-1 truncate">{sec.label}</span>
                    </button>
                  );
                })}
                {sections.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-6 px-2 leading-relaxed">Everything looks complete — you're ready to submit.</p>
                )}
              </div>
              <div className="border-t border-slate-200 p-2">
                <button
                  onClick={() => setActiveSectionId('submit')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all ${
                    currentSectionId === 'submit' ? 'bg-emerald-600 text-white shadow-sm' : 'text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-sm font-bold flex-1">Review &amp; Submit</span>
                </button>
              </div>
            </Panel>

            <PanelResizeHandle className="w-1.5 bg-slate-100 hover:bg-custom-blue/30 transition-colors cursor-col-resize flex-shrink-0" />

            {/* Right — Editor Panel */}
            <Panel minSize={40} className="bg-white overflow-hidden flex flex-col">
              <div className="px-5 py-2.5 border-b border-slate-200 shrink-0">
                <h2 className="text-lg font-bold text-slate-700 uppercase tracking-wider">{currentSectionLabel}</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4 max-w-2xl">
                {editorContent}
              </div>
            </Panel>
          </PanelGroup>
          </div>
        </>
      )}
    </div>
  );
}
