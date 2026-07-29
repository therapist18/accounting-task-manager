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
import AIWriterModule from "./components/AIWriterModule";
import ATSOptimizer from "./components/ATSOptimizer";
import JobMatch from "./components/JobMatch";
import CoverLetterGenerator from "./components/CoverLetter";
import ResumeVersions from "./components/ResumeVersions";
import ResumeAnalytics from "./components/ResumeAnalytics";
import AdvancedExport from "./components/AdvancedExport";
import { CreatableCombobox, type ComboOption } from "./components/CreatableCombobox";
import { RecommenderSelect, type Recommender } from "./components/RecommenderSelect";
import { CVLayout, COLOR_PRESETS, getVerifiedDateLabel } from "./components/cv-designs";

const PASSPORT_PHOTO_ID = '48f48255-e5db-4944-8864-6f35b3af4696';
const CLEAR_PHOTO_ID = 'fa74ff82-09ce-418d-8985-174158d73316';
const CV_DOCUMENT_ID = 'd615e776-7d32-4704-b510-62287d459fae';

const DEFAULT_DECLARATION_TEXT = "DECLARATION: I hereby declare that the above information is accurate to the best of my knowledge and reflects my professional qualifications, experience, and readiness for international employment opportunities.";

const EMPTY_CV_DATA = {
  personalInfo: {
    fullName: "",
    title: "",
    email: "",
    phone: "",
    location: "",
    github: "",
    linkedin: "",
    photoUrl: ""
  },
  personalDetails: {
    dateOfBirth: "",
    nationality: "",
    maritalStatus: "",
    residence: "",
    kenyaStatus: "",
    nairobiRes: "",
    drivingExperience: ""
  },
  summary: "",
  skills: [] as { category: string; items: string }[],
  experience: [] as any[],
  internships: [] as any[],
  projects: [] as any[],
  education: [] as any[],
  references: [] as any[],
  languages: [] as { language: string; proficiency: string }[],
  certifications: [] as { name: string; issuer: string; date: string; url: string }[],
  achievements: [] as { title: string; description: string; date: string }[],
  additionalInfo: [] as { label: string; value: string }[],
  declaration: DEFAULT_DECLARATION_TEXT,
  includeDeclaration: true,
  verifiedBadge: true
};

function mapSkillsFromExtractedDetails(ed: any): { category: string; items: string }[] {
  const rawSkills = ed?.['Skills'] || ed?.skills;
  if (!Array.isArray(rawSkills) || rawSkills.length === 0) return [];
  return rawSkills.map((s: any) => {
    // Handle format: {Skill: "...", Proficiency Level: "..."}
    if (s.Skill || s.skill) {
      return { category: "", items: s.Skill || s.skill || "" };
    }
    // Handle format: {category: "...", items: "..."}
    if (s.category !== undefined || s.items !== undefined) {
      return { category: s.category || "", items: Array.isArray(s.items) ? s.items.join(", ") : String(s.items || "") };
    }
    // Fallback: try to extract any string value
    const val = Object.values(s).find((v) => typeof v === 'string') || "";
    return { category: "", items: String(val) };
  });
}

function mapCertificationsFromExtractedDetails(ed: any, qualificationsText?: string | null): { name: string; issuer: string; date: string; url: string }[] {
  // Handle both array format (from extraction) and text format (from database qualifications column)
  const certsFromExtraction = ed?.['Professional Qualifications'] || ed?.certifications || ed?.['Certifications'];
  if (Array.isArray(certsFromExtraction) && certsFromExtraction.length > 0) {
    return certsFromExtraction.map((c: any) => {
      // Handle format: {Qualification: "..."}
      if (c.Qualification || c.qualification) {
        return { name: c.Qualification || c.qualification || "", issuer: "", date: "", url: "" };
      }
      // Handle format: {name: "...", issuer: "...", date: "...", url: "..."} 
      return {
        name: c.name || c.Name || "",
        issuer: c.issuer || c.Issuer || c.institution || "",
        date: c.date || c.Date || c.year || "",
        url: c.url || ""
      };
    });
  }
  // Fall back to text-based qualifications from database
  const text = qualificationsText || ed?.['Qualifications'] || ed?.qualifications || "";
  if (text && typeof text === 'string') {
    return text.split('\n').filter(Boolean).map((q: string) => ({ name: q.trim(), issuer: '', date: '', url: '' }));
  }
  return [];
}

function isSkillsBlank(skills: any[]): boolean {
  return !Array.isArray(skills) || skills.length === 0 || skills.every((s) => !s?.category && !s?.items);
}

function isCertificationsBlank(certs: any[]): boolean {
  return !Array.isArray(certs) || certs.length === 0 || certs.every((c) => !c?.name && !c?.issuer && !c?.date && !c?.url);
}

const COMMON_LANGUAGES = [
  'English', 'Swahili', 'French', 'Arabic', 'Mandarin', 'Spanish', 'Portuguese',
  'German', 'Italian', 'Dutch', 'Hindi', 'Urdu', 'Japanese', 'Korean', 'Russian',
  'Turkish', 'Polish', 'Swedish', 'Norwegian', 'Danish', 'Afrikaans', 'Zulu',
  'Amharic', 'Hausa', 'Yoruba', 'Igbo', 'Somali', 'Luganda', 'Kinyarwanda',
  'Shona', 'Oromo', 'Tigrinya', 'Lingala', 'Wolof'
];
const PROFICIENCY_LEVELS = ['Native', 'Fluent', 'Professional', 'Conversational', 'Basic'];

// Initial Ajay Yadav data for interactive demo and first-load preview
const initialCVData = {
  personalInfo: {
    fullName: "Ajay Yadav",
    title: "Software Engineer & Automation Specialist",
    email: "ajayyadav1998@gmail.com",
    phone: "+91-8949544021",
    location: "Jaipur, India",
    github: "github.com/ajayyadav1998",
    linkedin: "linkedin.com/in/ajay-yadav-643b76135/",
    photoUrl: ""
  },
  personalDetails: {
    dateOfBirth: "25/05/1998",
    nationality: "Indian",
    maritalStatus: "Married",
    residence: "Jaipur, India",
    kenyaStatus: "Willing to bear Special Work Permit expenses",
    nairobiRes: "Kileleshwa, Nairobi",
    drivingExperience: "9 Years Experience"
  },
  summary: "Results-driven Software Engineer, Advanced Automation Specialist, AI Workflow Integrator, and Business Owner with 6+ years of experience building enterprise-grade automation systems, browser automation frameworks, web scraping infrastructure, ETL pipelines, and business intelligence solutions across consulting, finance, recruitment, and operations sectors. Expert in Python, JavaScript, Playwright, Selenium, AI-powered productivity tools, cloud ecosystems, and process optimization.",
  skills: [
    {
      category: "Software & Programming",
      items: "Python, R, SQL, MariaDB, PostgreSQL, MySQL, JavaScript, TypeScript, PHP, HTML5, CSS3, JSON, XML, Regex"
    },
    {
      category: "Frameworks & Tools",
      items: "Streamlit, Dash, Flask, Next.js, React, Selenium, Playwright, Puppeteer, Scrapy, BeautifulSoup, Requests, Pandas, NumPy, Matplotlib, Plotly, Power BI, GitHub, Git, REST APIs"
    },
    {
      category: "AI & Productivity",
      items: "ChatGPT / OpenAI, Claude AI, Google Gemini, GitHub Copilot, Prompt Engineering, AI Workflow Automation, LLM-assisted Development"
    },
    {
      category: "Data & Cloud",
      items: "ETL Pipelines, AWS (EC2, Lambda, Load Balancers), Azure (ADF, Databricks), Linux/Microsoft Servers"
    }
  ],
  experience: [
    {
      company: "Velvet Furniture | India",
      location: "India",
      role: "Business Owner / Operations Manager",
      startDate: "Sept 2023",
      endDate: "Present",
      companyDesc: "High-end furniture solutions and event logistics operations based in India.",
      responsibilities: [
        "Founded and manage a furniture rental business serving weddings, private functions, and corporate events.",
        "Lead end-to-end business operations including inventory planning, transportation logistics, vendor partnerships, and customer service.",
        "Coordinate event execution, workforce scheduling, and financial oversight while ensuring customer satisfaction."
      ]
    },
    {
      company: "KreditBee | India",
      location: "India",
      role: "Software Engineer (Python)",
      startDate: "Feb 2022",
      endDate: "May 2022",
      companyDesc: "A leading fintech platform that offers loans in varying ticket sizes and repayment tenures.",
      responsibilities: [
        "Built Python automation tools for financial data processing, reporting, and operational efficiency.",
        "Improved reporting speed and reduced repetitive manual workloads through workflow automation.",
        "Enhanced data integrity and accuracy for financial operations."
      ]
    },
    {
      company: "BookSmart Consultancy Ltd.",
      location: "Nairobi, Kenya",
      role: "Senior Web Automation Engineer (Part-time)",
      startDate: "Jan 2021",
      endDate: "Present",
      companyDesc: "A premier professional accounting and business consultancy firm operating in Nairobi, Kenya.",
      responsibilities: [
        "Designed and deployed advanced browser automation systems using Python, JavaScript, Selenium, Playwright, and AI-assisted workflows.",
        "Automated accounting, immigration, compliance, and administrative business processes, significantly reducing manual operational workload.",
        "Built scalable data extraction systems for regulatory portals, financial platforms, and business intelligence solutions."
      ]
    }
  ],
  internships: [
    {
      company: "Grass Solution Pvt. Ltd.",
      location: "Jaipur, India",
      role: "Intern - Python & Data Science",
      startDate: "Aug 2018",
      endDate: "Jan 2019",
      companyDesc: "A specialized IT training institute and software solutions provider.",
      responsibilities: [
        "Trained in Python, Data Science, and System Administration. Developed foundational automation and analytics projects."
      ]
    }
  ],
  projects: [
    {
      title: "Trustpilot Review Analysis",
      description: "Built machine learning pipelines for customer review sentiment analysis. Tested multiple ML algorithms for predictive insights.",
      year: "2025"
    },
    {
      title: "Ontario Disease Data Dashboard",
      description: "Developed Streamlit dashboard integrating public health datasets with filtering, visualization, and downloadable reports.",
      year: "2024"
    }
  ],
  education: [
    {
      degree: "Bachelor of Computer Applications (B.C.A)",
      institution: "S.S Jain Subodh PG College",
      year: "2019",
      details: "Red Hat Certification of Participation (2019) • Python & R Language with Data Science Certification"
    }
  ],
  references: [
    {
      name: "Sandip Patel",
      title: "Director",
      company: "BookSmart Consultancy Ltd.",
      address: "Parksuits, Parklands, Nairobi, Kenya",
      contact: "+254 700 298298 | info@booksmartconsult.com"
    }
  ],
  languages: [
    { language: "English", proficiency: "Professional" },
    { language: "Hindi", proficiency: "Native" }
  ],
  certifications: [
    { name: "Certified Python Developer", issuer: "Python Institute", date: "2023", url: "" },
  ],
  achievements: [
    { title: "Employee of the Month", description: "Recognized for outstanding performance and automation contributions", date: "2024" },
  ],
  additionalInfo: [
    { label: "Availability", value: "Immediate" },
  ],
  declaration: DEFAULT_DECLARATION_TEXT,
  includeDeclaration: true,
  verifiedBadge: true
};

type EnhancementLevel = "none" | "light" | "professional" | "executive";

const ENHANCEMENT_OPTIONS: { value: EnhancementLevel; label: string; description: string }[] = [
  { value: "none",         label: "None",         description: "Extract content exactly as written" },
  { value: "light",        label: "Light Polish",  description: "Fix grammar & spelling only" },
  { value: "professional", label: "Professional",  description: "Action verbs, cleaner phrasing, no invented details" },
  { value: "executive",    label: "Executive",     description: "Strategic language, leadership framing, impact-focused" },
];

const CONSENT_VERSION = 'v1-2026-07-01';

const PRIVACY_NOTICE = {
  intro: "Before you continue, please review how BookSmart Consultancy Ltd. will use the information you provide below.",
  points: [
    { title: 'What we collect', body: 'Your contact details, work history, education, a professional photo, and other career-related information you choose to share — including personal details such as date of birth, nationality, and work-permit status where relevant to a role.' },
    { title: 'Why we collect it', body: 'Solely to prepare, verify, and present your CV to prospective employers and to support your job placement process.' },
    { title: 'Who we share it with', body: 'BookSmart Consultancy staff handling your application, the prospective employer/client you are being placed with, and any named referee/recommender whose details you provide. We do not sell your data or use it for unrelated marketing.' },
    { title: 'How long we keep it', body: 'For as long as your application is active, and for a reasonable period afterwards in case you are considered for future roles, unless you ask us to delete it sooner.' },
    { title: 'Your rights', body: 'You can ask to see, correct, or delete the information we hold about you at any time by contacting info@booksmartconsult.com.' },
  ],
};

const LS_PREFIX = 'cv_generator_';

function loadFromLocalStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(LS_PREFIX + key);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return fallback;
}

function saveToLocalStorage(key: string, value: any) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch { /* ignore */ }
}

const analyzeCVCompleteness = (data: any) => {
  if (!data) return { completionPercent: 0, checklist: [], gaps: [] };
  const checklist = [];
  let filledWeight = 0;
  let totalWeight = 0;

  // Contact Info (20 pts)
  totalWeight += 20;
  const contactKeys = ['fullName', 'email', 'phone', 'location'];
  const contactFilled = contactKeys.filter(k => !!data.personalInfo?.[k]).length;
  filledWeight += (contactFilled / contactKeys.length) * 20;
  checklist.push({
    id: 'contact',
    label: 'Contact Information',
    status: contactFilled === contactKeys.length ? 'success' : 'warning',
    missing: contactFilled < contactKeys.length,
    missingItems: contactKeys.filter(k => !data.personalInfo?.[k]).map(k => k === 'fullName' ? 'Full Name' : k.charAt(0).toUpperCase() + k.slice(1)),
    score: Math.round((contactFilled / contactKeys.length) * 105)
  });

  // LinkedIn & Portfolio (10 pts)
  totalWeight += 10;
  const hasLinkedin = !!data.personalInfo?.linkedin;
  const hasPortfolio = !!data.personalInfo?.github || !!data.personalInfo?.portfolio;
  let socialScore = 0;
  if (hasLinkedin) socialScore += 5;
  if (hasPortfolio) socialScore += 5;
  filledWeight += socialScore;
  checklist.push({
    id: 'socials',
    label: 'Social Profiles (LinkedIn/Portfolio)',
    status: hasLinkedin && hasPortfolio ? 'success' : 'warning',
    missing: !hasLinkedin || !hasPortfolio,
    missingItems: [!hasLinkedin && 'LinkedIn', !hasPortfolio && 'Portfolio/GitHub'].filter(Boolean) as string[],
    score: socialScore * 10
  });

  // Summary (15 pts)
  totalWeight += 15;
  const hasSummary = !!data.summary && data.summary.trim().length > 10;
  if (hasSummary) filledWeight += 15;
  checklist.push({
    id: 'summary',
    label: 'Professional Summary',
    status: hasSummary ? 'success' : 'danger',
    missing: !hasSummary,
    missingItems: !hasSummary ? ['Professional Summary'] : [],
    score: hasSummary ? 100 : 0
  });

  // Experience (20 pts)
  totalWeight += 20;
  const hasExperience = data.experience && data.experience.length > 0;
  if (hasExperience) filledWeight += 20;
  checklist.push({
    id: 'experience',
    label: 'Work Experience',
    status: hasExperience ? 'success' : 'danger',
    missing: !hasExperience,
    missingItems: !hasExperience ? ['Work Experience'] : [],
    score: hasExperience ? 100 : 0
  });

  // Skills (15 pts)
  totalWeight += 15;
  const hasSkills = data.skills && data.skills.length > 0;
  if (hasSkills) filledWeight += 15;
  checklist.push({
    id: 'skills',
    label: 'Skills & Competencies',
    status: hasSkills ? 'success' : 'danger',
    missing: !hasSkills,
    missingItems: !hasSkills ? ['Skills'] : [],
    score: hasSkills ? 100 : 0
  });

  // Education (10 pts)
  totalWeight += 10;
  const hasEducation = data.education && data.education.length > 0;
  if (hasEducation) filledWeight += 10;
  checklist.push({
    id: 'education',
    label: 'Education',
    status: hasEducation ? 'success' : 'warning',
    missing: !hasEducation,
    missingItems: !hasEducation ? ['Education'] : [],
    score: hasEducation ? 100 : 0
  });

  // Certifications & Languages & Achievements (10 pts)
  totalWeight += 10;
  let addScore = 0;
  const hasCerts = data.certifications && data.certifications.length > 0;
  const hasLangs = data.languages && data.languages.length > 0;
  const hasAchievements = data.achievements && data.achievements.length > 0;
  if (hasCerts) addScore += 3.3;
  if (hasLangs) addScore += 3.3;
  if (hasAchievements) addScore += 3.4;
  filledWeight += addScore;
  checklist.push({
    id: 'additional',
    label: 'Certifications, Languages & Achievements',
    status: hasCerts && hasLangs && hasAchievements ? 'success' : 'warning',
    missing: !hasCerts || !hasLangs || !hasAchievements,
    missingItems: [!hasCerts && 'Certifications', !hasLangs && 'Languages', !hasAchievements && 'Achievements'].filter(Boolean) as string[],
    score: Math.round((addScore / 10) * 100)
  });

  const completionPercent = Math.min(100, Math.round((filledWeight / totalWeight) * 100));

  // Gap detection
  const gaps = [];
  if (data.experience && data.experience.length > 1) {
    const parseYear = (dateStr: string) => {
      if (!dateStr) return null;
      const match = dateStr.match(/\b(20\d{2}|19\d{2})\b/);
      return match ? parseInt(match[0]) : null;
    };
    
    const expWithYears = data.experience.map((e: any, index: number) => ({
      index,
      company: e.company,
      role: e.role,
      startDateStr: e.startDate,
      endDateStr: e.endDate,
      startYear: parseYear(e.startDate),
      endYear: e.endDate?.toLowerCase().includes('present') ? new Date().getFullYear() : parseYear(e.endDate)
    })).filter((e: any) => e.startYear !== null && e.endYear !== null);

    expWithYears.sort((a: any, b: any) => b.startYear - a.startYear);

    for (let i = 0; i < expWithYears.length - 1; i++) {
      const current = expWithYears[i];
      const prev = expWithYears[i + 1];
      if (prev.endYear && current.startYear && (current.startYear - prev.endYear) > 1) {
        gaps.push({
          from: prev.endYear,
          to: current.startYear,
          prevCompany: prev.company || 'Previous Employer',
          currCompany: current.company || 'Next Employer',
          gapYears: current.startYear - prev.endYear
        });
      }
    }
  }

  return {
    completionPercent,
    checklist,
    gaps
  };
};

const getCVDiffs = (oldData: any, newData: any) => {
  if (!oldData || !newData) return [];
  const diffs: any[] = [];

  // Compare personalInfo
  const infoKeys = [
    { key: 'fullName', label: 'Full Name' },
    { key: 'title', label: 'Professional Title' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'location', label: 'Location' },
    { key: 'github', label: 'GitHub' },
    { key: 'linkedin', label: 'LinkedIn' }
  ];
  infoKeys.forEach(k => {
    const oldVal = oldData.personalInfo?.[k.key];
    const newVal = newData.personalInfo?.[k.key];
    if (String(oldVal || '').trim() !== String(newVal || '').trim()) {
      diffs.push({
        path: `personalInfo.${k.key}`,
        label: `Contact: ${k.label}`,
        oldVal: oldVal || 'Missing',
        newVal: newVal || 'Removed/Empty',
        category: 'Contact Info'
      });
    }
  });

  // Compare personalDetails
  const detailKeys = [
    { key: 'dateOfBirth', label: 'Date of Birth' },
    { key: 'nationality', label: 'Nationality' },
    { key: 'maritalStatus', label: 'Marital Status' },
    { key: 'residence', label: 'Current Residence' },
    { key: 'kenyaStatus', label: 'Kenya Permit Status' },
    { key: 'nairobiRes', label: 'Nairobi Neighborhood' },
    { key: 'drivingExperience', label: 'Driving Experience' }
  ];
  detailKeys.forEach(k => {
    const oldVal = oldData.personalDetails?.[k.key];
    const newVal = newData.personalDetails?.[k.key];
    if (String(oldVal || '').trim() !== String(newVal || '').trim()) {
      diffs.push({
        path: `personalDetails.${k.key}`,
        label: `Personal Details: ${k.label}`,
        oldVal: oldVal || 'Missing',
        newVal: newVal || 'Removed/Empty',
        category: 'Personal Details'
      });
    }
  });

  // Compare summary
  if (String(oldData.summary || '').trim() !== String(newData.summary || '').trim()) {
    diffs.push({
      path: 'summary',
      label: 'Professional Summary',
      oldVal: oldData.summary || 'Missing',
      newVal: newData.summary || 'Removed/Empty',
      category: 'Summary'
    });
  }

  // Compare skills
  const oldSkillsStr = (oldData.skills || []).map((s: any) => `${s.category}: ${s.items}`).join('\n');
  const newSkillsStr = (newData.skills || []).map((s: any) => `${s.category}: ${s.items}`).join('\n');
  if (oldSkillsStr !== newSkillsStr) {
    diffs.push({
      path: 'skills',
      label: 'Skills & Competencies',
      oldVal: oldSkillsStr || 'No skills',
      newVal: newSkillsStr || 'No skills',
      category: 'Skills'
    });
  }

  // Compare experience
  const oldExpStr = (oldData.experience || []).map((e: any) => `${e.company} (${e.role}): ${e.startDate}-${e.endDate}`).join('\n');
  const newExpStr = (newData.experience || []).map((e: any) => `${e.company} (${e.role}): ${e.startDate}-${e.endDate}`).join('\n');
  if (oldExpStr !== newExpStr) {
    diffs.push({
      path: 'experience',
      label: 'Work Experience',
      oldVal: oldExpStr || 'No experience',
      newVal: newExpStr || 'No experience',
      category: 'Experience'
    });
  }

  // Compare education
  const oldEduStr = (oldData.education || []).map((e: any) => `${e.degree} at ${e.institution} (${e.year})`).join('\n');
  const newEduStr = (newData.education || []).map((e: any) => `${e.degree} at ${e.institution} (${e.year})`).join('\n');
  if (oldEduStr !== newEduStr) {
    diffs.push({
      path: 'education',
      label: 'Education',
      oldVal: oldEduStr || 'No education',
      newVal: newEduStr || 'No education',
      category: 'Education'
    });
  }

  // Compare languages
  const oldLangsStr = (oldData.languages || []).map((l: any) => `${l.language} (${l.proficiency})`).join(', ');
  const newLangsStr = (newData.languages || []).map((l: any) => `${l.language} (${l.proficiency})`).join(', ');
  if (oldLangsStr !== newLangsStr) {
    diffs.push({
      path: 'languages',
      label: 'Languages',
      oldVal: oldLangsStr || 'No languages',
      newVal: newLangsStr || 'No languages',
      category: 'Languages'
    });
  }

  // Compare certifications
  const oldCertsStr = (oldData.certifications || []).map((c: any) => `${c.name} (${c.issuer})`).join(', ');
  const newCertsStr = (newData.certifications || []).map((c: any) => `${c.name} (${c.issuer})`).join(', ');
  if (oldCertsStr !== newCertsStr) {
    diffs.push({
      path: 'certifications',
      label: 'Certifications',
      oldVal: oldCertsStr || 'No certifications',
      newVal: newCertsStr || 'No certifications',
      category: 'Certifications'
    });
  }

  // Compare achievements
  const oldAchStr = (oldData.achievements || []).map((a: any) => `${a.title}: ${a.description}`).join('\n');
  const newAchStr = (newData.achievements || []).map((a: any) => `${a.title}: ${a.description}`).join('\n');
  if (oldAchStr !== newAchStr) {
    diffs.push({
      path: 'achievements',
      label: 'Achievements',
      oldVal: oldAchStr || 'No achievements',
      newVal: newAchStr || 'No achievements',
      category: 'Achievements'
    });
  }

  // Compare additionalInfo
  const oldAddStr = (oldData.additionalInfo || []).map((i: any) => `${i.label}: ${i.value}`).join(', ');
  const newAddStr = (newData.additionalInfo || []).map((i: any) => `${i.label}: ${i.value}`).join(', ');
  if (oldAddStr !== newAddStr) {
    diffs.push({
      path: 'additionalInfo',
      label: 'Additional Information',
      oldVal: oldAddStr || 'No additional info',
      newVal: newAddStr || 'No additional info',
      category: 'Additional Info'
    });
  }

  return diffs;
};

const isJustYear = (dateStr: string): boolean => {
  if (!dateStr) return false;
  const trimmed = dateStr.trim();
  return /^(19|20)\d{2}$/.test(trimmed);
};

export default function CVGeneratorPage() {
  const [cvData, setCvData] = useState<any>(initialCVData);
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit');
  const [selectedLayout, setSelectedLayout] = useState<string>("theme1");
  const [zoomLevel, setZoomLevel] = useState<number>(0.75);
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
  const [showAtsOptimizer, setShowAtsOptimizer] = useState(false);
  const [showJobMatch, setShowJobMatch] = useState(false);
  const [showCoverLetter, setShowCoverLetter] = useState(false);
  const [showResumeVersions, setShowResumeVersions] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showAdvancedExport, setShowAdvancedExport] = useState(false);
  const [cvVersions, setCvVersions] = useState<{ id: string; name: string; data: any; createdAt: string }[]>([]);
  const [activeDesignTab, setActiveDesignTab] = useState('theme');

  // Load from localStorage after mount to avoid hydration mismatch
  useEffect(() => {
    const savedCvData = loadFromLocalStorage('cvData', initialCVData);
    const savedLayout = loadFromLocalStorage('selectedLayout', 'theme1');
    const savedZoom = loadFromLocalStorage('zoomLevel', 0.75);
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
    setZoomLevel(savedZoom);
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
      saveToLocalStorage('zoomLevel', zoomLevel);
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
  }, [cvData, cvSettings, selectedLayout, collapsedGroups, cvVersions, zoomLevel, collabTargetCountry, collabTargetRole, hasClientSubmission, clientSubmission, cvDrafts, currentPortalDraftId, hasSavedDraft, lastDraftName]);

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
              declaration: ed['Declaration'] || ed.declaration || DEFAULT_DECLARATION_TEXT,
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
          declaration: prefill.declaration || DEFAULT_DECLARATION_TEXT,
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

  const handlePersonalInfoChange = (field: string, value: any) => {
    setCvData((prev: any) => ({
      ...prev,
      personalInfo: { ...prev.personalInfo, [field]: value }
    }));
  };

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

  const handlePersonalDetailsChange = (field: string, value: any) => {
    setCvData((prev: any) => ({
      ...prev,
      personalDetails: { ...prev.personalDetails, [field]: value }
    }));
  };

  const addSkillGroup = () => {
    setCvData((prev: any) => ({
      ...prev,
      skills: [...prev.skills, { category: "", items: "" }]
    }));
  };

  const handleSkillGroupChange = (index: number, field: string, value: any) => {
    const updated = [...cvData.skills];
    updated[index] = { ...updated[index], [field]: value };
    setCvData((prev: any) => ({ ...prev, skills: updated }));
  };

  const removeSkillGroup = (index: number) => {
    setCvData((prev: any) => ({
      ...prev,
      skills: prev.skills.filter((_: any, i: number) => i !== index)
    }));
  };

  const addExperience = () => {
    setCvData((prev: any) => ({
      ...prev,
      experience: [
        ...prev.experience,
        { company: "", location: "", role: "", startDate: "", endDate: "", companyDesc: "", responsibilities: [""] }
      ]
    }));
  };

  const handleExperienceChange = (index: number, field: string, value: any) => {
    const updated = [...cvData.experience];
    updated[index] = { ...updated[index], [field]: value };
    setCvData((prev: any) => ({ ...prev, experience: updated }));
  };

  const addRespToExperience = (expIndex: number) => {
    const updated = [...cvData.experience];
    updated[expIndex].responsibilities = [...updated[expIndex].responsibilities, ""];
    setCvData((prev: any) => ({ ...prev, experience: updated }));
  };

  const handleRespChangeInExperience = (expIndex: number, respIndex: number, value: string) => {
    const updated = [...cvData.experience];
    updated[expIndex].responsibilities[respIndex] = value;
    setCvData((prev: any) => ({ ...prev, experience: updated }));
  };

  const removeRespFromExperience = (expIndex: number, respIndex: number) => {
    const updated = [...cvData.experience];
    updated[expIndex].responsibilities = updated[expIndex].responsibilities.filter((_: any, i: number) => i !== respIndex);
    setCvData((prev: any) => ({ ...prev, experience: updated }));
  };

  const removeExperience = (index: number) => {
    setCvData((prev: any) => ({
      ...prev,
      experience: prev.experience.filter((_: any, i: number) => i !== index)
    }));
  };

  const addInternship = () => {
    setCvData((prev: any) => ({
      ...prev,
      internships: [
        ...prev.internships,
        { company: "", location: "", role: "", startDate: "", endDate: "", companyDesc: "", responsibilities: [""] }
      ]
    }));
  };

  const handleInternshipChange = (index: number, field: string, value: any) => {
    const updated = [...cvData.internships];
    updated[index] = { ...updated[index], [field]: value };
    setCvData((prev: any) => ({ ...prev, internships: updated }));
  };

  const addRespToInternship = (internIndex: number) => {
    const updated = [...cvData.internships];
    updated[internIndex].responsibilities = [...updated[internIndex].responsibilities, ""];
    setCvData((prev: any) => ({ ...prev, internships: updated }));
  };

  const handleRespChangeInInternship = (internIndex: number, respIndex: number, value: string) => {
    const updated = [...cvData.internships];
    updated[internIndex].responsibilities[respIndex] = value;
    setCvData((prev: any) => ({ ...prev, internships: updated }));
  };

  const removeRespFromInternship = (internIndex: number, respIndex: number) => {
    const updated = [...cvData.internships];
    updated[internIndex].responsibilities = updated[internIndex].responsibilities.filter((_: any, i: number) => i !== respIndex);
    setCvData((prev: any) => ({ ...prev, internships: updated }));
  };

  const removeInternship = (index: number) => {
    setCvData((prev: any) => ({
      ...prev,
      internships: prev.internships.filter((_: any, i: number) => i !== index)
    }));
  };

  const addProject = () => {
    setCvData((prev: any) => ({
      ...prev,
      projects: [...prev.projects, { title: "", description: "", year: "" }]
    }));
  };

  const handleProjectChange = (index: number, field: string, value: any) => {
    const updated = [...cvData.projects];
    updated[index] = { ...updated[index], [field]: value };
    setCvData((prev: any) => ({ ...prev, projects: updated }));
  };

  const removeProject = (index: number) => {
    setCvData((prev: any) => ({
      ...prev,
      projects: prev.projects.filter((_: any, i: number) => i !== index)
    }));
  };

  const addEducation = () => {
    setCvData((prev: any) => ({
      ...prev,
      education: [...prev.education, { degree: "", institution: "", year: "", details: "" }]
    }));
  };

  const handleEducationChange = (index: number, field: string, value: any) => {
    const updated = [...cvData.education];
    updated[index] = { ...updated[index], [field]: value };
    setCvData((prev: any) => ({ ...prev, education: updated }));
  };

  const removeEducation = (index: number) => {
    setCvData((prev: any) => ({
      ...prev,
      education: prev.education.filter((_: any, i: number) => i !== index)
    }));
  };

  const addReference = () => {
    setCvData((prev: any) => ({
      ...prev,
      references: [...prev.references, { name: "", title: "", company: "", address: "", contact: "" }]
    }));
  };

  const handleReferenceChange = (index: number, field: string, value: any) => {
    const updated = [...cvData.references];
    updated[index] = { ...updated[index], [field]: value };
    setCvData((prev: any) => ({ ...prev, references: updated }));
  };

  const removeReference = (index: number) => {
    setCvData((prev: any) => ({
      ...prev,
      references: prev.references.filter((_: any, i: number) => i !== index)
    }));
  };

  const addLanguage = () => {
    setCvData((prev: any) => ({
      ...prev,
      languages: [...prev.languages, { language: "", proficiency: "" }]
    }));
  };

  const handleLanguageChange = (index: number, field: string, value: any) => {
    const updated = [...cvData.languages];
    updated[index] = { ...updated[index], [field]: value };
    setCvData((prev: any) => ({ ...prev, languages: updated }));
  };

  // Certifications handlers
  const addCertification = () => {
    setCvData((prev: any) => ({
      ...prev,
      certifications: [...(prev.certifications || []), { name: "", issuer: "", date: "", url: "" }]
    }));
  };
  const handleCertificationChange = (index: number, field: string, value: any) => {
    const updated = [...(cvData.certifications || [])];
    updated[index] = { ...updated[index], [field]: value };
    setCvData((prev: any) => ({ ...prev, certifications: updated }));
  };
  const removeCertification = (index: number) => {
    setCvData((prev: any) => ({
      ...prev,
      certifications: (prev.certifications || []).filter((_: any, i: number) => i !== index)
    }));
  };

  // Achievements handlers
  const addAchievement = () => {
    setCvData((prev: any) => ({
      ...prev,
      achievements: [...(prev.achievements || []), { title: "", description: "", date: "" }]
    }));
  };
  const handleAchievementChange = (index: number, field: string, value: any) => {
    const updated = [...(cvData.achievements || [])];
    updated[index] = { ...updated[index], [field]: value };
    setCvData((prev: any) => ({ ...prev, achievements: updated }));
  };
  const removeAchievement = (index: number) => {
    setCvData((prev: any) => ({
      ...prev,
      achievements: (prev.achievements || []).filter((_: any, i: number) => i !== index)
    }));
  };

  // Additional Info handlers
  const addAdditionalInfo = () => {
    setCvData((prev: any) => ({
      ...prev,
      additionalInfo: [...(prev.additionalInfo || []), { label: "", value: "" }]
    }));
  };
  const handleAdditionalInfoChange = (index: number, field: string, value: any) => {
    const updated = [...(cvData.additionalInfo || [])];
    updated[index] = { ...updated[index], [field]: value };
    setCvData((prev: any) => ({ ...prev, additionalInfo: updated }));
  };
  const removeAdditionalInfo = (index: number) => {
    setCvData((prev: any) => ({
      ...prev,
      additionalInfo: (prev.additionalInfo || []).filter((_: any, i: number) => i !== index)
    }));
  };

  const removeLanguage = (index: number) => {
    setCvData((prev: any) => ({
      ...prev,
      languages: prev.languages.filter((_: any, i: number) => i !== index)
    }));
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
    toast.info("Generating professional PDF...");

    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");

      // The preview is wrapped in a zoom container (`transform: scale(zoomLevel)`).
      // That transform doesn't affect layout metrics (scrollWidth/scrollHeight), so if it's
      // left in place html2canvas paints at the zoomed-out size while we force it to render
      // into the full unscaled dimensions below — the mismatch is what squishes/overlaps the text.
      const zoomWrapper = element.parentElement;
      const originalWrapperTransform = zoomWrapper?.style.transform;

      // Store original styles
      const originalTransform = element.style.transform;
      const originalWidth = element.style.width;
      const originalMinHeight = element.style.minHeight;
      const originalOverflow = element.style.overflow;

      // Reset transform for accurate capture
      if (zoomWrapper) zoomWrapper.style.transform = "none";
      element.style.transform = "none";
      element.style.width = "210mm";
      element.style.overflow = "visible";
      
      // Add pdf-mode class to hide UI elements
      document.body.classList.add("pdf-mode");

      // Wait for the chosen theme font (and any images already in the DOM) to finish
      // loading - otherwise html2canvas can paint with the fallback font, producing a
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

      // Wait for layout to settle
      await new Promise(resolve => setTimeout(resolve, 200));

      // Get actual content dimensions
      const contentWidth = element.scrollWidth;
      const contentHeight = element.scrollHeight;
      
      // Calculate A4 dimensions at 96dpi
      const A4_WIDTH_MM = 210;
      const A4_HEIGHT_MM = 297;
      const MM_TO_PX = 96 / 25.4; // 96dpi / 25.4mm per inch
      const A4_HEIGHT_PX = Math.floor(A4_HEIGHT_MM * MM_TO_PX);
      
      // Set minimum height for proper capture
      const pages = Math.ceil(contentHeight / A4_HEIGHT_PX);
      element.style.minHeight = `${pages * A4_HEIGHT_PX}px`;
      
      // Wait for resize
      await new Promise(resolve => setTimeout(resolve, 100));

      // Capture with high quality settings
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        scrollX: 0,
        scrollY: 0,
        width: contentWidth,
        height: Math.max(contentHeight, A4_HEIGHT_PX),
        windowWidth: contentWidth,
        windowHeight: Math.max(contentHeight, A4_HEIGHT_PX),
        onclone: (clonedDoc) => {
          // Ensure the cloned element has proper dimensions
          const clonedElement = clonedDoc.getElementById('cv-preview-container');
          if (clonedElement) {
            clonedElement.style.width = '210mm';
            clonedElement.style.minHeight = `${pages * A4_HEIGHT_PX}px`;
            clonedElement.style.overflow = 'visible';
            clonedElement.style.transform = 'none';
          }
        }
      });
      
      // Restore original styles
      if (zoomWrapper) zoomWrapper.style.transform = originalWrapperTransform ?? "";
      element.style.transform = originalTransform;
      element.style.width = originalWidth;
      element.style.minHeight = originalMinHeight;
      element.style.overflow = originalOverflow;
      document.body.classList.remove("pdf-mode");

      // Create PDF
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      
      // Calculate image dimensions to fit A4 width
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const imgWidth = pageWidth;
      const imgHeight = (canvasHeight * pageWidth) / canvasWidth;
      
      // Calculate number of pages needed
      const totalPages = Math.ceil(imgHeight / pageHeight);
      
      // Add pages with proper slicing
      for (let i = 0; i < totalPages; i++) {
        if (i > 0) {
          pdf.addPage();
        }
        
        // Calculate position for this page slice
        const position = -(i * pageHeight);
        
        // Add the image slice for this page
        pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      }

      // Generate filename
      const age = cvData.personalDetails?.dateOfBirth
        ? (() => { const dob = cvData.personalDetails.dateOfBirth; const [d, m, y] = dob.includes('/') ? dob.split('/').map(Number) : [0, 0, Number(dob.split('-')[0])]; const birth = new Date(y, m ? m - 1 : 0, d || 1); return `${Math.floor((Date.now() - birth.getTime()) / (365.25 * 24 * 3600 * 1000))}`; })()
        : '';
      const rec = 'BCL';
      const prof = (cvData.personalInfo?.title || '').replace(/\s+/g, '_').slice(0, 30);
      const applicantName = (cvData.personalInfo.fullName || 'CV').replace(/\s+/g, '_');
      const fileName = [applicantName, age, 'REF', rec, prof].filter(Boolean).join('_') + '.pdf';
      
      pdf.save(fileName);
      toast.success("PDF downloaded successfully!");
    } catch (error: any) {
      console.error("PDF generation failed", error);
      // Ensure pdf-mode and inline capture styles are removed on error
      document.body.classList.remove("pdf-mode");
      if (element.parentElement) element.parentElement.style.transform = `scale(${zoomLevel})`;
      element.style.transform = "";
      element.style.width = "";
      element.style.minHeight = "";
      element.style.overflow = "";
      toast.error("PDF generation failed. Please try again.");
    } finally {
      setIsDownloadingPdf(false);
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


  const renderClientPortal = () => {
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
                onClick={handleAcceptPortalConsent}
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
        <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-custom-blue flex items-center justify-center">
              <FileText className="h-4 w-4 text-white" />
            </div>
            <div className="text-left">
              <h1 className="text-sm font-bold text-slate-900">AI Client Review Portal</h1>
              <p className="text-sm text-slate-500">Collaboration &amp; Verification</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm bg-blue-50 text-custom-blue border border-blue-100 px-2 py-0.5 rounded-full font-semibold">Verification Active</span>
            <Button size="sm" variant="outline" onClick={() => { setWorkflowStep('collaboration'); setClientEdits(null); }} className="text-xs border-slate-200 text-slate-650 h-8">
              Exit to Recruiter View
            </Button>
          </div>
        </div>

        {/* Subtitle bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-2 shrink-0">
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
                    <div className="flex items-center gap-3">
                      {clientEdits.personalInfo?.photoUrl && <img src={clientEdits.personalInfo.photoUrl} className="h-14 w-14 rounded-lg object-cover border border-slate-200" alt="Preview" />}
                      <Input type="file" accept="image/*" className="text-xs h-9 bg-white" onChange={(e) => {
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
                          <div className="grid grid-cols-2 gap-3">
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
                    <div className="grid grid-cols-2 gap-3">
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
                    <div className="grid grid-cols-3 gap-2">
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
                    <div className="grid grid-cols-2 gap-3">
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

                {/* ── Languages ── */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Globe className="h-4 w-4 text-slate-500" /> Languages Spoken</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {['English', 'Swahili', 'French', 'German', 'Hindi', 'Arabic'].map(lang => {
                      const isChecked = (clientEdits.languages || []).some((l: any) => l.language === lang);
                      return (
                        <label key={lang} className="flex items-center gap-2 text-xs font-semibold cursor-pointer text-slate-700">
                          <Checkbox checked={isChecked} onCheckedChange={(checked) => {
                            if (checked) { const langs = clientEdits.languages || []; if (!langs.some((l: any) => l.language === lang)) setClientEdits((prev: any) => ({ ...prev, languages: [...langs, { language: lang, proficiency: lang === 'English' ? 'Professional' : 'Basic' }] })); }
                            else setClientEdits((prev: any) => ({ ...prev, languages: (prev.languages || []).filter((l: any) => l.language !== lang) }));
                          }} />
                          {lang}
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* ── Personal Details ── */}
                {(missingNationality || missingDOB || missingMaritalStatus) && (
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
                    <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2"><User className="h-4 w-4 text-slate-500" /> Personal Details</h4>
                    <p className="text-xs text-slate-500">Please provide your personal details.</p>
                    <div className="grid grid-cols-2 gap-3">
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
                    <div className="grid grid-cols-2 gap-4">
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
  };


  if (workflowStep === 'client-portal') {
    return renderClientPortal();
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
        )}

        {/* ─── STEP 2: REVIEW & EDIT ──────────────────────────────────────── */}
        {workflowStep === 'review-edit' && (
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
                <button onClick={() => setShowAtsOptimizer(true)} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left hover:bg-amber-50 text-slate-600 text-sm font-semibold"><BarChart3 className="h-3 w-3 text-amber-600" /> ATS Optimizer</button>
                <button onClick={() => setShowJobMatch(true)} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left hover:bg-blue-50 text-slate-600 text-sm font-semibold"><Crosshair className="h-3 w-3 text-blue-600" /> Job Match</button>
                <button onClick={() => setShowCoverLetter(true)} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left hover:bg-green-50 text-slate-600 text-sm font-semibold"><CoverLetterIcon className="h-3 w-3 text-green-600" /> Cover Letter</button>
                <button onClick={() => setShowResumeVersions(true)} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left hover:bg-slate-50 text-slate-600 text-sm font-semibold"><Copy className="h-3 w-3 text-slate-500" /> Versions</button>
                <button onClick={() => setShowAnalytics(true)} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left hover:bg-slate-50 text-slate-600 text-sm font-semibold"><BarChart3 className="h-3 w-3 text-slate-500" /> Analytics</button>
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

                {/* Contact Information Editor */}
                {activeSection === 'contact' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5 col-span-2">
                      <Label className="text-sm font-bold uppercase tracking-wider text-slate-500">Full Name</Label>
                      <Input value={cvData.personalInfo?.fullName ?? ""} onChange={(e) => handlePersonalInfoChange("fullName", e.target.value)} className={cvData.personalInfo?.fullName ? "field-has-data" : ""} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-bold uppercase tracking-wider text-slate-500">Professional Title</Label>
                      <Input value={cvData.personalInfo?.title ?? ""} onChange={(e) => handlePersonalInfoChange("title", e.target.value)} className={cvData.personalInfo?.title ? "field-has-data" : ""} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-bold uppercase tracking-wider text-slate-500">Photo</Label>
                      <div className="flex gap-2 items-center">
                        {cvData.personalInfo?.photoUrl ? (
                          <img src={cvData.personalInfo.photoUrl} className="h-10 w-10 object-cover rounded-lg border border-slate-200" />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center"><User className="h-4 w-4 text-slate-400" /></div>
                        )}
                        <Input type="file" accept="image/*" className="text-xs h-8" onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          // Set preview immediately
                          const url = URL.createObjectURL(file);
                          handlePersonalInfoChange("photoUrl", url);
                          // Save to storage if we have an applicantId
                          if (applicantId) {
                            try {
                              const ext = file.name.split('.').pop() || 'jpg';
                              const filePath = `cv-builder/${applicantId}/photo.${ext}`;
                              await supabase.storage.from('kyc-documents').upload(filePath, file, { upsert: true, contentType: file.type });
                              const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${filePath}`;
                              handlePersonalInfoChange("photoUrl", publicUrl);
                              // Also save to acc_portal_directors_documents if linked client
                              if (linkedIndividualId) {
                                const registryPath = `individual-documents/${linkedIndividualId}/${CLEAR_PHOTO_ID}/photo_${Date.now()}.${ext}`;
                                await supabase.storage.from('kyc-documents').upload(registryPath, file, { upsert: true, contentType: file.type });
                                await supabase.from('acc_portal_directors_documents').upsert({
                                  director_id: linkedIndividualId, document_id: CLEAR_PHOTO_ID,
                                  file_path: registryPath, status: 'active',
                                  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                                }, { onConflict: 'director_id,file_path' });
                              }
                            } catch (err) { console.warn('Photo save failed:', err); }
                          }
                        }} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-bold uppercase tracking-wider text-slate-500">Email</Label>
                      <Input value={cvData.personalInfo?.email ?? ""} onChange={(e) => handlePersonalInfoChange("email", e.target.value)} className={cvData.personalInfo?.email ? "field-has-data" : ""} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-bold uppercase tracking-wider text-slate-500">Phone</Label>
                      <Input value={cvData.personalInfo?.phone ?? ""} onChange={(e) => handlePersonalInfoChange("phone", e.target.value)} className={cvData.personalInfo?.phone ? "field-has-data" : ""} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-bold uppercase tracking-wider text-slate-500">Location</Label>
                      <Input value={cvData.personalInfo?.location ?? ""} onChange={(e) => handlePersonalInfoChange("location", e.target.value)} className={cvData.personalInfo?.location ? "field-has-data" : ""} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-bold uppercase tracking-wider text-slate-500">LinkedIn</Label>
                      <Input value={cvData.personalInfo?.linkedin ?? ""} onChange={(e) => handlePersonalInfoChange("linkedin", e.target.value)} className={cvData.personalInfo?.linkedin ? "field-has-data" : ""} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-bold uppercase tracking-wider text-slate-500">GitHub</Label>
                      <Input value={cvData.personalInfo?.github ?? ""} onChange={(e) => handlePersonalInfoChange("github", e.target.value)} className={cvData.personalInfo?.github ? "field-has-data" : ""} />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label className="text-sm font-bold uppercase tracking-wider text-slate-500">Personal Details</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <Input placeholder="Date of Birth" value={cvData.personalDetails?.dateOfBirth ?? ""} onChange={(e) => handlePersonalDetailsChange("dateOfBirth", e.target.value)} className={cvData.personalDetails?.dateOfBirth ? "field-has-data" : ""} />
                        <Input placeholder="Nationality" value={cvData.personalDetails?.nationality ?? ""} onChange={(e) => handlePersonalDetailsChange("nationality", e.target.value)} className={cvData.personalDetails?.nationality ? "field-has-data" : ""} />
                        <Input placeholder="Marital Status" value={cvData.personalDetails?.maritalStatus ?? ""} onChange={(e) => handlePersonalDetailsChange("maritalStatus", e.target.value)} className={cvData.personalDetails?.maritalStatus ? "field-has-data" : ""} />
                        <Input placeholder="Residence" value={cvData.personalDetails?.residence ?? ""} onChange={(e) => handlePersonalDetailsChange("residence", e.target.value)} className={cvData.personalDetails?.residence ? "field-has-data" : ""} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Summary Editor */}
                {activeSection === 'summary' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-bold uppercase tracking-wider text-slate-500">Professional Summary</Label>
                      <Button size="sm" variant="ghost" onClick={() => setShowAiWriter(true)} className="h-6 text-sm text-purple-600 gap-1"><Sparkles className="h-3 w-3" /> AI Enhance</Button>
                    </div>
                    <Textarea rows={6} value={cvData.summary ?? ""} onChange={(e) => setCvData({ ...cvData, summary: e.target.value })} placeholder="Write a compelling professional summary..." className={cvData.summary ? "field-has-data" : ""} />
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <Sparkles className="h-4 w-4 text-custom-blue shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-slate-700">AI Suggestion</p>
                          <p className="text-sm text-slate-500 mt-0.5">Results-driven professional with expertise in... Consider adding measurable achievements and industry-specific keywords.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Experience Editor */}
                {activeSection === 'experience' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">{cvData.experience.length} entries</span>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => setShowAiWriter(true)} className="h-7 text-sm text-purple-600 gap-1"><Sparkles className="h-3 w-3" /> AI Enhance</Button>
                        <Button size="sm" variant="outline" onClick={addExperience} className="h-7 text-sm gap-1 border-dashed"><Plus className="h-3 w-3" /> Add</Button>
                      </div>
                    </div>
                    {cvData.experience.length === 0 && <p className="text-xs text-slate-400 italic py-4 text-center">No experience entries yet. Click "Add" to create one.</p>}
                    <div className="space-y-3">
                      {cvData.experience.map((exp: any, idx: number) => {
                        const key = `exp-${idx}`;
                        const collapsed = collapsedItems[key];
                        return (
                          <div key={idx} className="border border-slate-200 rounded-xl overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 cursor-pointer" onClick={() => toggleItem(key)}>
                              <div className="flex items-center gap-2">
                                {collapsed ? <ChevronRight className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
                                <span className="text-xs font-bold text-slate-700">{exp.role || 'Position'} {exp.company ? `— ${exp.company}` : `#${idx + 1}`}</span>
                                {exp.startDate && <span className="text-xs text-slate-400">{exp.startDate}–{exp.endDate}</span>}
                              </div>
                              <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); removeExperience(idx); }} className="h-6 w-6 text-red-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="h-3 w-3" /></Button>
                            </div>
                            {!collapsed && (
                              <div className="p-4 grid grid-cols-2 gap-3">
                                <Input placeholder="Company Name" value={exp.company ?? ""} onChange={(e) => handleExperienceChange(idx, "company", e.target.value)} />
                                <Input placeholder="Location" value={exp.location ?? ""} onChange={(e) => handleExperienceChange(idx, "location", e.target.value)} />
                                <Input placeholder="Role / Job Title" value={exp.role ?? ""} onChange={(e) => handleExperienceChange(idx, "role", e.target.value)} />
                                <div className="grid grid-cols-2 gap-2">
                                  <Input placeholder="Start Date" value={exp.startDate ?? ""} onChange={(e) => handleExperienceChange(idx, "startDate", e.target.value)} />
                                  <Input placeholder="End Date" value={exp.endDate ?? ""} onChange={(e) => handleExperienceChange(idx, "endDate", e.target.value)} />
                                </div>
                                <Input placeholder="Company Description" className="col-span-2" value={exp.companyDesc ?? ""} onChange={(e) => handleExperienceChange(idx, "companyDesc", e.target.value)} />
                                <div className="col-span-2 space-y-2">
                                  <div className="flex justify-between items-center">
                                    <span className="text-xs text-slate-500">Key Responsibilities</span>
                                    <Button type="button" variant="ghost" size="sm" onClick={() => addRespToExperience(idx)} className="h-6 text-sm text-blue-600"><Plus className="h-2.5 w-2.5" /> Add</Button>
                                  </div>
                                  {exp.responsibilities?.map((resp: string, rIdx: number) => (
                                    <div key={rIdx} className="flex gap-2 items-center">
                                      <Input value={resp ?? ""} placeholder="e.g. Designed backend system" onChange={(e) => handleRespChangeInExperience(idx, rIdx, e.target.value)} className="h-8 text-xs" />
                                      <Button variant="ghost" size="icon" onClick={() => removeRespFromExperience(idx, rIdx)} className="h-8 w-8 text-red-400 hover:text-red-600"><Trash2 className="h-3 w-3" /></Button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* Education Editor */}
                {activeSection === 'education' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">{cvData.education.length} entries</span>
                      <Button size="sm" variant="outline" onClick={addEducation} className="h-7 text-sm gap-1 border-dashed"><Plus className="h-3 w-3" /> Add</Button>
                    </div>
                    {cvData.education.length === 0 && <p className="text-xs text-slate-400 italic py-4 text-center">No education entries yet.</p>}
                    {cvData.education.map((edu: any, idx: number) => {
                      const key = `edu-${idx}`; const collapsed = collapsedItems[key];
                      return (
                        <div key={idx} className="border border-slate-200 rounded-xl overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 cursor-pointer" onClick={() => toggleItem(key)}>
                            <div className="flex items-center gap-2">
                              {collapsed ? <ChevronRight className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
                              <span className="text-xs font-bold text-slate-700">{edu.degree || `Education #${idx + 1}`}{edu.institution ? ` — ${edu.institution}` : ''}</span>
                              {edu.year && <span className="text-xs text-slate-400">({edu.year})</span>}
                            </div>
                            <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); removeEducation(idx); }} className="h-6 w-6 text-red-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="h-3 w-3" /></Button>
                          </div>
                          {!collapsed && (
                            <div className="p-4 grid grid-cols-2 gap-3">
                              <Input placeholder="Degree / Certificate" value={edu.degree ?? ""} onChange={(e) => handleEducationChange(idx, "degree", e.target.value)} />
                              <Input placeholder="Year of Completion" value={edu.year ?? ""} onChange={(e) => handleEducationChange(idx, "year", e.target.value)} />
                              <Input placeholder="Institution" className="col-span-2" value={edu.institution ?? ""} onChange={(e) => handleEducationChange(idx, "institution", e.target.value)} />
                              <Input placeholder="Extra Details / Certifications" className="col-span-2" value={edu.details ?? ""} onChange={(e) => handleEducationChange(idx, "details", e.target.value)} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Skills Editor */}
                {activeSection === 'skills' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">{cvData.skills.length} categories</span>
                      <Button size="sm" variant="outline" onClick={addSkillGroup} className="h-7 text-sm gap-1 border-dashed"><Plus className="h-3 w-3" /> Add</Button>
                    </div>
                    {cvData.skills.length === 0 && <p className="text-xs text-slate-400 italic py-4 text-center">No skills added yet.</p>}
                    {cvData.skills.map((skill: any, idx: number) => {
                      const key = `skill-${idx}`; const collapsed = collapsedItems[key];
                      return (
                        <div key={idx} className="border border-slate-200 rounded-xl overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 cursor-pointer" onClick={() => toggleItem(key)}>
                            <div className="flex items-center gap-2">
                              {collapsed ? <ChevronRight className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
                              <span className="text-xs font-bold text-slate-700">{skill.category || `Skill Group #${idx + 1}`}</span>
                            </div>
                            <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); removeSkillGroup(idx); }} className="h-6 w-6 text-red-400 hover:text-red-600"><Trash2 className="h-3 w-3" /></Button>
                          </div>
                          {!collapsed && (
                            <div className="p-3 space-y-2">
                              <Input placeholder="Category (e.g. Frameworks & Tools)" value={skill.category ?? ""} onChange={(e) => handleSkillGroupChange(idx, "category", e.target.value)} />
                              <Textarea placeholder="Comma-separated items" rows={2} value={skill.items ?? ""} onChange={(e) => handleSkillGroupChange(idx, "items", e.target.value)} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Internships Editor */}
                {activeSection === 'internships' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">{cvData.internships.length} entries</span>
                      <Button size="sm" variant="outline" onClick={addInternship} className="h-7 text-sm gap-1 border-dashed"><Plus className="h-3 w-3" /> Add</Button>
                    </div>
                    {cvData.internships.length === 0 && <p className="text-xs text-slate-400 italic py-4 text-center">No internships added yet.</p>}
                    {cvData.internships.map((intern: any, idx: number) => (
                      <div key={idx} className="p-4 border border-slate-200 rounded-xl space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-500">Internship #{idx + 1}</span>
                          <Button variant="ghost" size="icon" onClick={() => removeInternship(idx)} className="text-red-500 hover:text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <Input placeholder="Company" value={intern.company ?? ""} onChange={(e) => handleInternshipChange(idx, "company", e.target.value)} />
                          <Input placeholder="Location" value={intern.location ?? ""} onChange={(e) => handleInternshipChange(idx, "location", e.target.value)} />
                          <Input placeholder="Role / Title" value={intern.role ?? ""} onChange={(e) => handleInternshipChange(idx, "role", e.target.value)} />
                          <div className="grid grid-cols-2 gap-2">
                            <Input placeholder="Start Date" value={intern.startDate ?? ""} onChange={(e) => handleInternshipChange(idx, "startDate", e.target.value)} />
                            <Input placeholder="End Date" value={intern.endDate ?? ""} onChange={(e) => handleInternshipChange(idx, "endDate", e.target.value)} />
                          </div>
                          <Input placeholder="Company Description" className="col-span-2" value={intern.companyDesc ?? ""} onChange={(e) => handleInternshipChange(idx, "companyDesc", e.target.value)} />
                          <div className="col-span-2 space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-slate-500">Key Responsibilities</span>
                              <Button type="button" variant="ghost" size="sm" onClick={() => addRespToInternship(idx)} className="h-6 text-sm text-blue-600"><Plus className="h-2.5 w-2.5" /> Add</Button>
                            </div>
                            {intern.responsibilities?.map((resp: string, rIdx: number) => (
                              <div key={rIdx} className="flex gap-2 items-center">
                                <Input value={resp ?? ""} onChange={(e) => handleRespChangeInInternship(idx, rIdx, e.target.value)} className="h-8 text-xs" />
                                <Button variant="ghost" size="icon" onClick={() => removeRespFromInternship(idx, rIdx)} className="h-8 w-8 text-red-400 hover:text-red-600"><Trash2 className="h-3 w-3" /></Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Projects Editor */}
                {activeSection === 'projects' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">{cvData.projects.length} entries</span>
                      <Button size="sm" variant="outline" onClick={addProject} className="h-7 text-sm gap-1 border-dashed"><Plus className="h-3 w-3" /> Add</Button>
                    </div>
                    {cvData.projects.length === 0 && <p className="text-xs text-slate-400 italic py-4 text-center">No projects added yet.</p>}
                    {cvData.projects.map((proj: any, idx: number) => (
                      <div key={idx} className="p-4 border border-slate-200 rounded-xl space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-500">Project #{idx + 1}</span>
                          <Button variant="ghost" size="icon" onClick={() => removeProject(idx)} className="text-red-500 hover:text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                        <div className="grid grid-cols-[1fr_100px] gap-3">
                          <Input placeholder="Project Title" value={proj.title ?? ""} onChange={(e) => handleProjectChange(idx, "title", e.target.value)} />
                          <Input placeholder="Year" value={proj.year ?? ""} onChange={(e) => handleProjectChange(idx, "year", e.target.value)} />
                        </div>
                        <Textarea placeholder="Project Description" rows={2} value={proj.description ?? ""} onChange={(e) => handleProjectChange(idx, "description", e.target.value)} />
                      </div>
                    ))}
                  </div>
                )}

                {/* Languages Editor */}
                {activeSection === 'languages' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">{cvData.languages.length} languages</span>
                      <Button size="sm" variant="outline" onClick={addLanguage} className="h-7 text-sm gap-1 border-dashed"><Plus className="h-3 w-3" /> Add</Button>
                    </div>
                    {cvData.languages.length === 0 && <p className="text-xs text-slate-400 italic py-4 text-center">No languages added yet.</p>}
                    {cvData.languages.map((lang: any, idx: number) => (
                      <div key={idx} className="flex gap-3 items-center">
                        <Input placeholder="Language" value={lang.language ?? ""} onChange={(e) => handleLanguageChange(idx, "language", e.target.value)} className="flex-1" />
                        <Input placeholder="Proficiency" value={lang.proficiency ?? ""} onChange={(e) => handleLanguageChange(idx, "proficiency", e.target.value)} className="flex-1" />
                        <Button variant="ghost" size="icon" onClick={() => removeLanguage(idx)} className="text-red-500 hover:text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* References Editor */}
                {activeSection === 'references' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">{cvData.references.length} entries</span>
                      <Button size="sm" variant="outline" onClick={addReference} className="h-7 text-sm gap-1 border-dashed"><Plus className="h-3 w-3" /> Add</Button>
                    </div>
                    {cvData.references.length === 0 && <p className="text-xs text-slate-400 italic py-4 text-center">No references added yet.</p>}
                    {cvData.references.map((ref: any, idx: number) => (
                      <div key={idx} className="p-4 border border-slate-200 rounded-xl space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-500">Reference #{idx + 1}</span>
                          <Button variant="ghost" size="icon" onClick={() => removeReference(idx)} className="text-red-500 hover:text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <Input placeholder="Reference Name" value={ref.name ?? ""} onChange={(e) => handleReferenceChange(idx, "name", e.target.value)} />
                          <Input placeholder="Title / Role" value={ref.title ?? ""} onChange={(e) => handleReferenceChange(idx, "title", e.target.value)} />
                          <CreatableCombobox
                            options={companyOptions}
                            value={ref.company ?? ""}
                            onChange={(v) => handleReferenceChange(idx, "company", v)}
                            onCreateOption={handleCreateCompany}
                            placeholder="Select or create company..."
                            createLabel="Use new company"
                          />
                          <Input placeholder="Contact (Phone / Email)" value={ref.contact ?? ""} onChange={(e) => handleReferenceChange(idx, "contact", e.target.value)} />
                          <Input placeholder="Address / Office" className="col-span-2" value={ref.address ?? ""} onChange={(e) => handleReferenceChange(idx, "address", e.target.value)} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Certifications Editor */}
                {activeSection === 'certifications' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">{(cvData.certifications || []).length} entries</span>
                      <Button size="sm" variant="outline" onClick={addCertification} className="h-7 text-sm gap-1 border-dashed"><Plus className="h-3 w-3" /> Add</Button>
                    </div>
                    {(cvData.certifications || []).length === 0 && <p className="text-xs text-slate-400 italic py-4 text-center">No certifications added yet.</p>}
                    {(cvData.certifications || []).map((cert: any, idx: number) => (
                      <div key={idx} className="p-4 border border-slate-200 rounded-xl space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-500">Certification #{idx + 1}</span>
                          <Button variant="ghost" size="icon" onClick={() => removeCertification(idx)} className="text-red-500 hover:text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <Input placeholder="Certification Name" value={cert.name ?? ""} onChange={(e) => handleCertificationChange(idx, "name", e.target.value)} />
                          <Input placeholder="Issuer" value={cert.issuer ?? ""} onChange={(e) => handleCertificationChange(idx, "issuer", e.target.value)} />
                          <Input placeholder="Date" value={cert.date ?? ""} onChange={(e) => handleCertificationChange(idx, "date", e.target.value)} />
                          <Input placeholder="URL (optional)" value={cert.url ?? ""} onChange={(e) => handleCertificationChange(idx, "url", e.target.value)} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Achievements Editor */}
                {activeSection === 'achievements' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">{(cvData.achievements || []).length} entries</span>
                      <Button size="sm" variant="outline" onClick={addAchievement} className="h-7 text-sm gap-1 border-dashed"><Plus className="h-3 w-3" /> Add</Button>
                    </div>
                    {(cvData.achievements || []).length === 0 && <p className="text-xs text-slate-400 italic py-4 text-center">No achievements added yet.</p>}
                    {(cvData.achievements || []).map((ach: any, idx: number) => (
                      <div key={idx} className="p-4 border border-slate-200 rounded-xl space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-500">Achievement #{idx + 1}</span>
                          <Button variant="ghost" size="icon" onClick={() => removeAchievement(idx)} className="text-red-500 hover:text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <Input placeholder="Achievement Title" value={ach.title ?? ""} onChange={(e) => handleAchievementChange(idx, "title", e.target.value)} />
                          <Input placeholder="Date" value={ach.date ?? ""} onChange={(e) => handleAchievementChange(idx, "date", e.target.value)} />
                          <Textarea placeholder="Description" rows={2} className="col-span-2" value={ach.description ?? ""} onChange={(e) => handleAchievementChange(idx, "description", e.target.value)} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Additional Info Editor */}
                {activeSection === 'additionalInfo' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">{(cvData.additionalInfo || []).length} entries</span>
                      <Button size="sm" variant="outline" onClick={addAdditionalInfo} className="h-7 text-sm gap-1 border-dashed"><Plus className="h-3 w-3" /> Add</Button>
                    </div>
                    {(cvData.additionalInfo || []).length === 0 && <p className="text-xs text-slate-400 italic py-4 text-center">No additional info added yet.</p>}
                    {(cvData.additionalInfo || []).map((info: any, idx: number) => (
                      <div key={idx} className="flex gap-3 items-start p-3 border border-slate-200 rounded-lg">
                        <div className="flex-1 grid grid-cols-2 gap-3">
                          <Input placeholder="Label (e.g. Availability)" value={info.label ?? ""} onChange={(e) => handleAdditionalInfoChange(idx, "label", e.target.value)} />
                          <Input placeholder="Value (e.g. Immediate)" value={info.value ?? ""} onChange={(e) => handleAdditionalInfoChange(idx, "value", e.target.value)} />
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => removeAdditionalInfo(idx)} className="text-red-500 hover:text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Declaration Editor */}
                {activeSection === 'declaration' && (
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="includeDeclaration" checked={cvData.includeDeclaration !== false} onCheckedChange={(checked) => setCvData({ ...cvData, includeDeclaration: !!checked })} />
                      <Label htmlFor="includeDeclaration" className="text-xs text-slate-600 cursor-pointer">Include Declaration section on the CV</Label>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold uppercase tracking-wider text-slate-500">Declaration Statement</Label>
                      <Textarea rows={3} disabled={cvData.includeDeclaration === false} value={cvData.declaration || ""} onChange={(e) => setCvData({ ...cvData, declaration: e.target.value })} />
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="verifiedBadge" disabled={cvData.includeDeclaration === false} checked={cvData.verifiedBadge} onCheckedChange={(checked) => setCvData({ ...cvData, verifiedBadge: !!checked })} />
                      <Label htmlFor="verifiedBadge" className="text-xs text-slate-600 cursor-pointer">Include "CV Verified & Up-to-date {getVerifiedDateLabel()}" line</Label>
                    </div>
                  </div>
                )}

              </div>
            </Panel>

            <PanelResizeHandle className="w-1.5 bg-slate-100 hover:bg-custom-blue/30 transition-colors cursor-col-resize flex-shrink-0" />

            {/* Right — Preview Panel (Review & Edit step) */}
            <Panel defaultSize={45} minSize={25} className="bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Live Preview</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setZoomLevel(Math.max(0.4, zoomLevel - 0.05))} className="p-1 hover:bg-slate-100 rounded"><ZoomOut className="h-3.5 w-3.5 text-slate-500" /></button>
                  <span className="text-sm font-bold text-slate-600 min-w-[36px] text-center">{Math.round(zoomLevel * 100)}%</span>
                  <button onClick={() => setZoomLevel(Math.min(1.2, zoomLevel + 0.05))} className="p-1 hover:bg-slate-100 rounded"><ZoomIn className="h-3.5 w-3.5 text-slate-500" /></button>
                </div>
                <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
                  {[{ key: "theme1", label: "Classic" }, { key: "theme2", label: "Modern" }, { key: "theme3", label: "Minimal" }, { key: "theme4", label: "Executive" }].map(t => (
                    <button key={t.key} onClick={() => setSelectedLayout(t.key)}
                      className={`text-sm font-semibold px-2 py-1 rounded-md transition-all ${selectedLayout === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >{t.label}</button>
                  ))}
                </div>
              </div>
              <div className="flex-1 overflow-auto p-6 flex items-start justify-center bg-slate-50 custom-scrollbar">
                <div style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top center', transition: 'transform 0.15s ease-out' }} className="shrink-0">
                  <div ref={previewRef} id="cv-preview-container" style={{ width: '210mm', minHeight: '297mm', background: 'white' }}><CVLayout cvData={cvData} cvSettings={cvSettings} selectedLayout={selectedLayout} /></div>
                </div>
              </div>
            </Panel>
          </PanelGroup>
        )}

        {/* ─── STEP 3: CLIENT COLLABORATION ─────────────────────────────── */}
        {workflowStep === 'collaboration' && (
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
        )}


        {/* ─── Module Modals (close on backdrop click) ─── */}
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

        {/* ─── Design Side Panel ─── */}
        {showDesignPanel && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setShowDesignPanel(false)} />
            <div className="fixed right-0 top-[56px] bottom-0 w-72 bg-white border-l border-slate-200 shadow-2xl z-40 flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between shrink-0">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Palette className="h-4 w-4 text-custom-blue" /> Design Panel</h3>
                <button onClick={() => setShowDesignPanel(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
              </div>
              <div className="flex gap-0.5 bg-slate-100 rounded-lg p-0.5 mx-3 mt-3 shrink-0">
                {[{ key: 'theme', label: 'Layout' }, { key: 'colors', label: 'Color' }, { key: 'font', label: 'Font' }, { key: 'photo', label: 'Photo' }].map(tab => (
                  <button key={tab.key} onClick={() => setActiveDesignTab(tab.key)}
                    className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-all ${activeDesignTab === tab.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >{tab.label}</button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {activeDesignTab === 'theme' && (
                  <div className="space-y-3">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">CV Layout</span>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { key: "theme1", label: "Classic", desc: "Two-column sidebar" },
                        { key: "theme2", label: "Modern", desc: "Top-header layout" },
                        { key: "theme3", label: "Minimal", desc: "Single column" },
                        { key: "theme4", label: "Executive", desc: "Bold leadership" },
                        { key: "theme5", label: "Creative", desc: "Split accent bar" },
                        { key: "theme6", label: "Academic", desc: "Scholar format" },
                        { key: "theme7", label: "Timeline", desc: "Vertical timeline" },
                      ].map(t => (
                        <button key={t.key} onClick={() => setSelectedLayout(t.key)}
                          className={`p-2.5 rounded-lg border-2 text-left transition-all ${selectedLayout === t.key ? 'border-custom-blue bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
                        >
                          <Layout className={`h-3.5 w-3.5 mb-1 ${selectedLayout === t.key ? 'text-custom-blue' : 'text-slate-400'}`} />
                          <div className="text-xs font-bold text-slate-700">{t.label}</div>
                          <div className="text-xs text-slate-400">{t.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {activeDesignTab === 'colors' && (
                  <div className="space-y-3">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Color Scheme</span>
                    <div className="grid grid-cols-4 gap-2">
                      {COLOR_PRESETS.map(preset => (
                        <button key={preset.name} title={preset.name}
                          onClick={() => { updateCvSetting('primaryColor', preset.primary); updateCvSetting('accentColor', preset.accent); }}
                          className="relative w-full aspect-square rounded-xl border-2 transition-all hover:scale-105"
                          style={{ background: `linear-gradient(135deg, ${preset.primary} 50%, ${preset.accent} 50%)`, borderColor: (cvSettings.primaryColor === preset.primary && cvSettings.accentColor === preset.accent) ? '#376bae' : 'transparent' }}
                        >
                          {(cvSettings.primaryColor === preset.primary && cvSettings.accentColor === preset.accent) && <Check className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow" />}
                        </button>
                      ))}
                    </div>
                    <div className="space-y-1.5"><span className="text-xs text-slate-500">Primary</span><input type="color" value={cvSettings.primaryColor} onChange={e => updateCvSetting('primaryColor', e.target.value)} className="w-full h-8 rounded border border-slate-200 p-0.5 cursor-pointer" /></div>
                    <div className="space-y-1.5"><span className="text-xs text-slate-500">Accent</span><input type="color" value={cvSettings.accentColor} onChange={e => updateCvSetting('accentColor', e.target.value)} className="w-full h-8 rounded border border-slate-200 p-0.5 cursor-pointer" /></div>
                  </div>
                )}
                {activeDesignTab === 'font' && (
                  <div className="space-y-3">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Font Family</span>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { name: 'Inter', family: 'Inter, sans-serif', desc: 'Clean modern' },
                        { name: 'Roboto', family: 'Roboto, sans-serif', desc: 'Versatile' },
                        { name: 'Poppins', family: 'Poppins, sans-serif', desc: 'Friendly' },
                        { name: 'Lato', family: 'Lato, sans-serif', desc: 'Professional' },
                        { name: 'Merriweather', family: 'Merriweather, serif', desc: 'Elegant' },
                        { name: 'System', family: '-apple-system, sans-serif', desc: 'Default' },
                      ].map(f => (
                        <button key={f.name} onClick={() => updateCvSetting('fontFamily', f.family)}
                          className={`p-2.5 rounded-lg border-2 text-left transition-all ${(cvSettings as any).fontFamily === f.family ? 'border-custom-blue bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
                        >
                          <div className="text-xs font-bold text-slate-700" style={{ fontFamily: f.family }}>{f.name}</div>
                          <div className="text-xs text-slate-400">{f.desc}</div>
                        </button>
                      ))}
                    </div>
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block mt-2">Font Size</span>
                    <div className="flex items-center border border-slate-200 rounded-md overflow-hidden h-8 bg-white">
                      {([0.85, 1, 1.15] as const).map((s, i) => (
                        <button key={s} onClick={() => updateCvSetting('fontScale', s)} className={`flex-1 text-xs font-bold h-full transition-colors ${cvSettings.fontScale === s ? 'bg-custom-blue text-white' : 'text-slate-500 hover:bg-slate-50'} ${i > 0 ? 'border-l border-slate-200' : ''}`}>{['Sm', 'Md', 'Lg'][i]}</button>
                      ))}
                    </div>
                  </div>
                )}
                {activeDesignTab === 'photo' && (
                  <div className="space-y-3">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Photo Shape</span>
                    <div className="flex gap-2">
                      {(['circle', 'rounded', 'square'] as const).map(shape => (
                        <button key={shape} onClick={() => updateCvSetting('photoShape', shape)}
                          className={`flex-1 py-2 text-xs font-bold rounded-lg border-2 capitalize transition-all ${cvSettings.photoShape === shape ? 'border-custom-blue bg-blue-50 text-custom-blue' : 'border-slate-200 text-slate-500'}`}
                        >{shape}</button>
                      ))}
                    </div>
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Photo Size</span>
                    <div className="flex gap-2">
                      {([{ label: 'S', val: '80px' }, { label: 'M', val: '110px' }, { label: 'L', val: '140px' }]).map(sz => (
                        <button key={sz.val} onClick={() => updateCvSetting('photoSize', sz.val)}
                          className={`flex-1 py-2 text-xs font-bold rounded-lg border-2 transition-all ${cvSettings.photoSize === sz.val ? 'border-custom-blue bg-blue-50 text-custom-blue' : 'border-slate-200 text-slate-500'}`}
                        >{sz.label}</button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Checkbox id="showPhoto" checked={(cvSettings as any).showPhoto !== false} onCheckedChange={v => updateCvSetting('showPhoto', v)} />
                      <label htmlFor="showPhoto" className="text-xs font-semibold text-slate-700 cursor-pointer">Show Photo</label>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Save Draft Modal */}
        {showSaveDraftModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-custom-blue flex items-center justify-center shrink-0">
                  <Save className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Save CV Draft</h3>
                  <p className="text-xs text-slate-400">{savingDraftForPortal ? 'Required before sharing the secure client link.' : 'Save your progress to continue later.'}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Draft Name</label>
                <Input
                  value={draftNameInput}
                  onChange={(e) => setDraftNameInput(e.target.value)}
                  placeholder="e.g. John Smith CV – Draft 1"
                  className="h-9 text-sm"
                  autoFocus
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  className="flex-1 h-9 text-sm"
                  onClick={() => { setShowSaveDraftModal(false); setSavingDraftForPortal(false); }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 h-9 text-sm bg-custom-blue hover:bg-[#2d5a94] text-white font-bold gap-1.5"
                  disabled={!draftNameInput.trim() || isSavingDraft}
                  onClick={async () => {
                    const name = draftNameInput.trim();
                    if (!name) return;
                    const draftId = await saveDraft(name, savingDraftForPortal);
                    setShowSaveDraftModal(false);
                    if (savingDraftForPortal) {
                      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
                      const link = `${origin}/dashboard/cv-generator?portal=true&draftId=${draftId}`;
                      navigator.clipboard.writeText(link);
                      toast.success('Draft saved! Client link copied to clipboard.');
                    } else {
                      toast.success(`Draft "${name}" saved!`);
                    }
                    setSavingDraftForPortal(false);
                  }}
                >
                  {isSavingDraft ? 'Saving...' : savingDraftForPortal ? 'Save & Copy Link' : 'Save Draft'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Send CV Modal ─── */}
        {showSendCvModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowSendCvModal(false); }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0"><MessageSquare className="h-4 w-4 text-white" /></div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800">Send CV</h3>
                    <p className="text-xs text-slate-400">Email or WhatsApp the candidate CV</p>
                  </div>
                </div>
                <button onClick={() => setShowSendCvModal(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
              </div>

              {/* Send method */}
              <div className="flex gap-2">
                {(['email', 'whatsapp'] as const).map(m => (
                  <button key={m} onClick={() => setSendMethod(m)}
                    className={`flex-1 py-2 rounded-lg border-2 text-sm font-bold capitalize transition-all ${sendMethod === m ? (m === 'whatsapp' ? 'border-green-500 bg-green-50 text-green-700' : 'border-custom-blue bg-blue-50 text-custom-blue') : 'border-slate-200 text-slate-500'}`}
                  >{m === 'whatsapp' ? '📱 WhatsApp' : '✉️ Email'}</button>
                ))}
              </div>

              {/* Recommender details */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Recommender / Referrer</h4>
                <RecommenderSelect
                  value={recommenderContactId}
                  onChange={(rec) => { setRecommenderContactId(rec ? rec.id : null); setSelectedRecommender(rec); }}
                  placeholder="Search recommender..."
                />
                <p className="text-[10px] text-slate-400">Select an existing recommender or create a new one.</p>
              </div>

              {/* Recipients */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Recipients</h4>
                <div className="space-y-2 bg-slate-50 rounded-xl p-3 border border-slate-200">
                  {[
                    { key: 'sandip', label: 'Sandip Patel (BCL)', detail: sendMethod === 'email' ? 'info@booksmartconsult.com' : '+254 700 505275' },
                    { key: 'applicant', label: 'Applicant', detail: cvData.personalInfo?.email || cvData.personalInfo?.phone || 'No contact set' },
                    { key: 'recommender', label: 'Recommender', detail: selectedRecommender?.email_address || selectedRecommender?.personal_mobile || 'Select a recommender' },
                  ].map(r => (
                    <label key={r.key} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={sendCvRecipients[r.key]} onCheckedChange={v => setSendCvRecipients(p => ({ ...p, [r.key]: !!v }))} />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-semibold text-slate-700">{r.label}</span>
                        <span className="text-xs text-slate-400 ml-2 truncate">{r.detail}</span>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Third-party contacts */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-600">Additional Recipients</span>
                    <button onClick={() => setThirdParties(p => [...p, { name: '', email: '', role: 'recruiter' }])} className="text-xs text-custom-blue font-bold hover:underline">+ Add</button>
                  </div>
                  {thirdParties.map((tp, i) => (
                    <div key={i} className="flex gap-1.5 items-center">
                      <Input placeholder="Name" value={tp.name} onChange={e => setThirdParties(p => p.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x))} className="h-7 text-xs flex-1" />
                      <Input placeholder="Email / Phone" value={tp.email} onChange={e => setThirdParties(p => p.map((x, xi) => xi === i ? { ...x, email: e.target.value } : x))} className="h-7 text-xs flex-1" />
                      <select value={tp.role} onChange={e => setThirdParties(p => p.map((x, xi) => xi === i ? { ...x, role: e.target.value } : x))} className="h-7 text-xs border border-slate-200 rounded-md px-1 bg-white">
                        <option value="recruiter">Recruiter (To)</option>
                        <option value="applicant">Applicant (CC)</option>
                        <option value="cc">CC</option>
                      </select>
                      <button onClick={() => setThirdParties(p => p.filter((_, xi) => xi !== i))} className="text-slate-400 hover:text-red-500 shrink-0"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cover letter */}
              {sendMethod === 'email' && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Cover Letter / Message Body</h4>
                  <Textarea
                    rows={5}
                    placeholder={`Dear Hiring Manager,\n\nI am pleased to submit the CV of ${cvData.personalInfo?.fullName || 'the applicant'} for the position of ${cvData.personalInfo?.title || 'the role in question'}.\n\n${thirdParties[0]?.name ? `This applicant was referred by ${thirdParties[0].name}${thirdParties[0]?.company ? ` of ${thirdParties[0].company}` : ''}.` : ''}\n\nKind regards,\nBCL Recruitment Team`}
                    value={coverLetterText}
                    onChange={e => setCoverLetterText(e.target.value)}
                    className="text-xs"
                  />
                  <p className="text-xs text-slate-400">Subject: CV Submission – {cvData.personalInfo?.fullName || 'Applicant'} – {cvData.personalInfo?.title || 'Role'}</p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1 h-9 text-sm" onClick={() => setShowSendCvModal(false)}>Cancel</Button>
                <Button
                  className="flex-1 h-9 text-sm font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={async () => {
                    const name = cvData.personalInfo?.fullName || 'Applicant';
                    const role = cvData.personalInfo?.title || '';

// Recommender is already saved when selected via RecommenderSelect component
// No need to save again here

if (sendMethod === 'whatsapp') {
                      const toSandip = sendCvRecipients.sandip;
                      const phone = toSandip ? '+254700505275' : (cvData.personalInfo?.phone || '');
                      const msg = encodeURIComponent(`Hi Sandip, please find attached the CV of ${name}${role ? ` for the ${role} position` : ''}.${recommender.name ? ` Referred by ${recommender.name}${recommender.company ? ` (${recommender.company})` : ''}.` : ''}`);
                      window.open(`https://wa.me/${phone.replace(/\D/g, '')}?text=${msg}`, '_blank');
                    } else {
                      const recipients = [
                        sendCvRecipients.sandip ? 'info@booksmartconsult.com' : '',
                        sendCvRecipients.applicant ? (cvData.personalInfo?.email || '') : '',
                        sendCvRecipients.recommender ? recommender.email : '',
                        ...thirdParties.filter(t => t.role === 'recruiter').map(t => t.email),
                      ].filter(Boolean).join(',');
                      const cc = thirdParties.filter(t => t.role !== 'recruiter').map(t => t.email).filter(Boolean).join(',');
                      const subject = encodeURIComponent(`CV Submission – ${name}${role ? ` – ${role}` : ''}`);
                      const body = encodeURIComponent(coverLetterText || `Dear Hiring Manager,\n\nPlease find attached the CV of ${name}${role ? ` for the ${role} position` : ''}.\n\nKind regards,\nBCL Recruitment Team`);
                      const ccParam = cc ? `&cc=${cc}` : '';
                      window.open(`mailto:${recipients}?subject=${subject}${ccParam}&body=${body}`, '_blank');
                    }
                    toast.success(`Opening ${sendMethod === 'whatsapp' ? 'WhatsApp' : 'email client'}…`);
                    setShowSendCvModal(false);
                  }}
                >
                  {sendMethod === 'whatsapp' ? '📱 Send via WhatsApp' : '✉️ Open Email Client'}
                </Button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
