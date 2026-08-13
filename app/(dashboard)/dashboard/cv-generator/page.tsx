// @ts-nocheck
"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, FileText, Upload, Plus, Trash2, Download, ZoomIn, ZoomOut, Check, User, Briefcase, GraduationCap, FolderGit2, BookOpen, MessageSquare, AlertCircle, Eye, Search, Users, ImagePlus, X, Loader2, CheckCircle2, Save, Settings2, Palette, ChevronDown, ChevronRight, Globe, ArrowRight, Award, Target, FileSpreadsheet, Layout, Type, Image, PenLine, BarChart3, Crosshair, FileText as CoverLetterIcon, Copy, RefreshCw, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { exportToDocx } from "@/lib/cvDocxExporter";
import { toast } from "sonner";
import supabase from "@/lib/supabase/client";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { type ComboOption } from "./components/CreatableCombobox";
import { ClientPortalView } from "./components/ClientPortalView";
import { ModuleModals } from "./components/ModuleModals";
import { DesignPanel } from "./components/DesignPanel";
import { SaveDraftModal } from "./components/SaveDraftModal";
import { SendCvModal } from "./components/SendCvModal";
import { ImportStep } from "./components/steps/ImportStep";
import { ReviewEditStep } from "./components/steps/ReviewEditStep";
import { CollaborationStep } from "./components/steps/CollaborationStep";
import {
  PASSPORT_PHOTO_ID,
  CLEAR_PHOTO_ID,
  CV_DOCUMENT_ID,
  DEFAULT_DECLARATION_TEXT,
  EMPTY_CV_DATA,
  mapSkillsFromExtractedDetails,
  mapCertificationsFromExtractedDetails,
  isSkillsBlank,
  isCertificationsBlank,
  initialCVData,
  type EnhancementLevel,
  CONSENT_VERSION,
  loadFromLocalStorage,
  saveToLocalStorage,
  getCVDiffs,
  isJustYear,
  mergeAiEnhancedCv,
} from "./utils/cvGeneratorData";

export default function CVGeneratorPage() {
  const [cvData, setCvData] = useState<any>(initialCVData);
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit');
  const [selectedLayout, setSelectedLayout] = useState<string>("theme1");
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractionProgress, setExtractionProgress] = useState<string>("");
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);
  const [enhancementLevel, setEnhancementLevel] = useState<EnhancementLevel>("professional");
  const [individualSearch, setIndividualSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedIndividual, setSelectedIndividual] = useState<any>(null);
  const [individualPhoto, setIndividualPhoto] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isFetchingPhoto, setIsFetchingPhoto] = useState(false);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [pendingPhotoPreview, setPendingPhotoPreview] = useState<string | null>(null);
  const [showSavePhotoPrompt, setShowSavePhotoPrompt] = useState(false);
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);
  const [showSaveCvPrompt, setShowSaveCvPrompt] = useState(false);
  const [isSavingCv, setIsSavingCv] = useState(false);
  const [applicantId, setApplicantId] = useState<string | null>(null);
  const [linkedIndividualId, setLinkedIndividualId] = useState<number | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mounted, setMounted] = useState(false);
  const [registryFormData, setRegistryFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    location: '',
    languages: [{ language: 'English', proficiency: 'Professional' }] as { language: string; proficiency: string }[],
  });
  const [cvSettings, setCvSettings] = useState(() => loadFromLocalStorage('cvSettings', {
    photoSize: 150,
    photoFit: 'cover' as 'cover' | 'contain' | 'fill',
    photoShape: 'square' as 'square' | 'circle' | 'rounded',
    primaryColor: '#2c3e50',
    accentColor: '#3498db',
    fontScale: 1 as 0.85 | 1 | 1.15,
    fontFamily: 'Inter, sans-serif',
    showPhoto: true,
    showCustomize: false,
  }));

  const updateCvSetting = <K extends keyof typeof cvSettings>(key: K, value: typeof cvSettings[K]) =>
    setCvSettings(prev => ({ ...prev, [key]: value }));

  const [workflowStep, setWorkflowStep] = useState<'import' | 'review-edit' | 'collaboration' | 'client-portal'>('import');
  const [showDesignPanel, setShowDesignPanel] = useState(false);
  const [showSendCvModal, setShowSendCvModal] = useState(false);
  const [recommenderContactId, setRecommenderContactId] = useState<string | null>(null);
  const [selectedRecommender, setSelectedRecommender] = useState<any>(null);
  const [sendCvRecipients, setSendCvRecipients] = useState({ applicant: true, sandip: true, recommender: false });
  const [thirdParties, setThirdParties] = useState<{ name: string; email: string; role: string }[]>([]);
  const [coverLetterText, setCoverLetterText] = useState('');
  const [sendMethod, setSendMethod] = useState<'email' | 'whatsapp'>('email');
  const [activeSection, setActiveSection] = useState('contact');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [collapsedItems, setCollapsedItems] = useState<Record<string, boolean>>({});
  const toggleItem = (key: string) => setCollapsedItems(p => ({ ...p, [key]: !p[key] }));
  const [showAiWriter, setShowAiWriter] = useState(false);
  const [showJobMatch, setShowJobMatch] = useState(false);
  const [showCoverLetter, setShowCoverLetter] = useState(false);
  const [showResumeVersions, setShowResumeVersions] = useState(false);
  const [showAdvancedExport, setShowAdvancedExport] = useState(false);
  const [cvVersions, setCvVersions] = useState<{ id: string; name: string; data: any; createdAt: string }[]>([]);
  const [activeDesignTab, setActiveDesignTab] = useState('theme');
  const [isEnhancingCv, setIsEnhancingCv] = useState(false);

  // Load from localStorage after mount to avoid hydration mismatch
  useEffect(() => {
    const savedCvData = loadFromLocalStorage('cvData', initialCVData);
    const savedLayout = loadFromLocalStorage('selectedLayout', 'theme1');
    const savedGroups = loadFromLocalStorage('collapsedGroups', {});
    const savedVersions = loadFromLocalStorage('cvVersions', []);
    const savedDrafts = loadFromLocalStorage('cvDrafts', []);
    const savedPortalDraftId = loadFromLocalStorage('currentPortalDraftId', null);
    const savedHasSavedDraft = loadFromLocalStorage('hasSavedDraft', false);
    const savedLastDraftName = loadFromLocalStorage('lastDraftName', '');
    const savedCollabCountry = loadFromLocalStorage('collabTargetCountry', 'kenya');
    const savedCollabRole = loadFromLocalStorage('collabTargetRole', 'software-engineer');
    const savedHasClientSubmission = loadFromLocalStorage('hasClientSubmission', false);
    const savedClientSubmission = loadFromLocalStorage('clientSubmission', null);
    
    setCvData(savedCvData);
    setSelectedLayout(savedLayout);
    setCollapsedGroups(savedGroups);
    setCvVersions(savedVersions);
    setCvDrafts(savedDrafts);
    setCurrentPortalDraftId(savedPortalDraftId);
    setHasSavedDraft(savedHasSavedDraft);
    setLastDraftName(savedLastDraftName);
    setCollabTargetCountry(savedCollabCountry);
    setCollabTargetRole(savedCollabRole);
    setHasClientSubmission(savedHasClientSubmission);
    setClientSubmission(savedClientSubmission);
    setMounted(true);
  }, []);

  // Company options for references and recommender (from both client and third-party tables)
  const [companyOptions, setCompanyOptions] = useState<ComboOption[]>([]);

  const loadCompanyOptions = useCallback(async () => {
    try {
      const [clientRes, tpcRes] = await Promise.all([
        supabase.from("acc_portal_company_duplicate").select("id, company_name").order("company_name"),
        supabase.from("third_party_companies").select("id, company_name").eq("status", "active").order("company_name"),
      ]);
      const compSet = new Map<string, string>();
      (clientRes.data || []).forEach((c: any) => {
        if (c.company_name) compSet.set(c.company_name.trim(), c.company_name.trim());
      });
      (tpcRes.data || []).forEach((c: any) => {
        if (c.company_name) compSet.set(c.company_name.trim(), c.company_name.trim());
      });
      setCompanyOptions([...compSet.values()].sort().map(n => ({ value: n, label: n })));
    } catch (e) {
      console.error("Error loading company options:", e);
    }
  }, [supabase]);

  const handleCreateCompany = async (label: string): Promise<string> => {
    await supabase.from("third_party_companies").insert({ company_name: label });
    setCompanyOptions(prev => [...prev, { value: label, label }].sort((a, b) => a.label.localeCompare(b.label)));
    return label;
  };

  // Load company options on mount
  useEffect(() => { loadCompanyOptions(); }, [loadCompanyOptions]);

  // Draft system — metadata cached locally, full data in Supabase storage
  const [cvDrafts, setCvDrafts] = useState<{ id: string; name: string; data: any; createdAt: string; isPortalDraft: boolean }[]>([]);
  const [showSaveDraftModal, setShowSaveDraftModal] = useState(false);
  const [draftNameInput, setDraftNameInput] = useState('');
  const [savingDraftForPortal, setSavingDraftForPortal] = useState(false);
  const [currentPortalDraftId, setCurrentPortalDraftId] = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [showDraftsList, setShowDraftsList] = useState(false);
  const [portalDraftId, setPortalDraftId] = useState<string | null>(null);
  const [hasSavedDraft, setHasSavedDraft] = useState<boolean>(false);
  const [lastDraftName, setLastDraftName] = useState<string>('');

  // AI Resume Collaboration Portal State
  const [collabTargetCountry, setCollabTargetCountry] = useState<'kenya' | 'other'>('kenya');
  const [collabTargetRole, setCollabTargetRole] = useState<string>('software-engineer');
  
  // Pending Client Submissions
  const [hasClientSubmission, setHasClientSubmission] = useState<boolean>(false);
  const [clientSubmission, setClientSubmission] = useState<any>(null);
  const [acceptedFields, setAcceptedFields] = useState<Record<string, boolean>>({});

  // Client Portal Navigation / Steps
  const [portalStep, setPortalStep] = useState<number>(1);
  const [clientEdits, setClientEdits] = useState<any>(null); // For temporary edits inside client portal
  
  // Track which sections were initially missing so they don't disappear when filled
  const [initiallyMissingSections, setInitiallyMissingSections] = useState<Record<string, boolean>>({
    skills: false,
    education: false,
    summary: false,
    languages: false,
    references: false,
    nationality: false,
    dob: false,
    maritalStatus: false,
    companyDesc: false,
    dates: false,
    responsibilities: false,
    kenyaStatus: false,
    linkedin: false,
    github: false,
    initiallyNonKenyan: false // Track if user was initially non-Kenyan
  });

  // Data-protection consent gate — applicant must accept before the portal form is shown
  const [portalConsentAccepted, setPortalConsentAccepted] = useState(false);
  const [portalConsentTimestamp, setPortalConsentTimestamp] = useState<string | null>(null);
  const [portalConsentChecked, setPortalConsentChecked] = useState(false);

  const handleAcceptPortalConsent = () => {
    const ts = new Date().toISOString();
    setPortalConsentAccepted(true);
    setPortalConsentTimestamp(ts);
    if (portalDraftId) {
      saveToLocalStorage(`portalConsent_${portalDraftId}`, { accepted: true, timestamp: ts, version: CONSENT_VERSION });
    }
  };

  // Auto-save to localStorage on changes
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      saveToLocalStorage('cvData', cvData);
      saveToLocalStorage('cvSettings', cvSettings);
      saveToLocalStorage('selectedLayout', selectedLayout);
      saveToLocalStorage('collapsedGroups', collapsedGroups);
      saveToLocalStorage('cvVersions', cvVersions);
      saveToLocalStorage('collabTargetCountry', collabTargetCountry);
      saveToLocalStorage('collabTargetRole', collabTargetRole);
      saveToLocalStorage('hasClientSubmission', hasClientSubmission);
      saveToLocalStorage('clientSubmission', clientSubmission);
      saveToLocalStorage('cvDrafts', cvDrafts);
      saveToLocalStorage('currentPortalDraftId', currentPortalDraftId);
      saveToLocalStorage('hasSavedDraft', hasSavedDraft);
      saveToLocalStorage('lastDraftName', lastDraftName);
    }, 500);
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current); };
  }, [cvData, cvSettings, selectedLayout, collapsedGroups, cvVersions, collabTargetCountry, collabTargetRole, hasClientSubmission, clientSubmission, cvDrafts, currentPortalDraftId, hasSavedDraft, lastDraftName]);

  // Initialize client edits in client portal
  useEffect(() => {
    if (workflowStep === 'client-portal' && !clientEdits) {
      setClientEdits(JSON.parse(JSON.stringify(cvData)));
      setPortalStep(1);
      
      // Capture which sections are initially missing
      const data = cvData;
      const initiallyNonKenyan = !(data.personalDetails?.nationality || '').toLowerCase().includes('kenyan') && !(data.personalDetails?.nationality || '').toLowerCase().includes('kenya');
      
      setInitiallyMissingSections({
        skills: !data.skills || data.skills.length === 0,
        education: !data.education || data.education.length === 0,
        summary: !data.summary || data.summary.trim().length < 10,
        languages: !data.languages || data.languages.length === 0,
        references: !data.references || data.references.length === 0,
        nationality: !data.personalDetails?.nationality,
        dob: !data.personalDetails?.dateOfBirth,
        maritalStatus: !data.personalDetails?.maritalStatus,
        companyDesc: (data.experience || []).some((e: any) => !e.companyDesc || e.companyDesc.trim().length < 5),
        dates: (data.experience || []).some((e: any) => isJustYear(e.startDate) || isJustYear(e.endDate)),
        responsibilities: (data.experience || []).some((e: any) => !e.responsibilities || e.responsibilities.length === 0),
        kenyaStatus: false, // Will be set based on country and nationality
        linkedin: !data.contactInfo?.linkedin,
        github: !data.contactInfo?.github,
        initiallyNonKenyan: initiallyNonKenyan
      });
    }
  }, [workflowStep, cvData, clientEdits]);

  // Read URL search params to enter portal mode if portal=true is set
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('portal') === 'true') {
        setWorkflowStep('client-portal');
        const draftId = params.get('draftId');
        if (draftId) {
          setPortalDraftId(draftId);
          const storedConsent = loadFromLocalStorage<{ accepted: boolean; timestamp: string; version: string } | null>(`portalConsent_${draftId}`, null);
          if (storedConsent?.accepted && storedConsent.version === CONSENT_VERSION) {
            setPortalConsentAccepted(true);
            setPortalConsentTimestamp(storedConsent.timestamp);
          }
          // Try to load draft data from Supabase storage
          supabase.storage.from('kyc-documents').download(`cv-drafts/${draftId}/draft.json`)
            .then(({ data, error }) => {
              if (!error && data) {
                data.text().then(text => {
                  try {
                    const draft = JSON.parse(text);
                    if (draft.data) setCvData(draft.data);
                    if (draft.cvSettings) setCvSettings(draft.cvSettings);
                    if (draft.selectedLayout) setSelectedLayout(draft.selectedLayout);
                  } catch (e) { /* ignore */ }
                });
              }
            });
        }
      }
    }
  }, []);

  // Read applicantId from URL params and fetch CV data from Supabase
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const applicantIdParam = params.get('applicantId');

    // Also check legacy sessionStorage fallback
    const raw = sessionStorage.getItem('cv_builder_prefill');

    if (applicantIdParam) {
      setApplicantId(applicantIdParam);

      // Fetch the CV record from Supabase
      (async () => {
        try {
          console.log('[CV Builder] Fetching CV record for applicantId:', applicantIdParam);
          const { data: record, error } = await supabase
            .from('job_applicant_cvs')
            .select('*')
            .eq('applicant_id', applicantIdParam)
            .single();

          if (error || !record) {
            console.error('[CV Builder] Failed to fetch CV record:', error);
            toast.error('Could not load applicant CV data.');
            return;
          }

          console.log('[CV Builder] Fetched CV record:', {
            id: record.id,
            full_name: record.full_name,
            has_extracted_details: !!record.raw_cv_extracted_details,
            has_bcl_cv_snapshot: !!record.bcl_cv_snapshot,
            extracted_details_keys: record.raw_cv_extracted_details ? Object.keys(record.raw_cv_extracted_details) : [],
            individual_id: record.individual_id,
            qualifications: record.qualifications,
          });

          if (record.individual_id) setLinkedIndividualId(record.individual_id);

          // PRIORITY: Use bcl_cv_snapshot if available (contains the full edited CV data)
          if (record.bcl_cv_snapshot && Object.keys(record.bcl_cv_snapshot).length > 0) {
            console.log('[CV Builder] Loading from bcl_cv_snapshot (existing CV data)');
            const snapshotData = record.bcl_cv_snapshot;

            // A snapshot already exists in the database for this applicant, so the
            // Secure Review URL can be generated immediately without forcing another
            // "Save Draft" step.
            setHasSavedDraft(true);
            setLastDraftName(record.full_name ? `CV - ${record.full_name}` : 'Saved CV');

            // Merge snapshot with EMPTY_CV_DATA to ensure all fields exist
            const mergedData = {
              ...EMPTY_CV_DATA,
              ...snapshotData,
              personalInfo: { ...EMPTY_CV_DATA.personalInfo, ...(snapshotData.personalInfo || {}) },
              personalDetails: { ...EMPTY_CV_DATA.personalDetails, ...(snapshotData.personalDetails || {}) },
              skills: (() => {
                const mappedSkills = Array.isArray(snapshotData.skills)
                  ? snapshotData.skills.map((s: any) => {
                      // Normalize format: {Skill: "..."} -> {category: "", items: "..."}
                      if (s.Skill || s.skill) {
                        return { category: "", items: s.Skill || s.skill || "" };
                      }
                      return s;
                    })
                  : EMPTY_CV_DATA.skills;
                // Snapshot entries can exist but be entirely blank (placeholders) —
                // fall back to the raw raw_cv_extracted_details in that case.
                if (isSkillsBlank(mappedSkills)) {
                  const fallback = mapSkillsFromExtractedDetails(record.raw_cv_extracted_details || {});
                  if (fallback.length > 0) return fallback;
                }
                return mappedSkills;
              })(),
              experience: Array.isArray(snapshotData.experience) ? snapshotData.experience : EMPTY_CV_DATA.experience,
              internships: Array.isArray(snapshotData.internships) ? snapshotData.internships : EMPTY_CV_DATA.internships,
              projects: Array.isArray(snapshotData.projects) ? snapshotData.projects : EMPTY_CV_DATA.projects,
              education: Array.isArray(snapshotData.education) ? snapshotData.education : EMPTY_CV_DATA.education,
              references: Array.isArray(snapshotData.references) ? snapshotData.references : EMPTY_CV_DATA.references,
              languages: Array.isArray(snapshotData.languages) ? snapshotData.languages : EMPTY_CV_DATA.languages,
              certifications: (() => {
                const mappedCerts = Array.isArray(snapshotData.certifications)
                  ? snapshotData.certifications.map((c: any) => {
                      // Normalize format: {Qualification: "..."} -> {name: "...", issuer: "", date: "", url: ""}
                      if (c.Qualification || c.qualification) {
                        return { name: c.Qualification || c.qualification || "", issuer: "", date: "", url: "" };
                      }
                      return c;
                    })
                  : EMPTY_CV_DATA.certifications;
                // Snapshot entries can exist but be entirely blank (placeholders) —
                // fall back to the raw raw_cv_extracted_details in that case.
                if (isCertificationsBlank(mappedCerts)) {
                  const fallback = mapCertificationsFromExtractedDetails(record.raw_cv_extracted_details || {}, record.qualifications);
                  if (fallback.length > 0) return fallback;
                }
                return mappedCerts;
              })(),
              achievements: Array.isArray(snapshotData.achievements) ? snapshotData.achievements : EMPTY_CV_DATA.achievements,
              additionalInfo: Array.isArray(snapshotData.additionalInfo) ? snapshotData.additionalInfo : EMPTY_CV_DATA.additionalInfo,
            };

            console.log('[CV Builder] Merged snapshot data:', {
              personalInfo: mergedData.personalInfo,
              skills_count: mergedData.skills.length,
              experience_count: mergedData.experience.length,
              education_count: mergedData.education.length,
              languages_count: mergedData.languages.length,
              certifications_count: mergedData.certifications.length,
              achievements_count: mergedData.achievements.length,
              references_count: mergedData.references.length,
            });

            try { localStorage.removeItem('cv_generator_cvData'); } catch {}
            setCvData(mergedData);
            
            // Restore cvSettings and selectedLayout if saved in snapshot
            if (snapshotData.cvSettings) {
              setCvSettings((prev: any) => ({ ...prev, ...snapshotData.cvSettings }));
            }
            if (snapshotData.selectedLayout) {
              setSelectedLayout(snapshotData.selectedLayout);
            }
            
            // Mark as having a saved draft since we loaded from bcl_cv_snapshot
            setHasSavedDraft(true);
            setLastDraftName(`CV - ${record.full_name || 'Applicant'}`);
            toast.success('Loaded existing CV data from database.');
          } else {
            // No bcl_cv_snapshot, build from raw_cv_extracted_details
            console.log('[CV Builder] No bcl_cv_snapshot found, building from raw_cv_extracted_details');
            const ed = record.raw_cv_extracted_details || {};
            console.log('[CV Builder] Extracted details keys:', Object.keys(ed));
            console.log('[CV Builder] Extracted details:', ed);

            const prefilledData = {
              personalInfo: {
                fullName: record.full_name || ed['Full Name'] || ed.full_name || "",
                title: record.position_applied || ed['Position Applied'] || ed.position_applied || "",
                email: record.email || ed['Email'] || ed.email || "",
                phone: record.phone_number || ed['Phone Number'] || ed.phone_number || "",
                location: ed['Location'] || ed.address || "",
                github: ed['GitHub'] || ed.github || "",
                linkedin: ed['LinkedIn'] || ed.linkedin || "",
                photoUrl: ""
              },
              personalDetails: {
                dateOfBirth: record.date_of_birth || ed['Date of Birth'] || ed.date_of_birth || "",
                nationality: ed['Nationality'] || ed.nationality || "",
                maritalStatus: ed['Marital Status'] || ed.marital_status || "",
                residence: ed['Residence'] || ed.residence || "",
                kenyaStatus: ed['Kenya Status'] || ed.kenya_status || "",
                nairobiRes: ed['Nairobi Res'] || ed.nairobi_res || "",
                drivingExperience: ed['Driving License'] || ed.driving_license || ""
              },
              summary: ed['Professional Summary'] || ed['Summary'] || ed.summary || "",
              skills: mapSkillsFromExtractedDetails(ed),
              experience: Array.isArray(ed['Work Experience'] || ed.experience)
                ? (ed['Work Experience'] || ed.experience).map((exp: any) => {
                    // Handle responsibilities - can be string or array
                    let responsibilities = [];
                    if (Array.isArray(exp.responsibilities || exp.Responsibilities)) {
                      responsibilities = exp.responsibilities || exp.Responsibilities;
                    } else if (typeof exp.responsibilities === 'string' && exp.responsibilities) {
                      responsibilities = exp.responsibilities.split('\n').filter(Boolean);
                    } else if (typeof exp.Responsibilities === 'string' && exp.Responsibilities) {
                      responsibilities = exp.Responsibilities.split('\n').filter(Boolean);
                    }
                    
                    return {
                      company: exp.company || exp.Company || "",
                      location: exp.location || exp.Location || "",
                      role: exp.role || exp.position || exp.Position || exp.Role || "",
                      startDate: exp.startDate || exp['Start Date'] || exp.start_date || "",
                      endDate: exp.endDate || exp['End Date'] || exp.end_date || "",
                      companyDesc: exp.companyDesc || exp.description || "",
                      responsibilities: responsibilities
                    };
                  })
                : [],
              education: (() => {
                const rawEdu = ed['Education'] || ed.education;
                if (!Array.isArray(rawEdu) || rawEdu.length === 0) return [];
                return rawEdu.map((edu: any) => ({
                  degree: edu.degree || edu.Degree || "",
                  institution: edu.institution || edu.Institution || "",
                  year: edu.year || edu.Year || edu.endDate || "",
                  details: edu.details || edu.description || edu.grade || ""
                }));
              })(),
              internships: Array.isArray(ed['Internships'] || ed.internships) ? ed['Internships'] || ed.internships : [],
              projects: Array.isArray(ed['Projects'] || ed.projects) ? ed['Projects'] || ed.projects : [],
              references: (() => {
                const rawRefs = ed['Referees'] || ed.references || ed.referees;
                if (!Array.isArray(rawRefs) || rawRefs.length === 0) return [];
                return rawRefs.map((ref: any) => ({
                  name: ref.name || ref.Name || ref['Referee Name'] || "",
                  title: ref.title || ref.Title || ref.position || ref.Position || "",
                  company: ref.company || ref.Company || "",
                  address: ref.address || ref.Address || "",
                  contact: ref.contact || ref.Contact || ref.phone || ref.Phone || ref.email || ref.Email || ""
                }));
              })(),
              languages: (() => {
                const rawLangs = ed['Languages'] || ed.languages;
                if (!Array.isArray(rawLangs) || rawLangs.length === 0) return [];
                return rawLangs.map((l: any) => ({
                  language: l.language || l.Language || "",
                  proficiency: l.proficiency || l.Proficiency || ""
                }));
              })(),
              certifications: mapCertificationsFromExtractedDetails(ed, record.qualifications),
              achievements: (() => {
                const rawAchievements = ed['Achievements'] || ed.achievements;
                if (!Array.isArray(rawAchievements) || rawAchievements.length === 0) return [];
                return rawAchievements.map((a: any) => {
                  // Handle various formats
                  if (a['Achievement'] || a.achievement) {
                    return {
                      title: a['Achievement'] || a.achievement || "",
                      description: a.description || a.Description || "",
                      date: a.date || a.Date || ""
                    };
                  }
                  return {
                    title: a.title || a.Title || "",
                    description: a.description || a.Description || "",
                    date: a.date || a.Date || ""
                  };
                });
              })(),
              additionalInfo: (() => {
                const rawAdditional = ed['Additional Info'] || ed.additionalInfo;
                if (!Array.isArray(rawAdditional) || rawAdditional.length === 0) return [];
                return rawAdditional.map((info: any) => ({
                  label: info.label || info.Label || info.name || "",
                  value: info.value || info.Value || info.description || ""
                }));
              })(),
              // Declaration is a fixed BCL statement, not something extracted from the
              // candidate's uploaded CV — always use our own default text here so it
              // stays consistent regardless of what the source document contained.
              declaration: DEFAULT_DECLARATION_TEXT,
              includeDeclaration: true,
              verifiedBadge: true
            };

            console.log('[CV Builder] Built prefilledData:', {
              personalInfo: prefilledData.personalInfo,
              skills_count: prefilledData.skills.length,
              experience_count: prefilledData.experience.length,
              education_count: prefilledData.education.length,
              languages_count: prefilledData.languages.length,
              certifications_count: prefilledData.certifications.length,
              references_count: prefilledData.references.length,
              achievements_count: prefilledData.achievements.length,
            });

            // Clear localStorage to prevent stale data from interfering
            try { localStorage.removeItem('cv_generator_cvData'); } catch {}

            // Check for existing draft at cv-builder/{applicant_id}/draft.json
            try {
              const { data: draftBlob, error: draftError } = await supabase.storage
                .from('kyc-documents')
                .download(`cv-builder/${applicantIdParam}/draft.json`);

              if (!draftError && draftBlob) {
                const draftText = await draftBlob.text();
                const draft = JSON.parse(draftText);
                console.log('[CV Builder] Found existing draft in storage:', draft.name);
                toast(`Found existing draft "${draft.name}". Loading draft data instead.`, { icon: '📋' });
                if (draft.data) setCvData(draft.data);
                if (draft.cvSettings) setCvSettings(draft.cvSettings);
                if (draft.selectedLayout) setSelectedLayout(draft.selectedLayout);
              } else {
                // No draft found, use prefilled data from extraction
                console.log('[CV Builder] No draft found, using prefilled data from raw_cv_extracted_details');
                setCvData(prefilledData);
                toast.success('CV pre-filled from applicant data. You can now edit and build the CV.');
              }
            } catch {
              // Draft check failed, use prefilled data
              console.log('[CV Builder] Draft check failed, using prefilled data');
              setCvData(prefilledData);
              toast.success('CV pre-filled from applicant data. You can now edit and build the CV.');
            }
          }

          setWorkflowStep('review-edit');
          setActiveSection('contact');
          setShowSaveCvPrompt(true);

          // Clean URL params
          window.history.replaceState({}, '', window.location.pathname);
        } catch (e) {
          console.error('[CV Builder] Failed to load applicant data:', e);
          toast.error('Failed to load applicant data.');
        }
      })();
    } else if (raw) {
      // Legacy sessionStorage fallback (same-origin only)
      try {
        const prefill = JSON.parse(raw);
        sessionStorage.removeItem('cv_builder_prefill');
        if (prefill.applicant_id) setApplicantId(prefill.applicant_id);
        if (prefill.individual_id) setLinkedIndividualId(prefill.individual_id);

        const prefilledData = {
          personalInfo: {
            fullName: prefill.personalInfo?.fullName || "",
            title: prefill.personalInfo?.title || "",
            email: prefill.personalInfo?.email || "",
            phone: prefill.personalInfo?.phone || "",
            location: prefill.personalInfo?.location || "",
            github: prefill.personalInfo?.github || "",
            linkedin: prefill.personalInfo?.linkedin || "",
            photoUrl: prefill.personalInfo?.photoUrl || ""
          },
          personalDetails: {
            dateOfBirth: prefill.personalDetails?.dateOfBirth || "",
            nationality: prefill.personalDetails?.nationality || "",
            maritalStatus: prefill.personalDetails?.maritalStatus || "",
            residence: prefill.personalDetails?.residence || "",
            kenyaStatus: prefill.personalDetails?.kenyaStatus || "",
            nairobiRes: prefill.personalDetails?.nairobiRes || "",
            drivingExperience: prefill.personalDetails?.drivingExperience || ""
          },
          summary: prefill.summary || "",
          skills: Array.isArray(prefill.skills) ? prefill.skills.map((s: any) => ({
            category: s.category || "", items: Array.isArray(s.items) ? s.items.join(", ") : String(s.items || "")
          })) : [],
          experience: Array.isArray(prefill.experience) ? prefill.experience : [],
          education: Array.isArray(prefill.education) ? prefill.education : [],
          internships: Array.isArray(prefill.internships) ? prefill.internships : [],
          projects: Array.isArray(prefill.projects) ? prefill.projects : [],
          references: Array.isArray(prefill.references) ? prefill.references : [],
          languages: Array.isArray(prefill.languages) ? prefill.languages : [],
          certifications: Array.isArray(prefill.certifications) ? prefill.certifications : [],
          achievements: Array.isArray(prefill.achievements) ? prefill.achievements : [],
          additionalInfo: Array.isArray(prefill.additionalInfo) ? prefill.additionalInfo : [],
          // Always use our own default declaration text, never whatever the prefill source carried.
          declaration: DEFAULT_DECLARATION_TEXT,
          includeDeclaration: true,
          verifiedBadge: true
        };
        try { localStorage.removeItem('cv_generator_cvData'); } catch {}
        setCvData(prefilledData);
        setWorkflowStep('review-edit');
        setActiveSection('contact');
        setShowSaveCvPrompt(true);
        toast.success('CV pre-filled from applicant data.');
      } catch (e) { console.error('[CV Builder] SessionStorage parse error:', e); }
    }
  }, []);

  const handleMergeUpdates = async () => {
    const diffs = getCVDiffs(cvData, clientSubmission);
    const updatedData = JSON.parse(JSON.stringify(cvData));

    let mergeCount = 0;
    diffs.forEach(diff => {
      if (acceptedFields[diff.path] !== false) {
        mergeCount++;
        if (diff.path.startsWith('personalInfo.')) {
          const key = diff.path.split('.')[1];
          if (!updatedData.personalInfo) updatedData.personalInfo = {};
          updatedData.personalInfo[key] = clientSubmission.personalInfo?.[key];
        } else if (diff.path.startsWith('personalDetails.')) {
          const key = diff.path.split('.')[1];
          if (!updatedData.personalDetails) updatedData.personalDetails = {};
          updatedData.personalDetails[key] = clientSubmission.personalDetails?.[key];
        } else if (diff.path === 'summary') {
          updatedData.summary = clientSubmission.summary;
        } else if (diff.path === 'skills') {
          updatedData.skills = clientSubmission.skills;
        } else if (diff.path === 'experience') {
          updatedData.experience = clientSubmission.experience;
        } else if (diff.path === 'education') {
          updatedData.education = clientSubmission.education;
        } else if (diff.path === 'languages') {
          updatedData.languages = clientSubmission.languages;
        } else if (diff.path === 'certifications') {
          updatedData.certifications = clientSubmission.certifications;
        } else if (diff.path === 'achievements') {
          updatedData.achievements = clientSubmission.achievements;
        } else if (diff.path === 'additionalInfo') {
          updatedData.additionalInfo = clientSubmission.additionalInfo;
        }
      }
    });

    // Save merged data to database
    if (applicantId) {
      try {
        const snapshotPayload = {
          ...updatedData,
          cvSettings,
          selectedLayout,
        };
        const { error } = await supabase
          .from('job_applicant_cvs')
          .update({
            bcl_cv_snapshot: snapshotPayload,
            bcl_cv_extracted_details: updatedData,
            updated_at: new Date().toISOString(),
          })
          .eq('applicant_id', applicantId);
        
        if (error) {
          console.error('Failed to save merged data to database:', error);
        }
      } catch (e) {
        console.error('Database save failed:', e);
      }
    }

    setCvData(updatedData);
    setHasClientSubmission(false);
    setClientSubmission(null);
    setAcceptedFields({});
    toast.success(`Successfully merged ${mergeCount} updates into the registry!`);
  };

  // Sends the whole CV to the AI to be rewritten/polished in one pass, then merges
  // the result back in — keeping factual/identity fields (contact info, dates,
  // declaration, etc.) exactly as they were so the AI can only touch wording.
  const handleAiEnhanceCv = async () => {
    if (isEnhancingCv) return;
    setIsEnhancingCv(true);

    const enhancePromise = (async () => {
      const res = await fetch("/api/cv/ai-writer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "enhance-full-cv", cvData }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCvData((prev: any) => mergeAiEnhancedCv(prev, data.result || {}));
      return data;
    })();

    toast.promise(enhancePromise, {
      loading: "Sending your CV to AI for a full enhancement pass…",
      success: "CV enhanced! Review the changes across each section before saving.",
      error: (err: any) => `AI enhancement failed: ${err.message || "Unknown error"}`,
    });

    try {
      await enhancePromise;
    } catch {
      // toast.promise already surfaced the error to the user
    } finally {
      setIsEnhancingCv(false);
    }
  };

  const sectionGroups = [
    {
      label: 'Core',
      sections: [
        { id: 'contact', label: 'Contact Information', icon: User, count: 1 },
        { id: 'summary', label: 'Professional Summary', icon: BookOpen, count: cvData.summary ? 1 : 0 },
      ],
    },
    {
      label: 'Experience',
      sections: [
        { id: 'experience', label: 'Experience', icon: Briefcase, count: cvData.experience.length },
        { id: 'internships', label: 'Internships', icon: Briefcase, count: cvData.internships.length },
        { id: 'education', label: 'Education', icon: GraduationCap, count: cvData.education.length },
        { id: 'certifications', label: 'Certifications', icon: Award, count: cvData.certifications?.length || 0 },
      ],
    },
    {
      label: 'Skills & Projects',
      sections: [
        { id: 'skills', label: 'Skills', icon: Sparkles, count: cvData.skills.length },
        { id: 'projects', label: 'Projects', icon: FolderGit2, count: cvData.projects.length },
        { id: 'achievements', label: 'Achievements', icon: Target, count: cvData.achievements?.length || 0 },
      ],
    },
    {
      label: 'Additional',
      sections: [
        { id: 'languages', label: 'Languages', icon: Globe, count: cvData.languages.length },
        { id: 'references', label: 'References', icon: MessageSquare, count: cvData.references.length },
        { id: 'additionalInfo', label: 'Additional Info', icon: FileSpreadsheet, count: cvData.additionalInfo?.length || 0 },
        { id: 'declaration', label: 'Declaration', icon: Check, count: cvData.declaration ? 1 : 0 },
      ],
    },
  ];

  const sectionMeta = sectionGroups.flatMap(g => g.sections);

  const previewRef = useRef<HTMLDivElement>(null);

  const handleClientPersonalInfoChange = (field: string, value: any) => {
    setClientEdits((prev: any) => ({
      ...prev,
      personalInfo: { ...prev.personalInfo, [field]: value }
    }));
  };

  const handleClientPersonalDetailsChange = (field: string, value: any) => {
    setClientEdits((prev: any) => ({
      ...prev,
      personalDetails: { ...prev.personalDetails, [field]: value }
    }));
  };

  // Employment-gap answers get their own keyed bucket so they never overwrite
  // unrelated fields like personalDetails.kenyaStatus (Kenya work-permit status),
  // which is rendered directly on the CV.
  const handleClientGapNoteChange = (gapKey: string, field: 'reason' | 'detail', value: string) => {
    setClientEdits((prev: any) => ({
      ...prev,
      personalDetails: {
        ...prev.personalDetails,
        employmentGapNotes: {
          ...(prev.personalDetails?.employmentGapNotes || {}),
          [gapKey]: { ...(prev.personalDetails?.employmentGapNotes?.[gapKey] || {}), [field]: value },
        },
      },
    }));
  };

  // Draft functions — all drafts persisted to Supabase storage + bcl_cv_snapshot in database
  const saveDraft = async (name: string, forPortal: boolean = false): Promise<string> => {
    setIsSavingDraft(true);
    const id = (forPortal && currentPortalDraftId) ? currentPortalDraftId : (crypto.randomUUID ? crypto.randomUUID() : `draft-${Date.now()}`);
    const newDraft = {
      id,
      name,
      data: JSON.parse(JSON.stringify(cvData)),
      createdAt: new Date().toISOString(),
      isPortalDraft: forPortal,
      cvSettings,
      selectedLayout,
      applicantId,
    };
    setCvDrafts(prev => { const filtered = prev.filter(d => d.id !== id); return [newDraft, ...filtered]; });
    if (forPortal) setCurrentPortalDraftId(id);
    
    // Track if database save succeeded
    let dbSaveSucceeded = false;
    
    try {
      // Always save to database first (bcl_cv_snapshot) - this is the primary save
      if (applicantId) {
        console.log('[CV Builder] Saving CV data to bcl_cv_snapshot in job_applicant_cvs for applicantId:', applicantId);
        // Save cvData along with cvSettings and selectedLayout in the snapshot
        const snapshotPayload = {
          ...cvData,
          cvSettings,
          selectedLayout,
        };
        const { error: snapshotError } = await supabase
          .from('job_applicant_cvs')
          .upsert({
            applicant_id: applicantId,
            bcl_cv_snapshot: snapshotPayload,
            bcl_cv_extracted_details: cvData,
            updated_at: new Date().toISOString()
          }, { onConflict: 'applicant_id' });

        if (snapshotError) {
          console.error('[CV Builder] Failed to save bcl_cv_snapshot:', snapshotError);
          toast.error('Failed to save to database');
        } else {
          console.log('[CV Builder] Successfully saved bcl_cv_snapshot to job_applicant_cvs');
          dbSaveSucceeded = true;
        }

        // If linked individual, also update their record
        if (linkedIndividualId) {
          console.log('[CV Builder] Also saving CV data for linked individual:', linkedIndividualId);
        }
      }
      
      // Then try to save to storage (backup) - catch errors gracefully
      try {
        const payload = JSON.stringify(newDraft);
        const blob = new Blob([payload], { type: 'application/json' });

        if (applicantId) {
          console.log('[CV Builder] Saving draft to storage:', `cv-builder/${applicantId}/draft.json`);
          // Try to remove existing file first, then upload
          try {
            await supabase.storage.from('kyc-documents').remove([`cv-builder/${applicantId}/draft.json`]);
          } catch { /* ignore if file doesn't exist */ }
          await supabase.storage.from('kyc-documents').upload(`cv-builder/${applicantId}/draft.json`, blob, { contentType: 'application/json' });
        } else {
          // Fallback to cv-drafts/{id}/draft.json for portal drafts / standalone use
          try {
            await supabase.storage.from('kyc-documents').remove([`cv-drafts/${id}/draft.json`]);
          } catch { /* ignore if file doesn't exist */ }
          await supabase.storage.from('kyc-documents').upload(`cv-drafts/${id}/draft.json`, blob, { contentType: 'application/json' });
        }
        console.log('[CV Builder] Draft saved to storage successfully');
      } catch (storageErr) {
        console.warn('[CV Builder] Storage save failed (database save succeeded):', storageErr);
        // Don't fail the whole operation if storage fails
      }
    } catch (e) {
      console.warn('[CV Builder] Draft save failed:', e);
    }
    setIsSavingDraft(false);
    if (dbSaveSucceeded) {
      setHasSavedDraft(true);
      setLastDraftName(name);
      toast.success(`Draft "${name}" saved successfully`);
    }
    return id;
  };

  const loadDraft = async (draft: any) => {
    try {
      // Try cv-builder path first (for applicant-linked drafts)
      let draftData = null;
      if (applicantId) {
        const { data: builderBlob, error: builderError } = await supabase.storage
          .from('kyc-documents').download(`cv-builder/${applicantId}/draft.json`);
        if (!builderError && builderBlob) {
          const text = await builderBlob.text();
          draftData = JSON.parse(text);
        }
      }
      // Fallback to cv-drafts path (for standalone/portal drafts)
      if (!draftData) {
        const { data, error } = await supabase.storage
          .from('kyc-documents').download(`cv-drafts/${draft.id}/draft.json`);
        if (!error && data) {
          const text = await data.text();
          draftData = JSON.parse(text);
        }
      }

      if (draftData) {
        if (draftData.data) setCvData(draftData.data);
        if (draftData.cvSettings) setCvSettings(draftData.cvSettings);
        if (draftData.selectedLayout) setSelectedLayout(draftData.selectedLayout);
      } else if (draft.data) {
        setCvData(draft.data);
        if (draft.cvSettings) setCvSettings(draft.cvSettings);
        if (draft.selectedLayout) setSelectedLayout(draft.selectedLayout);
      }
      
      // Mark as having a saved draft
      setHasSavedDraft(true);
      setLastDraftName(draft.name);
    } catch {
      if (draft.data) setCvData(draft.data);
      setHasSavedDraft(true);
      setLastDraftName(draft.name);
    }
    setWorkflowStep('review-edit');
    setActiveSection('contact');
    toast.success(`Draft "${draft.name}" loaded`);
  };

  const deleteDraft = async (id: string) => {
    setCvDrafts(prev => prev.filter(d => d.id !== id));
    try {
      // Try both paths
      await supabase.storage.from('kyc-documents').remove([`cv-drafts/${id}/draft.json`]);
      if (applicantId) {
        await supabase.storage.from('kyc-documents').remove([`cv-builder/${applicantId}/draft.json`]);
      }
    } catch { /* ignore */ }
  };

  const checkForClientSubmission = async () => {
    if (!currentPortalDraftId) { 
      // Try to find any submission from database if no portal draft ID
      if (applicantId) {
        try {
          const { data: record, error } = await supabase
            .from('job_applicant_cvs')
            .select('raw_cv_extracted_details')
            .eq('applicant_id', applicantId)
            .single();
          
          if (!error && record?.raw_cv_extracted_details?.clientEdits) {
            setClientSubmission(record.raw_cv_extracted_details.clientEdits);
            setHasClientSubmission(true);
            toast.success('Client submission loaded from database!');
            return;
          }
        } catch (e) {
          console.error('Failed to load submission from database:', e);
        }
      }
      toast.info('No portal draft linked yet.'); 
      return; 
    }
    
    // Try storage first
    try {
      const { data, error } = await supabase.storage.from('kyc-documents').download(`cv-drafts/${currentPortalDraftId}/client-submission.json`);
      if (!error && data) {
        const text = await data.text();
        const submission = JSON.parse(text);
        setClientSubmission(submission.clientEdits || submission);
        setHasClientSubmission(true);
        toast.success('Client submission loaded from storage!');
        return;
      }
    } catch (e) {
      // Storage load failed, try database
    }
    
    // Fallback to database
    if (applicantId) {
      try {
        const { data: record, error } = await supabase
          .from('job_applicant_cvs')
          .select('raw_cv_extracted_details')
          .eq('applicant_id', applicantId)
          .single();
        
        if (!error && record?.raw_cv_extracted_details?.clientEdits) {
          setClientSubmission(record.raw_cv_extracted_details.clientEdits);
          setHasClientSubmission(true);
          toast.success('Client submission loaded from database!');
          return;
        }
      } catch (e) {
        console.error('Failed to load submission from database:', e);
      }
    }
    
    toast.info('No client submission found yet.');
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsExtracting(true);
    setExtractionProgress("Reading file content...");

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          setExtractionProgress("Stage 1: Extracting CV content with Gemini...");
          const base64Content = (reader.result as string).split(",")[1];
          const mimeType = file.type;

          const response = await fetch("/api/cv/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileBase64: base64Content, mimeType, enhancementLevel }),
          });

          if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            throw new Error(errBody.details || errBody.error || response.statusText);
          }

          if (enhancementLevel !== "none") {
            setExtractionProgress(`Stage 2: Applying ${enhancementLevel} enhancement...`);
          }

          const parsedData = await response.json();
          setExtractionProgress("Populating CV fields...");

          const cleanedData = {
            ...initialCVData,
            ...parsedData,
            personalInfo: { ...initialCVData.personalInfo, ...(parsedData.personalInfo || {}) },
            personalDetails: { ...initialCVData.personalDetails, ...(parsedData.personalDetails || {}) },
            skills: Array.isArray(parsedData.skills)
              ? parsedData.skills.map((s: any) => ({
                  category: s.category || "",
                  items: Array.isArray(s.items) ? s.items.join(", ") : String(s.items || "")
                }))
              : initialCVData.skills,
            experience: Array.isArray(parsedData.experience) ? parsedData.experience : initialCVData.experience,
            internships: Array.isArray(parsedData.internships) ? parsedData.internships : initialCVData.internships,
            projects: Array.isArray(parsedData.projects) ? parsedData.projects : initialCVData.projects,
            education: Array.isArray(parsedData.education) ? parsedData.education : initialCVData.education,
            references: Array.isArray(parsedData.references) ? parsedData.references : initialCVData.references,
            languages: Array.isArray(parsedData.languages) ? parsedData.languages : initialCVData.languages,
            certifications: Array.isArray(parsedData.certifications) ? parsedData.certifications : initialCVData.certifications,
            // Declaration is a fixed BCL statement, never something the AI should extract
            // or overwrite from the uploaded document — keep our own default here.
            declaration: initialCVData.declaration,
            includeDeclaration: true,
            verifiedBadge: true,
          };

          setCvData(cleanedData);
          const enhancedLabel = enhancementLevel !== "none" ? ` (${enhancementLevel} enhancement applied)` : "";
          toast.success(`CV parsed successfully!${enhancedLabel}`);

          // Persist the raw file + extracted data into job_applicant_cvs so the
          // upload isn't lost if the user navigates away before saving a draft.
          setExtractionProgress("Saving to database...");
          try {
            const finalApplicantId = applicantId || crypto.randomUUID();
            const filePath = `cv-builder/${finalApplicantId}/raw-cv-${Date.now()}-${file.name}`;
            const { error: uploadError } = await supabase.storage
              .from('kyc-documents')
              .upload(filePath, file, { upsert: true, contentType: file.type });
            if (uploadError) throw uploadError;

            const rawDob = cleanedData.personalDetails?.dateOfBirth || "";
            const parsedDob = rawDob && !isNaN(Date.parse(rawDob)) ? new Date(rawDob).toISOString().split('T')[0] : null;

            const cvRecordData = {
              full_name: cleanedData.personalInfo?.fullName || 'Unknown Applicant',
              email: cleanedData.personalInfo?.email || '',
              phone_number: cleanedData.personalInfo?.phone || '',
              position_applied: cleanedData.personalInfo?.title || null,
              date_of_birth: parsedDob,
              raw_cv_file_path: filePath,
              raw_cv_extracted_details: parsedData,
              bcl_cv_snapshot: { ...cleanedData, cvSettings, selectedLayout },
              updated_at: new Date().toISOString(),
            };

            if (applicantId) {
              const { error: updateError } = await supabase
                .from('job_applicant_cvs')
                .update(cvRecordData)
                .eq('applicant_id', applicantId);
              if (updateError) throw updateError;
            } else {
              const { error: insertError } = await supabase
                .from('job_applicant_cvs')
                .insert([{ ...cvRecordData, applicant_id: finalApplicantId, created_at: new Date().toISOString() }]);
              if (insertError) throw insertError;
              setApplicantId(finalApplicantId);
              const url = new URL(window.location.href);
              url.searchParams.set('applicantId', finalApplicantId);
              window.history.replaceState({}, '', url.toString());
            }
            toast.success('CV saved to database.');
          } catch (dbErr: any) {
            console.error('[CV Builder] Failed to save uploaded CV to database:', dbErr);
            toast.error(`CV parsed but failed to save to database: ${dbErr.message || 'Unknown error'}`);
          }
        } catch (err: any) {
          console.error(err);
          toast.error(`Extraction failed: ${err.message || "Unknown error"}`);
        } finally {
          setIsExtracting(false);
          setExtractionProgress("");
        }
      };

      reader.onerror = () => {
        toast.error("Failed to read file on the client.");
        setIsExtracting(false);
      };

      reader.readAsDataURL(file);
    } catch (e: any) {
      console.error(e);
      toast.error(`Error uploading: ${e.message}`);
      setIsExtracting(false);
    }
  };

  const searchIndividuals = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from('registry_individuals')
        .select('id, full_name, gender, contact_details, residential_address_details')
        .ilike('full_name', `%${query}%`)
        .limit(10);
      if (!error && data) setSearchResults(data);
    } catch { /* ignore */ } finally {
      setIsSearching(false);
    }
  }, []);

  const handleIndividualSearchChange = (value: string) => {
    setIndividualSearch(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => searchIndividuals(value), 350);
  };

  const fetchPhotoForIndividual = async (individualId: number): Promise<string | null> => {
    setIsFetchingPhoto(true);
    try {
      const { data, error } = await supabase
        .from('acc_portal_directors_documents')
        .select('file_path, document_id, created_at')
        .eq('director_id', individualId)
        .in('document_id', [CLEAR_PHOTO_ID, PASSPORT_PHOTO_ID])
        .order('created_at', { ascending: false });
      if (error || !data?.length) return null;
      const clearPhoto = data.find((d: any) => d.document_id === CLEAR_PHOTO_ID);
      const passportPhoto = data.find((d: any) => d.document_id === PASSPORT_PHOTO_ID);
      const photo = clearPhoto || passportPhoto;
      if (!photo) return null;
      const bucket = 'kyc-documents';
      const fp: string = photo.file_path;
      const filePath = fp.startsWith(bucket) ? fp : `${bucket}/${fp}`;
      return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${filePath}`;
    } catch { return null; } finally { setIsFetchingPhoto(false); }
  };

  const handleSelectIndividual = async (individual: any) => {
    setSelectedIndividual(individual);
    setSearchResults([]);
    setIndividualSearch('');
    setPendingPhotoFile(null);
    setPendingPhotoPreview(null);
    setShowSavePhotoPrompt(false);

    const contact = Array.isArray(individual.contact_details)
      ? individual.contact_details[0] || {}
      : individual.contact_details || {};
    const addr = Array.isArray(individual.residential_address_details)
      ? individual.residential_address_details[0] || {}
      : individual.residential_address_details || {};

    const phone =
      contact.phone?.kenyan?.primary ||
      contact.phone?.abroad?.primary ||
      contact.phone?.whatsapp || '';
    const email = contact.email?.primary || '';
    const location = [addr.city, addr.country].filter(Boolean).join(', ');

    setRegistryFormData({
      fullName: individual.full_name || '',
      phone,
      email,
      location,
      languages: [{ language: 'English', proficiency: 'Professional' }],
    });

    const photoUrl = await fetchPhotoForIndividual(individual.id);
    setIndividualPhoto(photoUrl);
  };

  const applyIndividualToCV = () => {
    if (!selectedIndividual) return;
    const photoUrl = pendingPhotoPreview || individualPhoto || '';
    const contact = Array.isArray(selectedIndividual.contact_details)
      ? selectedIndividual.contact_details[0] || {}
      : selectedIndividual.contact_details || {};
    setCvData({
      ...EMPTY_CV_DATA,
      personalInfo: {
        ...EMPTY_CV_DATA.personalInfo,
        fullName: registryFormData.fullName || selectedIndividual.full_name || "",
        phone: registryFormData.phone || contact.phone?.kenyan?.primary || contact.phone?.abroad?.primary || "",
        email: registryFormData.email || contact.email?.primary || "",
        location: registryFormData.location || "",
        photoUrl,
      },
      personalDetails: {
        ...EMPTY_CV_DATA.personalDetails,
        nationality: selectedIndividual.nationality || "",
      },
      languages: registryFormData.languages.length > 0
        ? registryFormData.languages
        : EMPTY_CV_DATA.languages,
    });
    toast.success(`CV pre-filled with ${registryFormData.fullName || selectedIndividual.full_name}'s details`);
    setWorkflowStep('review-edit');
    setActiveSection('contact');
    if (pendingPhotoFile) setShowSavePhotoPrompt(true);
    setShowSaveCvPrompt(true);
  };

  const addRegistryLanguage = () =>
    setRegistryFormData(prev => ({
      ...prev,
      languages: [...prev.languages, { language: '', proficiency: 'Professional' }],
    }));

  const updateRegistryLanguage = (idx: number, field: 'language' | 'proficiency', value: string) =>
    setRegistryFormData(prev => {
      const updated = [...prev.languages];
      updated[idx] = { ...updated[idx], [field]: value };
      return { ...prev, languages: updated };
    });

  const removeRegistryLanguage = (idx: number) =>
    setRegistryFormData(prev => ({
      ...prev,
      languages: prev.languages.filter((_, i) => i !== idx),
    }));

  const handleRegistryPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingPhotoFile(file);
    const url = URL.createObjectURL(file);
    setPendingPhotoPreview(url);
  };

  const savePhotoToRegistry = async () => {
    if (!pendingPhotoFile) return;
    if (!selectedIndividual && !applicantId) return;
    setIsSavingPhoto(true);
    try {
      const ext = pendingPhotoFile.name.split('.').pop() || 'jpg';

      // Determine the effective individual ID (client) for acc_portal_directors_documents
      const effectiveIndividualId = selectedIndividual?.id || linkedIndividualId;

      if (selectedIndividual) {
        // Path A: User manually selected a client in the builder
        const filePath = `individual-documents/${selectedIndividual.id}/${CLEAR_PHOTO_ID}/photo_${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('kyc-documents')
          .upload(filePath, pendingPhotoFile, { upsert: true, contentType: pendingPhotoFile.type });
        if (uploadError) throw uploadError;
        await supabase.from('acc_portal_directors_documents').upsert({
          director_id: selectedIndividual.id,
          document_id: CLEAR_PHOTO_ID,
          file_path: filePath,
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'director_id,file_path' });
        toast.success('Photo saved to client record');
        setShowSavePhotoPrompt(false);
        setIndividualPhoto(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${filePath}`);
      } else if (applicantId) {
        // Path B: User came from registry via applicantId
        // 1. Always save to cv-builder storage
        const builderPath = `cv-builder/${applicantId}/photo.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('kyc-documents')
          .upload(builderPath, pendingPhotoFile, { upsert: true, contentType: pendingPhotoFile.type });
        if (uploadError) throw uploadError;

        // 2. If this is a linked client, also save to acc_portal_directors_documents
        if (effectiveIndividualId) {
          const registryPath = `individual-documents/${effectiveIndividualId}/${CLEAR_PHOTO_ID}/photo_${Date.now()}.${ext}`;
          await supabase.storage
            .from('kyc-documents')
            .upload(registryPath, pendingPhotoFile, { upsert: true, contentType: pendingPhotoFile.type });
          await supabase.from('acc_portal_directors_documents').upsert({
            director_id: effectiveIndividualId,
            document_id: CLEAR_PHOTO_ID,
            file_path: registryPath,
            status: 'active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'director_id,file_path' });
          toast.success('Photo saved to client record and builder storage');
        } else {
          toast.success('Photo saved to builder storage');
        }
        setShowSavePhotoPrompt(false);
        setIndividualPhoto(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${builderPath}`);
      }
    } catch (err: any) {
      toast.error(`Failed to save photo: ${err.message}`);
    } finally {
      setIsSavingPhoto(false);
    }
  };

  const saveCVToDb = async () => {
    if (!selectedIndividual && !applicantId) return;
    setIsSavingCv(true);
    try {
      console.log('[CV Builder] saveCVToDb called:', { applicantId, selectedIndividual: selectedIndividual?.id, linkedIndividualId });
      const cvJson = JSON.stringify(cvData, null, 2);
      const blob = new Blob([cvJson], { type: 'application/json' });

      // Path A: Save to client's acc_portal_directors_documents (if selectedIndividual)
      if (selectedIndividual) {
        console.log('[CV Builder] Saving CV to client record:', selectedIndividual.id);
        const filePath = `individual-documents/${selectedIndividual.id}/${CV_DOCUMENT_ID}/cv_${Date.now()}.json`;
        const { error: uploadError } = await supabase.storage
          .from('kyc-documents')
          .upload(filePath, blob, { upsert: true, contentType: 'application/json' });
        if (uploadError) throw uploadError;
        await supabase.from('acc_portal_directors_documents').upsert({
          director_id: selectedIndividual.id,
          document_id: CV_DOCUMENT_ID,
          file_path: filePath,
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'director_id,file_path' });
      }

      // Path B: Save to cv-builder storage + update bcl_cv_snapshot (if applicantId)
      if (applicantId) {
        console.log('[CV Builder] Saving CV for applicantId:', applicantId);
        // 1. Store backup at cv-builder/{applicant_id}/built-cv.json
        const builderPath = `cv-builder/${applicantId}/built-cv.json`;
        const { error: uploadError } = await supabase.storage
          .from('kyc-documents')
          .upload(builderPath, blob, { upsert: true });
        if (uploadError) throw uploadError;

        // 2. Update bcl_cv_snapshot, bcl_cv_file_path, bcl_cv_extracted_details in job_applicant_cvs (include cvSettings and selectedLayout)
        console.log('[CV Builder] Updating bcl_cv_snapshot in job_applicant_cvs');
        const snapshotPayload = {
          ...cvData,
          cvSettings,
          selectedLayout,
        };
        const { error: snapshotError } = await supabase
          .from('job_applicant_cvs')
          .update({
            bcl_cv_snapshot: snapshotPayload,
            bcl_cv_file_path: builderPath,
            bcl_cv_extracted_details: cvData,
            updated_at: new Date().toISOString(),
          })
          .eq('applicant_id', applicantId);
        if (snapshotError) throw snapshotError;

        // 3. If linked client, also save to acc_portal_directors_documents
        if (linkedIndividualId) {
          console.log('[CV Builder] Also saving to linked individual record:', linkedIndividualId);
          const registryPath = `individual-documents/${linkedIndividualId}/${CV_DOCUMENT_ID}/cv_${Date.now()}.json`;
          await supabase.storage
            .from('kyc-documents')
            .upload(registryPath, blob, { upsert: true });
          await supabase.from('acc_portal_directors_documents').upsert({
            director_id: linkedIndividualId,
            document_id: CV_DOCUMENT_ID,
            file_path: registryPath,
            status: 'active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'director_id,file_path' });
        }
      }

      console.log('[CV Builder] CV saved successfully');
      toast.success(selectedIndividual ? 'CV saved to client record successfully' : 'BCL Vouched CV saved successfully');
      setShowSaveCvPrompt(false);
    } catch (err: any) {
      console.error('[CV Builder] Failed to save CV:', err);
      toast.error(`Failed to save CV: ${err.message}`);
    } finally {
      setIsSavingCv(false);
    }
  };

  const handleDownloadPdf = async () => {
    const element = previewRef.current;
    if (!element) return;

    setIsDownloadingPdf(true);
    toast.info("Opening print dialog — choose \"Save as PDF\" as the destination.");

    // The preview lives inside a scaled zoom wrapper, several flex/grid panels,
    // and an app shell that's h-screen + overflow-hidden. None of that supports
    // print pagination — a fixed/absolutely-positioned element, or one nested
    // inside an overflow-clipped ancestor, only prints its first page's worth
    // of content in Chrome. So instead of isolating it in place, we detach it
    // and re-append it as a direct child of <body> (see @media print in
    // globals.css) where it's in normal static flow and paginates correctly.
    const originalParent = element.parentElement;
    const originalNextSibling = element.nextSibling;
    const originalTitle = document.title;

    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      document.body.classList.remove("pdf-mode");
      if (originalParent) originalParent.insertBefore(element, originalNextSibling);
      document.title = originalTitle;
      window.removeEventListener("afterprint", cleanup);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      setIsDownloadingPdf(false);
    };

    try {
      // Wait for the chosen theme font (and any images already in the DOM) to finish
      // loading - otherwise Chrome can print with the fallback font, producing a
      // PDF that visibly doesn't match the on-screen preview.
      if (typeof document !== "undefined" && (document as any).fonts?.ready) {
        try { await (document as any).fonts.ready; } catch { /* ignore */ }
      }
      await Promise.all(
        Array.from(element.querySelectorAll("img")).map((img) =>
          (img as HTMLImageElement).complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                (img as HTMLImageElement).addEventListener("load", () => resolve(), { once: true });
                (img as HTMLImageElement).addEventListener("error", () => resolve(), { once: true });
              })
        )
      );

      // Chrome's "Save as PDF" suggests document.title as the filename.
      const age = cvData.personalDetails?.dateOfBirth
        ? (() => { const dob = cvData.personalDetails.dateOfBirth; const [d, m, y] = dob.includes('/') ? dob.split('/').map(Number) : [0, 0, Number(dob.split('-')[0])]; const birth = new Date(y, m ? m - 1 : 0, d || 1); return `${Math.floor((Date.now() - birth.getTime()) / (365.25 * 24 * 3600 * 1000))}`; })()
        : '';
      const rec = 'BCL';
      const prof = (cvData.personalInfo?.title || '').replace(/\s+/g, '_').slice(0, 30);
      const applicantName = (cvData.personalInfo.fullName || 'CV').replace(/\s+/g, '_');
      document.title = [applicantName, age, 'REF', rec, prof].filter(Boolean).join('_');

      document.body.appendChild(element);
      document.body.classList.add("pdf-mode");
      window.addEventListener("afterprint", cleanup, { once: true });
      // Safety net: some browsers don't reliably fire afterprint for
      // programmatic print() calls — don't leave the button stuck spinning.
      fallbackTimer = setTimeout(cleanup, 3 * 60 * 1000);

      // Give the browser a frame to apply the layout/style changes before printing.
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 50)));

      window.print();
    } catch (error: any) {
      console.error("PDF generation failed", error);
      cleanup();
      toast.error("PDF generation failed. Please try again.");
    }
  };

  const handleDownloadDocx = async () => {
    try {
      toast.info("Generating Word document...");
      await exportToDocx(
        cvData,
        {
          primaryColor: cvSettings.primaryColor,
          accentColor: cvSettings.accentColor,
          showPhoto: cvSettings.showPhoto,
        },
        selectedLayout
      );
      toast.success("Word document (.docx) generated successfully!");
    } catch (e: any) {
      console.error(e);
      toast.error("Failed to generate Word document.");
    }
  };


  if (workflowStep === 'client-portal') {
    return (
      <ClientPortalView
        clientEdits={clientEdits}
        setClientEdits={setClientEdits}
        portalConsentAccepted={portalConsentAccepted}
        portalConsentChecked={portalConsentChecked}
        setPortalConsentChecked={setPortalConsentChecked}
        onAcceptPortalConsent={handleAcceptPortalConsent}
        initiallyMissingSections={initiallyMissingSections}
        portalStep={portalStep}
        setPortalStep={setPortalStep}
        setWorkflowStep={setWorkflowStep}
        handleClientPersonalInfoChange={handleClientPersonalInfoChange}
        handleClientPersonalDetailsChange={handleClientPersonalDetailsChange}
        handleClientGapNoteChange={handleClientGapNoteChange}
        collabTargetCountry={collabTargetCountry}
        portalDraftId={portalDraftId}
        applicantId={applicantId}
        portalConsentTimestamp={portalConsentTimestamp}
        setClientSubmission={setClientSubmission}
        setHasClientSubmission={setHasClientSubmission}
      />
    );
  }

  // Show loading state until mounted (prevents hydration mismatch)
  if (!mounted) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-[#FAFAFC]">
        <div className="flex items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          <span className="text-lg text-slate-600">Loading CV Builder...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#FAFAFC]">
      {/* HEADER with workflow steps */}
      <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 shrink-0">
          <div className="h-9 w-9 rounded-lg bg-custom-blue flex items-center justify-center">
            <FileText className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 leading-tight">CV Builder</h1>
            <p className="text-sm text-slate-500">Import → Review → Collaborate</p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-full p-1">
          {([
            { key: 'import', label: 'Import' },
            { key: 'review-edit', label: 'Review & Edit' },
            { key: 'collaboration', label: 'Collaboration' },
          ] as const).map((step, i) => (
            <button
              key={step.key}
              onClick={() => setWorkflowStep(step.key)}
              className={`relative text-sm font-semibold px-3 py-1.5 rounded-full transition-all ${
                workflowStep === step.key
                  ? 'bg-custom-blue text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {i + 1}. {step.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            onClick={handleAiEnhanceCv}
            disabled={isEnhancingCv}
            className="text-xs h-8 gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-sm disabled:opacity-70"
          >
            {isEnhancingCv ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enhancing...</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5" /> AI Enhance</>
            )}
          </Button>
          {(selectedIndividual || applicantId) && (
            <Button size="sm" onClick={saveCVToDb} disabled={isSavingCv} className="text-xs h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
              {isSavingCv ? (
                <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving...</>
              ) : (
                <><Database className="h-3.5 w-3.5" /> {selectedIndividual ? 'Save to Client' : 'Save BCL CV'}</>
              )}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => { 
            if (hasSavedDraft && lastDraftName) {
              // Quick save with same name
              saveDraft(lastDraftName, false);
            } else {
              setDraftNameInput(`CV - ${cvData.personalInfo?.fullName || 'Draft'} - ${new Date().toLocaleDateString()}`); 
              setShowSaveDraftModal(true); 
              setSavingDraftForPortal(false);
            }
          }} className={`text-xs h-8 gap-1.5 border-slate-200 ${hasSavedDraft ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' : ''}`}>
            <Save className="h-3.5 w-3.5" /> {hasSavedDraft ? 'Update Draft' : 'Save Draft'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowSendCvModal(true)} className="text-xs h-8 gap-1.5 border-slate-200 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
            <MessageSquare className="h-3.5 w-3.5" /> Send CV
          </Button>
          <Button size="sm" variant="outline" onClick={handleDownloadDocx} className="text-xs h-8 gap-1.5 border-slate-200">
            <Download className="h-3.5 w-3.5" /> Word
          </Button>
          <Button size="sm" onClick={handleDownloadPdf} disabled={isDownloadingPdf} className="text-xs h-8 gap-1.5 bg-custom-blue hover:bg-[#2d5a94] text-white">
            {isDownloadingPdf ? (
              <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generating...</>
            ) : (
              <><Download className="h-3.5 w-3.5" /> PDF</>
            )}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowDesignPanel(p => !p)} className={`text-xs h-8 gap-1.5 border-slate-200 ${showDesignPanel ? 'bg-custom-blue text-white border-custom-blue' : ''}`}>
            <Palette className="h-3.5 w-3.5" /> Design
          </Button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* ─── STEP 1: IMPORT ─────────────────────────────────────────────── */}
        {workflowStep === 'import' && (
          <ImportStep
            isExtracting={isExtracting}
            extractionProgress={extractionProgress}
            handleFileUpload={handleFileUpload}
            individualSearch={individualSearch}
            handleIndividualSearchChange={handleIndividualSearchChange}
            isSearching={isSearching}
            searchResults={searchResults}
            handleSelectIndividual={handleSelectIndividual}
            selectedIndividual={selectedIndividual}
            setSelectedIndividual={setSelectedIndividual}
            setIndividualPhoto={setIndividualPhoto}
            setPendingPhotoPreview={setPendingPhotoPreview}
            setPendingPhotoFile={setPendingPhotoFile}
            setShowSavePhotoPrompt={setShowSavePhotoPrompt}
            setShowSaveCvPrompt={setShowSaveCvPrompt}
            applyIndividualToCV={applyIndividualToCV}
            setCvData={setCvData}
            setWorkflowStep={setWorkflowStep}
            setActiveSection={setActiveSection}
            showDraftsList={showDraftsList}
            setShowDraftsList={setShowDraftsList}
            cvDrafts={cvDrafts}
            loadDraft={loadDraft}
            deleteDraft={deleteDraft}
            cvData={cvData}
            cvSettings={cvSettings}
            selectedLayout={selectedLayout}
            previewRef={previewRef}
          />
        )}

        {/* ─── STEP 2: REVIEW & EDIT ──────────────────────────────────────── */}
        {workflowStep === 'review-edit' && (
          <ReviewEditStep
            sectionGroups={sectionGroups}
            sectionMeta={sectionMeta}
            collapsedGroups={collapsedGroups}
            setCollapsedGroups={setCollapsedGroups}
            activeSection={activeSection}
            setActiveSection={setActiveSection}
            setShowAiWriter={setShowAiWriter}
            setShowJobMatch={setShowJobMatch}
            setShowCoverLetter={setShowCoverLetter}
            setShowResumeVersions={setShowResumeVersions}
            setShowAdvancedExport={setShowAdvancedExport}
            setWorkflowStep={setWorkflowStep}
            cvData={cvData}
            setCvData={setCvData}
            applicantId={applicantId}
            linkedIndividualId={linkedIndividualId}
            collapsedItems={collapsedItems}
            toggleItem={toggleItem}
            companyOptions={companyOptions}
            handleCreateCompany={handleCreateCompany}
            selectedLayout={selectedLayout}
            setSelectedLayout={setSelectedLayout}
            cvSettings={cvSettings}
            previewRef={previewRef}
          />
        )}

        {/* ─── STEP 3: CLIENT COLLABORATION ─────────────────────────────── */}
        {workflowStep === 'collaboration' && (
          <CollaborationStep
            collabTargetCountry={collabTargetCountry}
            setCollabTargetCountry={setCollabTargetCountry}
            collabTargetRole={collabTargetRole}
            setCollabTargetRole={setCollabTargetRole}
            cvData={cvData}
            currentPortalDraftId={currentPortalDraftId}
            cvDrafts={cvDrafts}
            hasSavedDraft={hasSavedDraft}
            applicantId={applicantId}
            setDraftNameInput={setDraftNameInput}
            setSavingDraftForPortal={setSavingDraftForPortal}
            setShowSaveDraftModal={setShowSaveDraftModal}
            setWorkflowStep={setWorkflowStep}
            setClientSubmission={setClientSubmission}
            setHasClientSubmission={setHasClientSubmission}
            hasClientSubmission={hasClientSubmission}
            checkForClientSubmission={checkForClientSubmission}
            clientSubmission={clientSubmission}
            acceptedFields={acceptedFields}
            setAcceptedFields={setAcceptedFields}
            handleMergeUpdates={handleMergeUpdates}
          />
        )}

        <ModuleModals
          cvData={cvData}
          setCvData={setCvData}
          previewRef={previewRef}
          showAiWriter={showAiWriter}
          setShowAiWriter={setShowAiWriter}
          showJobMatch={showJobMatch}
          setShowJobMatch={setShowJobMatch}
          showCoverLetter={showCoverLetter}
          setShowCoverLetter={setShowCoverLetter}
          showResumeVersions={showResumeVersions}
          setShowResumeVersions={setShowResumeVersions}
          cvVersions={cvVersions}
          setCvVersions={setCvVersions}
          showAdvancedExport={showAdvancedExport}
          setShowAdvancedExport={setShowAdvancedExport}
        />

        <DesignPanel
          showDesignPanel={showDesignPanel}
          setShowDesignPanel={setShowDesignPanel}
          activeDesignTab={activeDesignTab}
          setActiveDesignTab={setActiveDesignTab}
          selectedLayout={selectedLayout}
          setSelectedLayout={setSelectedLayout}
          cvSettings={cvSettings}
          updateCvSetting={updateCvSetting}
        />

        <SaveDraftModal
          showSaveDraftModal={showSaveDraftModal}
          setShowSaveDraftModal={setShowSaveDraftModal}
          savingDraftForPortal={savingDraftForPortal}
          setSavingDraftForPortal={setSavingDraftForPortal}
          draftNameInput={draftNameInput}
          setDraftNameInput={setDraftNameInput}
          isSavingDraft={isSavingDraft}
          saveDraft={saveDraft}
        />

        <SendCvModal
          cvData={cvData}
          showSendCvModal={showSendCvModal}
          setShowSendCvModal={setShowSendCvModal}
          sendMethod={sendMethod}
          setSendMethod={setSendMethod}
          recommenderContactId={recommenderContactId}
          setRecommenderContactId={setRecommenderContactId}
          selectedRecommender={selectedRecommender}
          setSelectedRecommender={setSelectedRecommender}
          sendCvRecipients={sendCvRecipients}
          setSendCvRecipients={setSendCvRecipients}
          thirdParties={thirdParties}
          setThirdParties={setThirdParties}
          coverLetterText={coverLetterText}
          setCoverLetterText={setCoverLetterText}
        />

      </div>
    </div>
  );
}
