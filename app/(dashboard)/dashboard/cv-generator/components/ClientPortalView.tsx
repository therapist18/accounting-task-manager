"use client";

import { AlertCircle, Award, Briefcase, Check, FileText, Globe, GraduationCap, BookOpen, ImagePlus, MessageSquare, Sparkles, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import supabase from "@/lib/supabase/client";
import { analyzeCVCompleteness, CONSENT_VERSION, isJustYear, PRIVACY_NOTICE } from "../utils/cvGeneratorData";

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
  handleClientPersonalInfoChange: (field: string, value: any) => void;
  handleClientPersonalDetailsChange: (field: string, value: any) => void;
  handleClientGapNoteChange: (gapKey: string, field: 'reason' | 'detail', value: string) => void;
  collabTargetCountry: 'kenya' | 'other';
  portalDraftId: string | null;
  applicantId: string | null;
  portalConsentTimestamp: string | null;
  setClientSubmission: (data: any) => void;
  setHasClientSubmission: (v: boolean) => void;
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
  handleClientPersonalInfoChange,
  handleClientPersonalDetailsChange,
  handleClientGapNoteChange,
  collabTargetCountry,
  portalDraftId,
  applicantId,
  portalConsentTimestamp,
  setClientSubmission,
  setHasClientSubmission,
}: ClientPortalViewProps) {
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

  const { gaps, checklist } = analyzeCVCompleteness(clientEdits);
  const missingPhoto = !clientEdits.personalInfo?.photoUrl;
  const isKenyan = (clientEdits.personalDetails?.nationality || '').toLowerCase().includes('kenyan') || (clientEdits.personalDetails?.nationality || '').toLowerCase().includes('kenya');
  const jobsMissingDesc = (clientEdits.experience || []).filter((e: any) => !e.companyDesc || e.companyDesc.trim().length < 5);
  const jobsMissingMonths = (clientEdits.experience || []).filter((e: any) => isJustYear(e.startDate) || isJustYear(e.endDate));
  const jobsMissingResponsibilities = (clientEdits.experience || []).filter((e: any) => !e.responsibilities || e.responsibilities.length === 0);

  // Use initial missing state so sections don't disappear when filled
  const missingSkills = initiallyMissingSections.skills;
  const missingEducation = initiallyMissingSections.education;
  const missingSummary = initiallyMissingSections.summary;
  const missingLanguages = initiallyMissingSections.languages;
  const missingReferences = initiallyMissingSections.references;
  const missingNationality = initiallyMissingSections.nationality;
  const missingDOB = initiallyMissingSections.dob;
  const missingMaritalStatus = initiallyMissingSections.maritalStatus;

  // For job-specific sections, keep showing if they were initially missing
  const showJobsMissingDesc = initiallyMissingSections.companyDesc;
  const showJobsMissingMonths = initiallyMissingSections.dates;
  const showJobsMissingResponsibilities = initiallyMissingSections.responsibilities;

  const isSubmitted = portalStep === 7;

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
        <p className="text-xs text-slate-500">Please review your details and fill in any missing information below. This helps us prepare the best possible CV for you.</p>
      </div>

      {/* Main Work Area — simplified single-page form */}
      <div className="flex-1 overflow-auto p-4 sm:p-6 flex flex-col items-center custom-scrollbar">
        <div className="w-full max-w-2xl space-y-4 pb-10">

          {/* Success screen after submit */}
          {isSubmitted ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-10 flex flex-col items-center text-center gap-5">
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
          ) : (
            <>
              {/* Welcome card */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-start gap-4">
                <div className="h-10 w-10 bg-custom-blue rounded-xl flex items-center justify-center text-white shrink-0">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Hello, {clientEdits.personalInfo?.fullName || 'there'}!</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Please fill in the details below. Only sections with missing or incomplete information are shown.
                  </p>
                </div>
              </div>

              {/* ── Photo ── */}
              {missingPhoto && (
                <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-5 space-y-3">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2"><ImagePlus className="h-4 w-4 text-amber-500" /> Professional Photo Required</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">Please upload a passport-sized photo with a <strong>plain white background</strong>.</p>
                  <div className="flex flex-wrap items-center gap-3">
                    {clientEdits.personalInfo?.photoUrl && <img src={clientEdits.personalInfo.photoUrl} className="h-14 w-14 rounded-lg object-cover border border-slate-200 shrink-0" alt="Preview" />}
                    <Input type="file" accept="image/*" className="text-xs h-9 bg-white flex-1 min-w-[180px]" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) { const reader = new FileReader(); reader.onload = () => handleClientPersonalInfoChange('photoUrl', reader.result as string); reader.readAsDataURL(file); }
                    }} />
                  </div>
                </div>
              )}

              {/* ── Online Presence (Optional) ── */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Globe className="h-4 w-4 text-custom-blue" /> Online Profiles <span className="text-xs font-normal text-slate-400">(Optional)</span></h4>
                <p className="text-xs text-slate-500">If you have professional profiles, add them below. This section is optional.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-500 uppercase">LinkedIn URL</Label>
                    <Input placeholder="linkedin.com/in/username" value={clientEdits.personalInfo?.linkedin || ''} onChange={(e) => handleClientPersonalInfoChange('linkedin', e.target.value)} className="h-9 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-500 uppercase">GitHub / Portfolio URL</Label>
                    <Input placeholder="github.com/username" value={clientEdits.personalInfo?.github || ''} onChange={(e) => handleClientPersonalInfoChange('github', e.target.value)} className="h-9 text-xs" />
                  </div>
                </div>
              </div>

              {/* ── Company Descriptions ── */}
              {showJobsMissingDesc && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Briefcase className="h-4 w-4 text-slate-500" /> Company Specializations</h4>
                  <p className="text-xs text-slate-500">Briefly describe what each company does / specializes in.</p>
                  {(clientEdits.experience || []).map((exp: any, idx: number) => {
                    if (exp.companyDesc && exp.companyDesc.trim().length >= 5) return null;
                    return (
                      <div key={idx} className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-600">{exp.company || `Position #${idx + 1}`} — {exp.role}</Label>
                        <Input placeholder="e.g. Professional accounting consultancy firm in Nairobi" value={exp.companyDesc || ''} onChange={(e) => { const updated = [...clientEdits.experience]; updated[idx] = { ...updated[idx], companyDesc: e.target.value }; setClientEdits((prev: any) => ({ ...prev, experience: updated })); }} className="h-9 text-xs" />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Dates needing months ── */}
              {showJobsMissingMonths && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2"><AlertCircle className="h-4 w-4 text-amber-500" /> Employment Dates — Add Month</h4>
                  <p className="text-xs text-slate-500">Some dates only have a year. Please provide the month too (e.g. Jan 2021).</p>
                  {(clientEdits.experience || []).map((exp: any, idx: number) => {
                    const sNeed = isJustYear(exp.startDate), eNeed = isJustYear(exp.endDate);
                    if (!sNeed && !eNeed) return null;
                    return (
                      <div key={idx} className="space-y-2">
                        <span className="text-xs font-semibold text-slate-700">{exp.company} — {exp.role}</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {sNeed && <div className="space-y-1"><Label className="text-xs text-slate-500">Start Date</Label><Input placeholder="e.g. Jan 2021" value={exp.startDate || ''} onChange={(e) => { const updated = [...clientEdits.experience]; updated[idx] = { ...updated[idx], startDate: e.target.value }; setClientEdits((prev: any) => ({ ...prev, experience: updated })); }} className="h-9 text-xs" /></div>}
                          {eNeed && <div className="space-y-1"><Label className="text-xs text-slate-500">End Date</Label><Input placeholder="e.g. Dec 2023 or Present" value={exp.endDate || ''} onChange={(e) => { const updated = [...clientEdits.experience]; updated[idx] = { ...updated[idx], endDate: e.target.value }; setClientEdits((prev: any) => ({ ...prev, experience: updated })); }} className="h-9 text-xs" /></div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Employment Gaps ── */}
              {gaps.length > 0 && (
                <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-5 space-y-3">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2"><AlertCircle className="h-4 w-4 text-amber-500" /> Employment Gap</h4>
                  {gaps.map((gap: any, idx: number) => {
                    const gapKey = `${gap.prevCompany || 'prev'}__${gap.currCompany || 'curr'}__${idx}`;
                    const gapNote = clientEdits.personalDetails?.employmentGapNotes?.[gapKey] || {};
                    return (
                      <div key={idx} className="space-y-2">
                        <p className="text-xs text-slate-600">There's a <strong>{gap.gapYears}-year gap</strong> between <strong>{gap.prevCompany}</strong> and <strong>{gap.currCompany}</strong>. What were you doing during this time?</p>
                        <div className="flex flex-wrap gap-2">
                          {['Studying', 'Freelancing', 'Running Business', 'Career Break', 'Family reasons'].map(ans => (
                            <button key={ans} type="button" onClick={() => handleClientGapNoteChange(gapKey, 'reason', ans)} className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-all ${gapNote.reason === ans ? 'bg-custom-blue text-white border-custom-blue' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>{ans}</button>
                          ))}
                        </div>
                        <Input placeholder="Add more detail..." className="h-9 text-xs" value={gapNote.detail || ''} onChange={(e) => handleClientGapNoteChange(gapKey, 'detail', e.target.value)} />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Missing Skills ── */}
              {missingSkills && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Sparkles className="h-4 w-4 text-purple-500" /> Skills & Competencies</h4>
                  <p className="text-xs text-slate-500">Please list your key skills grouped by category. This helps showcase your expertise.</p>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-500 uppercase">Technical Skills</Label>
                      <Input placeholder="e.g. Python, JavaScript, SQL, Excel, QuickBooks" className="h-9 text-xs" onChange={(e) => {
                        const existingTechnical = (clientEdits.skills || []).find((s: any) => s.category === 'Technical Skills');
                        const otherSkills = (clientEdits.skills || []).filter((s: any) => s.category !== 'Technical Skills');
                        if (existingTechnical) {
                          // Update existing
                          setClientEdits((prev: any) => ({
                            ...prev,
                            skills: prev.skills.map((s: any) => s.category === 'Technical Skills' ? { ...s, items: e.target.value } : s)
                          }));
                        } else {
                          // Add new
                          setClientEdits((prev: any) => ({
                            ...prev,
                            skills: [...otherSkills, { category: 'Technical Skills', items: e.target.value }]
                          }));
                        }
                      }} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-500 uppercase">Soft Skills</Label>
                      <Input placeholder="e.g. Communication, Team Leadership, Problem Solving" className="h-9 text-xs" onChange={(e) => {
                        const existingSoft = (clientEdits.skills || []).find((s: any) => s.category === 'Soft Skills');
                        const otherSkills = (clientEdits.skills || []).filter((s: any) => s.category !== 'Soft Skills');
                        if (existingSoft) {
                          // Update existing
                          setClientEdits((prev: any) => ({
                            ...prev,
                            skills: prev.skills.map((s: any) => s.category === 'Soft Skills' ? { ...s, items: e.target.value } : s)
                          }));
                        } else {
                          // Add new
                          setClientEdits((prev: any) => ({
                            ...prev,
                            skills: [...otherSkills, { category: 'Soft Skills', items: e.target.value }]
                          }));
                        }
                      }} />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Missing Education ── */}
              {missingEducation && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2"><GraduationCap className="h-4 w-4 text-blue-500" /> Education Background</h4>
                  <p className="text-xs text-slate-500">Please provide your highest qualification details.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-500 uppercase">Degree / Certificate</Label>
                      <Input placeholder="e.g. Bachelor of Commerce" className="h-9 text-xs" onChange={(e) => {
                        const existingEdu = clientEdits.education?.[0] || {};
                        setClientEdits((prev: any) => ({
                          ...prev,
                          education: [{ ...existingEdu, degree: e.target.value }]
                        }));
                      }} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-500 uppercase">Institution</Label>
                      <Input placeholder="e.g. University of Nairobi" className="h-9 text-xs" onChange={(e) => {
                        const existingEdu = clientEdits.education?.[0] || {};
                        setClientEdits((prev: any) => ({
                          ...prev,
                          education: [{ ...existingEdu, institution: e.target.value }]
                        }));
                      }} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-500 uppercase">Year of Completion</Label>
                      <Input placeholder="e.g. 2020" className="h-9 text-xs" onChange={(e) => {
                        const existingEdu = clientEdits.education?.[0] || {};
                        setClientEdits((prev: any) => ({
                          ...prev,
                          education: [{ ...existingEdu, year: e.target.value }]
                        }));
                      }} />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Missing Summary ── */}
              {missingSummary && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2"><BookOpen className="h-4 w-4 text-green-500" /> Professional Summary</h4>
                  <p className="text-xs text-slate-500">Write 2-3 sentences about your professional background and career goals.</p>
                  <Textarea
                    placeholder="e.g. Results-driven accountant with 5+ years of experience in financial reporting and audit. Seeking to leverage expertise in a challenging role..."
                    rows={3}
                    className="text-xs"
                    onChange={(e) => setClientEdits((prev: any) => ({ ...prev, summary: e.target.value }))}
                  />
                </div>
              )}

              {/* ── Missing Languages ── */}
              {missingLanguages && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Globe className="h-4 w-4 text-slate-500" /> Languages</h4>
                  <p className="text-xs text-slate-500">Which languages do you speak? Select all that apply.</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {['English', 'Swahili', 'French', 'German', 'Hindi', 'Arabic', 'Spanish', 'Mandarin'].map(lang => {
                      const isChecked = (clientEdits.languages || []).some((l: any) => l.language === lang);
                      return (
                        <label key={lang} className="flex items-center gap-2 text-xs font-semibold cursor-pointer text-slate-700">
                          <Checkbox checked={isChecked} onCheckedChange={(checked) => {
                            if (checked) {
                              const langs = clientEdits.languages || [];
                              if (!langs.some((l: any) => l.language === lang)) {
                                setClientEdits((prev: any) => ({
                                  ...prev,
                                  languages: [...langs, { language: lang, proficiency: lang === 'English' ? 'Professional' : 'Basic' }]
                                }));
                              }
                            } else {
                              setClientEdits((prev: any) => ({
                                ...prev,
                                languages: (prev.languages || []).filter((l: any) => l.language !== lang)
                              }));
                            }
                          }} />
                          {lang}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Missing References ── */}
              {missingReferences && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2"><MessageSquare className="h-4 w-4 text-slate-500" /> Professional References</h4>
                  <p className="text-xs text-slate-500">Please provide at least one professional reference (former manager, colleague, or client).</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-500 uppercase">Reference Name</Label>
                      <Input placeholder="e.g. John Kamau" className="h-9 text-xs" onChange={(e) => {
                        const existingRef = clientEdits.references?.[0] || {};
                        setClientEdits((prev: any) => ({
                          ...prev,
                          references: [{ ...existingRef, name: e.target.value }]
                        }));
                      }} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-500 uppercase">Position / Title</Label>
                      <Input placeholder="e.g. Finance Manager" className="h-9 text-xs" onChange={(e) => {
                        const existingRef = clientEdits.references?.[0] || {};
                        setClientEdits((prev: any) => ({
                          ...prev,
                          references: [{ ...existingRef, title: e.target.value }]
                        }));
                      }} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-500 uppercase">Company</Label>
                      <Input placeholder="e.g. ABC Company Ltd" className="h-9 text-xs" onChange={(e) => {
                        const existingRef = clientEdits.references?.[0] || {};
                        setClientEdits((prev: any) => ({
                          ...prev,
                          references: [{ ...existingRef, company: e.target.value }]
                        }));
                      }} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-500 uppercase">Contact (Phone/Email)</Label>
                      <Input placeholder="e.g. +254 700 123456" className="h-9 text-xs" onChange={(e) => {
                        const existingRef = clientEdits.references?.[0] || {};
                        setClientEdits((prev: any) => ({
                          ...prev,
                          references: [{ ...existingRef, contact: e.target.value }]
                        }));
                      }} />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Job Responsibilities ── */}
              {showJobsMissingResponsibilities && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Briefcase className="h-4 w-4 text-slate-500" /> Key Responsibilities</h4>
                  <p className="text-xs text-slate-500">Describe your main duties for each role. Use bullet points for clarity.</p>
                  {jobsMissingResponsibilities.map((exp: any, idx: number) => (
                    <div key={idx} className="space-y-2">
                      <Label className="text-xs font-semibold text-slate-600">{exp.company || `Position #${idx + 1}`} — {exp.role}</Label>
                      <Textarea
                        placeholder="e.g. Managed monthly financial reporting, Prepared audit documentation, Supervised junior accountants"
                        rows={2}
                        className="text-xs"
                        onChange={(e) => {
                          const responsibilities = e.target.value.split('\n').filter((r: string) => r.trim());
                          const updated = [...clientEdits.experience];
                          const expIdx = clientEdits.experience.findIndex((e: any) => e.company === exp.company && e.role === exp.role);
                          if (expIdx > -1) {
                            updated[expIdx] = { ...updated[expIdx], responsibilities };
                          }
                          setClientEdits((prev: any) => ({ ...prev, experience: updated }));
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* ── Personal Details ── */}
              {(missingNationality || missingDOB || missingMaritalStatus) && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2"><User className="h-4 w-4 text-slate-500" /> Personal Details</h4>
                  <p className="text-xs text-slate-500">Please provide your personal details.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-500 uppercase">Nationality</Label>
                      <Input placeholder="e.g. Kenyan" value={clientEdits.personalDetails?.nationality || ''} onChange={(e) => handleClientPersonalDetailsChange('nationality', e.target.value)} className="h-9 text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-500 uppercase">Date of Birth</Label>
                      <Input placeholder="e.g. 15/03/1990" value={clientEdits.personalDetails?.dateOfBirth || ''} onChange={(e) => handleClientPersonalDetailsChange('dateOfBirth', e.target.value)} className="h-9 text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-500 uppercase">Marital Status</Label>
                      <Input placeholder="e.g. Single, Married" value={clientEdits.personalDetails?.maritalStatus || ''} onChange={(e) => handleClientPersonalDetailsChange('maritalStatus', e.target.value)} className="h-9 text-xs" />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Kenya / Regional Details (Only for non-Kenyans) ── */}
              {collabTargetCountry === 'kenya' && initiallyMissingSections.initiallyNonKenyan && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Globe className="h-4 w-4 text-custom-blue" /> Kenya / East Africa Details</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-500 uppercase">Work Permit Status</Label>
                      <Select value={clientEdits.personalDetails?.kenyaStatus || ''} onValueChange={(val) => handleClientPersonalDetailsChange('kenyaStatus', val)}>
                        <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select status" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Citizen">Kenyan Citizen / Permanent Resident</SelectItem>
                          <SelectItem value="Needs Work Permit">Needs Work Permit Sponsorship</SelectItem>
                          <SelectItem value="Willing to bear Special Work Permit expenses">Will bear own permit costs</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-500 uppercase">Driving Licence</Label>
                      <Select value={clientEdits.personalDetails?.drivingExperience || ''} onValueChange={(val) => handleClientPersonalDetailsChange('drivingExperience', val)}>
                        <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select licence" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="No Licence">No Licence</SelectItem>
                          <SelectItem value="Class B (Light vehicles)">Class B — Light vehicles</SelectItem>
                          <SelectItem value="Class C (Heavy trucks)">Class C — Heavy trucks</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-500 uppercase">Nairobi Neighbourhood</Label>
                      <Input placeholder="e.g. Westlands, Kilimani" value={clientEdits.personalDetails?.nairobiRes || ''} onChange={(e) => handleClientPersonalDetailsChange('nairobiRes', e.target.value)} className="h-9 text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-500 uppercase">Notice Period</Label>
                      <Select onValueChange={(val) => { const add = clientEdits.additionalInfo || []; const idx = add.findIndex((i: any) => i.label === 'Notice Period'); const updated = [...add]; if (idx > -1) updated[idx] = { label: 'Notice Period', value: val }; else updated.push({ label: 'Notice Period', value: val }); setClientEdits((prev: any) => ({ ...prev, additionalInfo: updated })); }}>
                        <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select period" /></SelectTrigger>
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

              {/* ── Achievement ── */}
              {(!clientEdits.achievements || clientEdits.achievements.length === 0) && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Award className="h-4 w-4 text-slate-500" /> Key Achievement (Optional)</h4>
                  <Textarea placeholder="Describe one major achievement, award, or project impact..." rows={3} className="text-xs" onChange={(e) => { const val = e.target.value; if (val.trim()) setClientEdits((prev: any) => ({ ...prev, achievements: [{ title: 'Key Achievement', description: val, date: 'Recent' }] })); }} />
                </div>
              )}

              {/* ── Submit ── */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 gap-2"
                  onClick={async () => {
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
                          // Update the job_applicant_cvs record with client submission snapshot
                          const { error: updateError } = await supabase
                            .from('job_applicant_cvs')
                            .update({
                              raw_cv_extracted_details: submissionPayload,
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
                  }}
                >
                  Submit to Recruiter <Check className="h-4 w-4" />
                </Button>
                <p className="text-xs text-slate-400 text-center mt-2">Your details will be reviewed and merged into your finalised CV.</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
