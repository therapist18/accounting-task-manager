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
import AIWriterModule from "./components/AIWriterModule";
import ATSOptimizer from "./components/ATSOptimizer";
import JobMatch from "./components/JobMatch";
import CoverLetterGenerator from "./components/CoverLetter";
import ResumeVersions from "./components/ResumeVersions";
import ResumeAnalytics from "./components/ResumeAnalytics";
import AdvancedExport from "./components/AdvancedExport";

const PASSPORT_PHOTO_ID = '48f48255-e5db-4944-8864-6f35b3af4696';
const CLEAR_PHOTO_ID = 'fa74ff82-09ce-418d-8985-174158d73316';
const CV_DOCUMENT_ID = 'd615e776-7d32-4704-b510-62287d459fae';

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
  declaration: "",
  verifiedBadge: false
};

const COMMON_LANGUAGES = [
  'English', 'Swahili', 'French', 'Arabic', 'Mandarin', 'Spanish', 'Portuguese',
  'German', 'Italian', 'Dutch', 'Hindi', 'Urdu', 'Japanese', 'Korean', 'Russian',
  'Turkish', 'Polish', 'Swedish', 'Norwegian', 'Danish', 'Afrikaans', 'Zulu',
  'Amharic', 'Hausa', 'Yoruba', 'Igbo', 'Somali', 'Luganda', 'Kinyarwanda',
  'Shona', 'Oromo', 'Tigrinya', 'Lingala', 'Wolof'
];
const PROFICIENCY_LEVELS = ['Native', 'Fluent', 'Professional', 'Conversational', 'Basic'];

const COLOR_PRESETS = [
  { name: 'Ocean Blue',   primary: '#2c3e50', accent: '#3498db' },
  { name: 'Forest',       primary: '#1a3d2e', accent: '#27ae60' },
  { name: 'Royal Purple', primary: '#2c1654', accent: '#9b59b6' },
  { name: 'Crimson',      primary: '#4a1515', accent: '#e74c3c' },
  { name: 'Slate',        primary: '#2d3748', accent: '#64748b' },
  { name: 'Teal',         primary: '#164e4e', accent: '#0d9488' },
  { name: 'Midnight',     primary: '#0f172a', accent: '#6366f1' },
  { name: 'Copper',       primary: '#3d1f10', accent: '#d97706' },
];

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
  declaration: "I hereby declare that the above information is accurate to the best of my knowledge and reflects my professional qualifications, experience, and readiness for international employment opportunities.",
  verifiedBadge: true
};

type EnhancementLevel = "none" | "light" | "professional" | "executive";

const ENHANCEMENT_OPTIONS: { value: EnhancementLevel; label: string; description: string }[] = [
  { value: "none",         label: "None",         description: "Extract content exactly as written" },
  { value: "light",        label: "Light Polish",  description: "Fix grammar & spelling only" },
  { value: "professional", label: "Professional",  description: "Action verbs, cleaner phrasing, no invented details" },
  { value: "executive",    label: "Executive",     description: "Strategic language, leadership framing, impact-focused" },
];

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

export default function CVGeneratorPage() {
  const [cvData, setCvData] = useState<any>(() => loadFromLocalStorage('cvData', initialCVData));
  const [selectedLayout, setSelectedLayout] = useState<string>(() => loadFromLocalStorage('selectedLayout', "theme1"));
  const [zoomLevel, setZoomLevel] = useState<number>(() => loadFromLocalStorage('zoomLevel', 0.75));
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
  const photoInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const [workflowStep, setWorkflowStep] = useState<'import' | 'review-edit' | 'design-finalize'>('import');
  const [activeSection, setActiveSection] = useState('contact');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => loadFromLocalStorage('collapsedGroups', {}));
  const [showAiWriter, setShowAiWriter] = useState(false);
  const [showAtsOptimizer, setShowAtsOptimizer] = useState(false);
  const [showJobMatch, setShowJobMatch] = useState(false);
  const [showCoverLetter, setShowCoverLetter] = useState(false);
  const [showResumeVersions, setShowResumeVersions] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showAdvancedExport, setShowAdvancedExport] = useState(false);
  const [cvVersions, setCvVersions] = useState<{ id: string; name: string; data: any; createdAt: string }[]>(() => loadFromLocalStorage('cvVersions', []));
  const [activeDesignTab, setActiveDesignTab] = useState('theme');

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
    }, 500);
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current); };
  }, [cvData, cvSettings, selectedLayout, collapsedGroups, cvVersions, zoomLevel]);

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
          };

          setCvData(cleanedData);
          const enhancedLabel = enhancementLevel !== "none" ? ` (${enhancementLevel} enhancement applied)` : "";
          toast.success(`CV parsed successfully!${enhancedLabel}`);
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
    if (!pendingPhotoFile || !selectedIndividual) return;
    setIsSavingPhoto(true);
    try {
      const ext = pendingPhotoFile.name.split('.').pop() || 'jpg';
      const filePath = `individual-documents/${selectedIndividual.id}/${CLEAR_PHOTO_ID}/photo_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('kyc-documents')
        .upload(filePath, pendingPhotoFile, { upsert: true, contentType: pendingPhotoFile.type });
      if (uploadError) throw uploadError;
      await supabase.from('acc_portal_directors_documents').insert({
        director_id: selectedIndividual.id,
        document_id: CLEAR_PHOTO_ID,
        file_path: filePath,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      toast.success('Photo saved to registry');
      setShowSavePhotoPrompt(false);
      setIndividualPhoto(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${filePath}`);
    } catch (err: any) {
      toast.error(`Failed to save photo: ${err.message}`);
    } finally {
      setIsSavingPhoto(false);
    }
  };

  const saveCVToDb = async () => {
    if (!selectedIndividual) return;
    setIsSavingCv(true);
    try {
      const cvJson = JSON.stringify(cvData, null, 2);
      const blob = new Blob([cvJson], { type: 'application/json' });
      const ext = 'json';
      const filePath = `individual-documents/${selectedIndividual.id}/${CV_DOCUMENT_ID}/cv_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('kyc-documents')
        .upload(filePath, blob, { upsert: true, contentType: 'application/json' });
      if (uploadError) throw uploadError;
      await supabase.from('acc_portal_directors_documents').insert({
        director_id: selectedIndividual.id,
        document_id: CV_DOCUMENT_ID,
        file_path: filePath,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      toast.success('CV saved to database successfully');
      setShowSaveCvPrompt(false);
    } catch (err: any) {
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
      const originalStyle = element.style.transform;
      element.style.transform = "none";

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        scrollX: 0,
        scrollY: 0,
      });
      element.style.transform = originalStyle;

      const imgData = canvas.toDataURL("image/jpeg", 1.0);
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const imgHeight = (canvasHeight * pageWidth) / canvasWidth;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "JPEG", 0, position, pageWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, pageWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const fileName = `${(cvData.personalInfo.fullName || "CV").replace(/\s+/g, "_")}_CV.pdf`;
      pdf.save(fileName);
      toast.success("PDF downloaded successfully!");
    } catch (error: any) {
      console.error("PDF generation failed", error);
      toast.error("PDF generation failed. Please try again.");
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleDownloadDocx = () => {
    try {
      exportToDocx(cvData);
      toast.success("Word document (.docx) generated successfully!");
    } catch (e: any) {
      console.error(e);
      toast.error("Failed to generate Word document.");
    }
  };

  const renderLayout = () => {
    const {
      personalInfo = {},
      personalDetails = {},
      summary = "",
      skills = [],
      experience = [],
      internships = [],
      projects = [],
      education = [],
      references = [],
      languages = [],
      certifications = [],
      achievements = [],
      additionalInfo = [],
      declaration = "",
      verifiedBadge = false
    } = cvData;

    const photoShapeStyle: React.CSSProperties = {
      borderRadius: cvSettings.photoShape === 'circle' ? '50%' : cvSettings.photoShape === 'rounded' ? '12px' : '0',
    };
    const fontScaleStyle: React.CSSProperties = { fontSize: `${cvSettings.fontScale}em`, fontFamily: (cvSettings as any).fontFamily || 'Inter, sans-serif' };

    if (selectedLayout === "theme1") {
      const acc = cvSettings.accentColor;
      const pri = cvSettings.primaryColor;
      return (
        <div className="w-[210mm] min-h-[297mm] bg-white text-[#333] grid grid-cols-[280px_1fr] relative shadow-2xl text-left font-sans leading-normal" style={fontScaleStyle}>
          {/* Sidebar */}
          <aside style={{ backgroundColor: pri }} className="text-[#ecf0f1] p-[20px_15px] flex flex-col gap-6">
            {(cvSettings as any).showPhoto !== false && (
              <div
                style={{ width: cvSettings.photoSize, height: cvSettings.photoSize, borderColor: acc, ...photoShapeStyle }}
                className="bg-white border-[3px] mx-auto flex items-center justify-center overflow-hidden"
              >
                <img
                  src={personalInfo.photoUrl || "https://via.placeholder.com/150x150?text=Photo"}
                  alt="Profile"
                  style={{ objectFit: cvSettings.photoFit, width: '100%', height: '100%' }}
                />
              </div>
            )}

            <div>
              <div style={{ color: acc, borderColor: `${acc}55` }} className="text-[11px] font-extrabold uppercase tracking-[1.5px] border-b pb-1.5 mb-3">Contact Information</div>
              <div className="space-y-2 text-[11px]">
                <div className="flex items-center gap-2"><span style={{ color: acc }} className="font-bold">📍</span> <span className={!personalInfo.location ? "italic opacity-50" : ""}>{personalInfo.location || "Location"}</span></div>
                <div className="flex items-center gap-2"><span style={{ color: acc }} className="font-bold">📞</span> <span className={!personalInfo.phone ? "italic opacity-50" : ""}>{personalInfo.phone || "Phone"}</span></div>
                <div className="flex items-center gap-2"><span style={{ color: acc }} className="font-bold">✉️</span> <span className={!personalInfo.email ? "italic opacity-50" : ""}>{personalInfo.email || "Email"}</span></div>
                <div className="flex items-center gap-2"><span style={{ color: acc }} className="font-bold">🐙</span> <span className={`break-all ${!personalInfo.github ? "italic opacity-50" : ""}`}>{personalInfo.github || "GitHub"}</span></div>
                <div className="flex items-center gap-2"><span style={{ color: acc }} className="font-bold">🔗</span> <span className={`break-all ${!personalInfo.linkedin ? "italic opacity-50" : ""}`}>{personalInfo.linkedin || "LinkedIn"}</span></div>
              </div>
            </div>

            <div>
              <div style={{ color: acc, borderColor: `${acc}55` }} className="text-[11px] font-extrabold uppercase tracking-[1.5px] border-b pb-1.5 mb-3">Personal Details</div>
              <div className="space-y-2 text-[11px]">
                <div><strong style={{ color: acc }}>Date of Birth:</strong> <span className={!personalDetails.dateOfBirth ? "italic opacity-50" : ""}>{personalDetails.dateOfBirth || "—"}</span></div>
                <div><strong style={{ color: acc }}>Nationality:</strong> <span className={!personalDetails.nationality ? "italic opacity-50" : ""}>{personalDetails.nationality || "—"}</span></div>
                <div><strong style={{ color: acc }}>Marital Status:</strong> <span className={!personalDetails.maritalStatus ? "italic opacity-50" : ""}>{personalDetails.maritalStatus || "—"}</span></div>
                <div><strong style={{ color: acc }}>Residence:</strong> <span className={!personalDetails.residence ? "italic opacity-50" : ""}>{personalDetails.residence || "—"}</span></div>
                <div><strong style={{ color: acc }}>Kenya Status:</strong> <span className={!personalDetails.kenyaStatus ? "italic opacity-50" : ""}>{personalDetails.kenyaStatus || "—"}</span></div>
                <div><strong style={{ color: acc }}>Nairobi Res:</strong> <span className={!personalDetails.nairobiRes ? "italic opacity-50" : ""}>{personalDetails.nairobiRes || "—"}</span></div>
                <div><strong style={{ color: acc }}>Driving:</strong> <span className={!personalDetails.drivingExperience ? "italic opacity-50" : ""}>{personalDetails.drivingExperience || "—"}</span></div>
              </div>
            </div>

            <div>
              <div style={{ color: acc, borderColor: `${acc}55` }} className="text-[11px] font-extrabold uppercase tracking-[1.5px] border-b pb-1.5 mb-3">Core Competencies</div>
              {skills.length > 0 ? (
                <div className="space-y-4">
                  {skills.map((grp: any, idx: number) => (
                    <div key={idx}>
                      <div className="text-white font-bold text-[10px] underline underline-offset-4 mb-1.5">{grp.category}</div>
                      <div className="text-[10px] leading-relaxed opacity-90">{grp.items}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] italic opacity-60">No skills added yet.</p>
              )}
            </div>

            <div>
              <div style={{ color: acc, borderColor: `${acc}55` }} className="text-[11px] font-extrabold uppercase tracking-[1.5px] border-b pb-1.5 mb-3">Languages</div>
              {languages.length > 0 ? (
                <div className="space-y-1.5 text-[11px]">
                  {languages.map((l: any, idx: number) => (
                    <div key={idx}>{l.language} {l.proficiency ? `(${l.proficiency})` : ""}</div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] italic opacity-60">No languages added yet.</p>
              )}
            </div>

            {additionalInfo.length > 0 && (
              <div>
                <div style={{ color: acc, borderColor: `${acc}55` }} className="text-[11px] font-extrabold uppercase tracking-[1.5px] border-b pb-1.5 mb-3">Additional Info</div>
                <div className="space-y-1.5 text-[11px]">
                  {additionalInfo.map((info: any, idx: number) => (
                    <div key={idx}><strong>{info.label}:</strong> {info.value}</div>
                  ))}
                </div>
              </div>
            )}
          </aside>

          {/* Main Area */}
          <main className="p-8 flex flex-col gap-6">
            <div style={{ borderColor: pri }} className="border-b-4 pb-5">
              <h1 style={{ color: pri }} className="text-4xl font-extrabold uppercase tracking-tight">{personalInfo.fullName || "Your Name"}</h1>
              <div style={{ color: acc }} className="text-lg font-bold uppercase tracking-wide mt-1.5">{personalInfo.title || "Professional Title"}</div>
            </div>

            <div>
              <div style={{ borderLeftColor: acc, color: pri, backgroundColor: `${acc}18` }} className="border-l-[5px] p-2 px-4 text-[13px] font-extrabold uppercase mb-3">Professional Profile</div>
              {summary ? (
                <p className="text-[12px] leading-relaxed text-justify">{summary}</p>
              ) : (
                <p className="text-[11px] italic text-gray-400">No profile summary added yet.</p>
              )}
            </div>

            <div>
              <div style={{ borderLeftColor: acc, color: pri, backgroundColor: `${acc}18` }} className="border-l-[5px] p-2 px-4 text-[13px] font-extrabold uppercase mb-4">Professional Experience</div>
              {experience.length > 0 ? (
                <div className="space-y-5">
                  {experience.map((exp: any, idx: number) => (
                    <div key={idx}>
                      <div className="flex justify-between font-extrabold text-[13px] text-black">
                        <span>{exp.company}</span>
                        <span>{exp.startDate} – {exp.endDate}</span>
                      </div>
                      <div style={{ color: acc }} className="text-[12px] font-semibold mt-0.5">{exp.role} {exp.location ? `| ${exp.location}` : ""}</div>
                      {exp.companyDesc && <span className="text-[10.5px] text-gray-500 italic block mt-1 mb-2">{exp.companyDesc}</span>}
                      <ul className="list-disc pl-5 text-[11.5px] leading-relaxed text-gray-700 mt-2 space-y-1">
                        {Array.isArray(exp.responsibilities) ? exp.responsibilities.map((resp: string, rIdx: number) => (
                          <li key={rIdx}>{resp}</li>
                        )) : <li>{exp.responsibilities}</li>}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] italic text-gray-400">No work experience added yet.</p>
              )}
            </div>

            <div>
              <div style={{ borderLeftColor: acc, color: pri, backgroundColor: `${acc}18` }} className="border-l-[5px] p-2 px-4 text-[13px] font-extrabold uppercase mb-4">Internships</div>
              {internships.length > 0 ? (
                <div className="space-y-4">
                  {internships.map((intern: any, idx: number) => (
                    <div key={idx}>
                      <div className="flex justify-between font-extrabold text-[13px] text-black">
                        <span>{intern.company}</span>
                        <span>{intern.startDate} – {intern.endDate}</span>
                      </div>
                      <div style={{ color: acc }} className="text-[12px] font-semibold mt-0.5">{intern.role} {intern.location ? `| ${intern.location}` : ""}</div>
                      {intern.companyDesc && <span className="text-[10.5px] text-gray-500 italic block mt-1 mb-1">{intern.companyDesc}</span>}
                      <ul className="list-disc pl-5 text-[11.5px] leading-relaxed text-gray-700 mt-1 space-y-1">
                        {Array.isArray(intern.responsibilities) ? intern.responsibilities.map((resp: string, rIdx: number) => (
                          <li key={rIdx}>{resp}</li>
                        )) : <li>{intern.responsibilities}</li>}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] italic text-gray-400">No internships added yet.</p>
              )}
            </div>

            <div>
              <div style={{ borderLeftColor: acc, color: pri, backgroundColor: `${acc}18` }} className="border-l-[5px] p-2 px-4 text-[13px] font-extrabold uppercase mb-3">Key Projects</div>
              {projects.length > 0 ? (
                <div className="grid grid-cols-2 gap-3.5">
                  {projects.map((proj: any, idx: number) => (
                    <div key={idx} className="border border-gray-100 p-3 rounded shadow-sm bg-white">
                      <strong style={{ color: pri }} className="text-[12px] block mb-1">{proj.title} {proj.year ? `(${proj.year})` : ""}</strong>
                      <p className="text-[10.5px] text-gray-600 leading-normal">{proj.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] italic text-gray-400">No projects added yet.</p>
              )}
            </div>

            <div>
              <div style={{ borderLeftColor: acc, color: pri, backgroundColor: `${acc}18` }} className="border-l-[5px] p-2 px-4 text-[13px] font-extrabold uppercase mb-3">Education</div>
              {education.length > 0 ? (
                <div className="space-y-2">
                  {education.map((edu: any, idx: number) => (
                    <div key={idx} className="text-[11.5px]">
                      <strong>{edu.degree}</strong> – {edu.institution} ({edu.year})
                      {edu.details && <p className="text-[10.5px] text-gray-500 mt-0.5">{edu.details}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] italic text-gray-400">No education added yet.</p>
              )}
            </div>

            {certifications.length > 0 && (
              <div>
                <div style={{ borderLeftColor: acc, color: pri, backgroundColor: `${acc}18` }} className="border-l-[5px] p-2 px-4 text-[13px] font-extrabold uppercase mb-3">Certifications</div>
                <div className="space-y-2">
                  {certifications.map((cert: any, idx: number) => (
                    <div key={idx} className="text-[11.5px]">
                      <strong>{cert.name}</strong> – {cert.issuer} {cert.date ? `(${cert.date})` : ""}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {achievements.length > 0 && (
              <div>
                <div style={{ borderLeftColor: acc, color: pri, backgroundColor: `${acc}18` }} className="border-l-[5px] p-2 px-4 text-[13px] font-extrabold uppercase mb-3">Achievements</div>
                <div className="space-y-2">
                  {achievements.map((ach: any, idx: number) => (
                    <div key={idx} className="text-[11.5px]">
                      <strong>{ach.title}</strong> {ach.date ? `(${ach.date})` : ""}
                      {ach.description && <p className="text-[10.5px] text-gray-500 mt-0.5">{ach.description}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div style={{ borderLeftColor: acc, color: pri, backgroundColor: `${acc}18` }} className="border-l-[5px] p-2 px-4 text-[13px] font-extrabold uppercase mb-3">References</div>
              {references.length > 0 ? (
                <div className="grid grid-cols-2 gap-4">
                  {references.map((ref: any, idx: number) => (
                    <div key={idx} className="text-[11px] text-gray-700 leading-relaxed">
                      <strong className="text-black text-[12px] block">{ref.name}</strong>
                      {ref.title} | {ref.company}<br />
                      {ref.address && <span>{ref.address}<br /></span>}
                      <span style={{ color: acc }}>{ref.contact}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] italic text-gray-400">No references added yet.</p>
              )}
            </div>

            {declaration && (
              <div className="border-t border-gray-100 pt-4 mt-4">
                <p className="text-[10px] italic text-gray-500 leading-relaxed">{declaration}</p>
                {verifiedBadge && (
                  <div style={{ backgroundColor: acc }} className="inline-flex items-center gap-1.5 text-white p-1 px-3 rounded text-[10px] font-extrabold uppercase mt-3">
                    ✓ CV Verified & Up-to-date 2026
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      );
    } else if (selectedLayout === "theme2") {
      // THEME 2: Modern Top-Header Layout
      const acc2 = cvSettings.accentColor;
      const pri2 = cvSettings.primaryColor;
      return (
        <div className="w-[210mm] min-h-[297mm] bg-white text-slate-800 relative shadow-2xl text-left font-sans leading-normal" style={fontScaleStyle}>
          {/* Elegant Top Header with dynamic colors */}
          <header style={{ background: `linear-gradient(to right, ${pri2}, ${pri2}dd)`, borderBottomColor: acc2 }} className="text-white p-8 border-b-4 flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight">{personalInfo.fullName || "Your Name"}</h1>
              <div style={{ color: acc2 }} className="text-lg font-bold uppercase tracking-wider mt-1">{personalInfo.title || "Professional Title"}</div>
            </div>
            <div className="text-right text-xs space-y-1 text-slate-300">
              <div>✉️ <span className={!personalInfo.email ? "italic opacity-50" : ""}>{personalInfo.email || "Email"}</span></div>
              <div>📞 <span className={!personalInfo.phone ? "italic opacity-50" : ""}>{personalInfo.phone || "Phone"}</span></div>
              <div>📍 <span className={!personalInfo.location ? "italic opacity-50" : ""}>{personalInfo.location || "Location"}</span></div>
              <div style={{ color: acc2 }} className="flex gap-2 justify-end mt-1">
                <span className={`underline break-all ${!personalInfo.linkedin ? "italic opacity-50" : ""}`}>{personalInfo.linkedin || "LinkedIn"}</span>
                <span className={`underline break-all ${!personalInfo.github ? "italic opacity-50" : ""}`}>{personalInfo.github || "GitHub"}</span>
              </div>
            </div>
          </header>

          <div className="grid grid-cols-[2fr_1fr] gap-6 p-8">
            {/* Left Area (Core details) */}
            <div className="space-y-6">
              <section>
                <h2 className="text-base font-bold text-slate-900 uppercase border-b-2 border-slate-200 pb-1.5 mb-3">Professional Profile</h2>
                {summary ? (
                  <p className="text-[12px] leading-relaxed text-slate-600 text-justify">{summary}</p>
                ) : (
                  <p className="text-[11px] italic text-slate-400">No profile summary added yet.</p>
                )}
              </section>

              <section>
                <h2 className="text-base font-bold text-slate-900 uppercase border-b-2 border-slate-200 pb-1.5 mb-4">Professional Experience</h2>
                {experience.length > 0 ? (
                  <div className="space-y-5">
                    {experience.map((exp: any, idx: number) => (
                      <div key={idx} className="relative pl-4 border-l border-slate-200">
                        <div style={{ backgroundColor: acc2 }} className="absolute -left-1.5 top-1.5 w-3 h-3 rounded-full" />
                        <div className="flex justify-between font-bold text-[13px] text-slate-900">
                          <span>{exp.company}</span>
                          <span className="text-slate-500 font-semibold">{exp.startDate} – {exp.endDate}</span>
                        </div>
                        <div style={{ color: acc2 }} className="text-[12px] font-semibold mt-0.5">{exp.role} {exp.location ? `| ${exp.location}` : ""}</div>
                        {exp.companyDesc && <p className="text-[10.5px] text-slate-400 italic mt-0.5">{exp.companyDesc}</p>}
                        <ul className="list-disc pl-4 text-[11.5px] text-slate-600 mt-2 space-y-1">
                          {Array.isArray(exp.responsibilities) ? exp.responsibilities.map((resp: string, rIdx: number) => (
                            <li key={rIdx}>{resp}</li>
                          )) : <li>{exp.responsibilities}</li>}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] italic text-slate-400">No work experience added yet.</p>
                )}
              </section>

              <section>
                <h2 className="text-base font-bold text-slate-900 uppercase border-b-2 border-slate-200 pb-1.5 mb-4">Internships</h2>
                {internships.length > 0 ? (
                  <div className="space-y-4">
                    {internships.map((intern: any, idx: number) => (
                      <div key={idx} className="relative pl-4 border-l border-slate-200">
                        <div className="absolute -left-1.5 top-1.5 w-3 h-3 rounded-full bg-slate-400" />
                        <div className="flex justify-between font-bold text-[13px] text-slate-900">
                          <span>{intern.company}</span>
                          <span className="text-slate-500 font-semibold">{intern.startDate} – {intern.endDate}</span>
                        </div>
                        <div className="text-slate-600 text-[12px] font-semibold mt-0.5">{intern.role} {intern.location ? `| ${intern.location}` : ""}</div>
                        {intern.companyDesc && <p className="text-[10.5px] text-slate-400 italic mt-0.5">{intern.companyDesc}</p>}
                        <ul className="list-disc pl-4 text-[11.5px] text-slate-600 mt-1 space-y-1">
                          {Array.isArray(intern.responsibilities) ? intern.responsibilities.map((resp: string, rIdx: number) => (
                            <li key={rIdx}>{resp}</li>
                          )) : <li>{intern.responsibilities}</li>}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] italic text-slate-400">No internships added yet.</p>
                )}
              </section>

              <section>
                <h2 className="text-base font-bold text-slate-900 uppercase border-b-2 border-slate-200 pb-1.5 mb-3">Key Projects</h2>
                {projects.length > 0 ? (
                  <div className="space-y-3">
                    {projects.map((proj: any, idx: number) => (
                      <div key={idx} className="text-[11.5px]">
                        <strong className="text-slate-800 text-[12px]">{proj.title} {proj.year ? `(${proj.year})` : ""}</strong>
                        <p className="text-slate-500 mt-0.5">{proj.description}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] italic text-slate-400">No projects added yet.</p>
                )}
              </section>
            </div>

            {/* Right Area (Sidebar / Meta) */}
            <div className="space-y-6 bg-slate-50 p-5 rounded border border-slate-100">
              <section>
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1.5 mb-3">Core Competencies</h2>
                {skills.length > 0 ? (
                  <div className="space-y-4">
                    {skills.map((grp: any, idx: number) => (
                      <div key={idx}>
                        <div className="font-bold text-[11px] text-slate-800 mb-1">{grp.category}</div>
                        <div className="text-[10.5px] leading-relaxed text-slate-500">{grp.items}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] italic text-slate-400">No skills added yet.</p>
                )}
              </section>

              <section>
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1.5 mb-3">Personal Details</h2>
                <div className="space-y-2 text-[10.5px] text-slate-600">
                  <div><strong>D.O.B:</strong> <span className={!personalDetails.dateOfBirth ? "italic text-slate-400" : ""}>{personalDetails.dateOfBirth || "—"}</span></div>
                  <div><strong>Nationality:</strong> <span className={!personalDetails.nationality ? "italic text-slate-400" : ""}>{personalDetails.nationality || "—"}</span></div>
                  <div><strong>Status:</strong> <span className={!personalDetails.maritalStatus ? "italic text-slate-400" : ""}>{personalDetails.maritalStatus || "—"}</span></div>
                  <div><strong>Residence:</strong> <span className={!personalDetails.residence ? "italic text-slate-400" : ""}>{personalDetails.residence || "—"}</span></div>
                  <div><strong>Kenya Work Status:</strong> <span className={!personalDetails.kenyaStatus ? "italic text-slate-400" : ""}>{personalDetails.kenyaStatus || "—"}</span></div>
                  <div><strong>Nairobi Res:</strong> <span className={!personalDetails.nairobiRes ? "italic text-slate-400" : ""}>{personalDetails.nairobiRes || "—"}</span></div>
                  <div><strong>Driving:</strong> <span className={!personalDetails.drivingExperience ? "italic text-slate-400" : ""}>{personalDetails.drivingExperience || "—"}</span></div>
                </div>
              </section>

              <section>
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1.5 mb-3">Education</h2>
                {education.length > 0 ? (
                  <div className="space-y-3">
                    {education.map((edu: any, idx: number) => (
                      <div key={idx} className="text-[11px] text-slate-600">
                        <strong className="text-slate-800 block">{edu.degree}</strong>
                        {edu.institution} ({edu.year})
                        {edu.details && <p className="text-[9.5px] text-slate-400 mt-0.5">{edu.details}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] italic text-slate-400">No education added yet.</p>
                )}
              </section>

              {certifications.length > 0 && (
                <section>
                  <h2 className="text-xs font-bold text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1.5 mb-3">Certifications</h2>
                  <div className="space-y-2 text-[10.5px] text-slate-600">
                    {certifications.map((cert: any, idx: number) => (
                      <div key={idx}><strong className="text-slate-800">{cert.name}</strong> – {cert.issuer} {cert.date ? `(${cert.date})` : ""}</div>
                    ))}
                  </div>
                </section>
              )}

              {achievements.length > 0 && (
                <section>
                  <h2 className="text-xs font-bold text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1.5 mb-3">Achievements</h2>
                  <div className="space-y-2 text-[10.5px] text-slate-600">
                    {achievements.map((ach: any, idx: number) => (
                      <div key={idx}><strong className="text-slate-800">{ach.title}</strong> {ach.date ? `(${ach.date})` : ""}{ach.description ? `: ${ach.description}` : ""}</div>
                    ))}
                  </div>
                </section>
              )}

              {additionalInfo.length > 0 && (
                <section>
                  <h2 className="text-xs font-bold text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1.5 mb-3">Additional Info</h2>
                  <div className="space-y-1 text-[10.5px] text-slate-600">
                    {additionalInfo.map((info: any, idx: number) => (
                      <div key={idx}><strong className="text-slate-800">{info.label}:</strong> {info.value}</div>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1.5 mb-2">Languages</h2>
                {languages.length > 0 ? (
                  <div className="text-[10.5px] text-slate-600 space-y-1">
                    {languages.map((l: any, idx: number) => (
                      <div key={idx} className="flex justify-between">
                        <span className="font-semibold">{l.language}</span>
                        <span className="text-slate-400">{l.proficiency}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] italic text-slate-400">No languages added yet.</p>
                )}
              </section>

              <section>
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1.5 mb-3">References</h2>
                {references.length > 0 ? (
                  <div className="space-y-3 text-[10.5px] text-slate-600">
                    {references.map((ref: any, idx: number) => (
                      <div key={idx}>
                        <strong className="text-slate-800 block">{ref.name}</strong>
                        <span className="block italic text-[9.5px]">{ref.title} | {ref.company}</span>
                        <span style={{ color: acc2 }} className="break-all">{ref.contact}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] italic text-slate-400">No references added yet.</p>
                )}
              </section>
            </div>
          </div>

          {declaration && (
            <div className="p-8 pt-0 border-t border-slate-100 mt-4 text-[10px] italic text-slate-400">
              <p>{declaration}</p>
              {verifiedBadge && (
                <div style={{ backgroundColor: acc2 }} className="inline-flex items-center gap-1.5 text-white p-0.5 px-2.5 rounded text-[9px] font-extrabold uppercase mt-2">
                  Verified CV
                </div>
              )}
            </div>
          )}
        </div>
      );
    } else if (selectedLayout === "theme3") {
      // THEME 3: Minimalist Single Column Layout
      return (
        <div className="w-[210mm] min-h-[297mm] bg-white text-slate-800 p-12 relative shadow-2xl text-left font-serif leading-relaxed" style={fontScaleStyle}>
          {/* Centered Minimal Header */}
          <div className="text-center border-b border-slate-900 pb-6 mb-8">
            <h1 className="text-4xl font-normal tracking-wide text-slate-900">{personalInfo.fullName || "Your Name"}</h1>
            <div className="text-sm font-semibold tracking-widest text-slate-500 uppercase mt-2">{personalInfo.title || "Professional Title"}</div>

            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-600 mt-4 font-sans">
              {personalInfo.location && <span>📍 {personalInfo.location}</span>}
              {personalInfo.phone && <span>• 📞 {personalInfo.phone}</span>}
              {personalInfo.email && <span>• ✉️ {personalInfo.email}</span>}
              {personalInfo.github && <span>• 🐙 {personalInfo.github}</span>}
              {personalInfo.linkedin && <span>• 🔗 {personalInfo.linkedin}</span>}
            </div>
          </div>

          <div className="space-y-6">
            <section>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1 mb-2 font-sans">Profile</h2>
              {summary ? (
                <p className="text-[12px] leading-relaxed text-slate-700 text-justify font-sans">{summary}</p>
              ) : (
                <p className="text-[11px] italic text-slate-400 font-sans">No profile summary added yet.</p>
              )}
            </section>

            <section>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1 mb-3 font-sans">Experience</h2>
              {experience.length > 0 ? (
                <div className="space-y-4">
                  {experience.map((exp: any, idx: number) => (
                    <div key={idx} className="font-sans">
                      <div className="flex justify-between font-bold text-[12px] text-slate-900">
                        <span>{exp.company} {exp.location ? `(${exp.location})` : ""}</span>
                        <span className="font-normal text-slate-500">{exp.startDate} – {exp.endDate}</span>
                      </div>
                      <div className="text-[11.5px] italic text-slate-600 mt-0.5">{exp.role}</div>
                      {exp.companyDesc && <p className="text-[10px] text-slate-400 italic mt-0.5">{exp.companyDesc}</p>}
                      <ul className="list-disc pl-5 text-[11px] text-slate-600 mt-1.5 space-y-1">
                        {Array.isArray(exp.responsibilities) ? exp.responsibilities.map((resp: string, rIdx: number) => (
                          <li key={rIdx}>{resp}</li>
                        )) : <li>{exp.responsibilities}</li>}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] italic text-slate-400 font-sans">No work experience added yet.</p>
              )}
            </section>

            <section>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1 mb-3 font-sans">Skills</h2>
              {skills.length > 0 ? (
                <div className="space-y-2 font-sans text-[11px]">
                  {skills.map((grp: any, idx: number) => (
                    <div key={idx} className="grid grid-cols-[180px_1fr] gap-4">
                      <strong className="text-slate-800">{grp.category}</strong>
                      <span className="text-slate-600">{grp.items}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] italic text-slate-400 font-sans">No skills added yet.</p>
              )}
            </section>

            <section>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1 mb-2 font-sans">Education</h2>
              {education.length > 0 ? (
                <div className="space-y-2 font-sans">
                  {education.map((edu: any, idx: number) => (
                    <div key={idx} className="text-[11.5px] flex justify-between">
                      <div>
                        <strong>{edu.degree}</strong> – <span className="text-slate-600">{edu.institution}</span>
                        {edu.details && <p className="text-[10px] text-slate-400 mt-0.5">{edu.details}</p>}
                      </div>
                      <span className="text-slate-500">{edu.year}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] italic text-slate-400 font-sans">No education added yet.</p>
              )}
            </section>

            {certifications.length > 0 && (
              <section>
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1 mb-2 font-sans">Certifications</h2>
                <div className="font-sans text-[11.5px] space-y-1 text-slate-600">
                  {certifications.map((cert: any, idx: number) => (
                    <div key={idx}><strong>{cert.name}</strong> – {cert.issuer} {cert.date ? `(${cert.date})` : ""}</div>
                  ))}
                </div>
              </section>
            )}

            {achievements.length > 0 && (
              <section>
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1 mb-2 font-sans">Achievements</h2>
                {achievements.map((ach: any, idx: number) => (
                  <div key={idx} className="font-sans text-[11.5px] text-slate-600">
                    <strong>{ach.title}</strong> {ach.date ? `(${ach.date})` : ""}
                    {ach.description && <p className="text-[10px] text-slate-400">{ach.description}</p>}
                  </div>
                ))}
              </section>
            )}

            {additionalInfo.length > 0 && (
              <section>
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1 mb-2 font-sans">Additional Info</h2>
                <div className="font-sans text-[11.5px] space-y-1 text-slate-600">
                  {additionalInfo.map((info: any, idx: number) => (
                    <div key={idx}><strong>{info.label}:</strong> {info.value}</div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1 mb-2 font-sans">References</h2>
              {references.length > 0 ? (
                <div className="grid grid-cols-2 gap-4 font-sans text-[11px] text-slate-600">
                  {references.map((ref: any, idx: number) => (
                    <div key={idx}>
                      <strong className="text-slate-900 block">{ref.name}</strong>
                      {ref.title} | {ref.company}<br />
                      <span className="text-slate-400">{ref.contact}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] italic text-slate-400 font-sans">No references added yet.</p>
              )}
            </section>

            {declaration && (
              <div className="pt-4 border-t border-slate-100 mt-6 font-sans text-[10px] text-slate-400 text-center italic">
                <p>{declaration}</p>
              </div>
            )}
          </div>
        </div>
      );
    } else {
      // THEME 4: Executive Layout
      const acc = cvSettings.accentColor;
      const pri = cvSettings.primaryColor;
      return (
        <div className="w-[210mm] min-h-[297mm] bg-white relative shadow-2xl text-left font-sans leading-normal" style={fontScaleStyle}>
          {/* Bold top banner */}
          <header style={{ backgroundColor: pri, borderBottomColor: acc }} className="text-white border-b-4">
            <div className="p-8 pb-4">
              <h1 className="text-4xl font-extrabold tracking-tight">{personalInfo.fullName || "Your Name"}</h1>
              <div style={{ color: acc }} className="text-lg font-semibold tracking-wide mt-1 uppercase">{personalInfo.title || "Professional Title"}</div>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs px-8 pb-4 text-slate-300" style={{ backgroundColor: `${pri}dd` }}>
              {personalInfo.email && <span>✉ {personalInfo.email}</span>}
              {personalInfo.phone && <span>📞 {personalInfo.phone}</span>}
              {personalInfo.location && <span>📍 {personalInfo.location}</span>}
              {personalInfo.linkedin && <span>🔗 {personalInfo.linkedin}</span>}
              {personalInfo.github && <span>🐙 {personalInfo.github}</span>}
            </div>
          </header>

          <div className="p-8 grid grid-cols-[1fr_280px] gap-8">
            <div className="space-y-6">
              <section>
                <h2 style={{ borderBottomColor: acc, color: pri }} className="text-lg font-extrabold uppercase border-b-2 pb-1 mb-3">Executive Profile</h2>
                {summary ? <p className="text-[12px] leading-relaxed text-slate-700 text-justify">{summary}</p> : <p className="text-[11px] italic text-slate-400">No profile summary.</p>}
              </section>

              <section>
                <h2 style={{ borderBottomColor: acc, color: pri }} className="text-lg font-extrabold uppercase border-b-2 pb-1 mb-4">Leadership Experience</h2>
                {experience.length > 0 ? (
                  <div className="space-y-5">
                    {experience.map((exp: any, idx: number) => (
                      <div key={idx} className="border-l-2 pl-4" style={{ borderLeftColor: acc }}>
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-bold text-[14px] text-slate-900">{exp.role}</div>
                            <div className="text-[12px] text-slate-500 font-semibold">{exp.company} {exp.location ? `— ${exp.location}` : ""}</div>
                          </div>
                          <div style={{ color: acc }} className="text-[11px] font-bold whitespace-nowrap">{exp.startDate} – {exp.endDate}</div>
                        </div>
                        {exp.companyDesc && <p className="text-[10.5px] text-slate-400 italic mt-1">{exp.companyDesc}</p>}
                        <ul className="list-disc pl-5 text-[11.5px] text-slate-600 mt-2 space-y-1">
                          {Array.isArray(exp.responsibilities) ? exp.responsibilities.map((resp: string, rIdx: number) => (
                            <li key={rIdx}>{resp}</li>
                          )) : <li>{exp.responsibilities}</li>}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-[11px] italic text-slate-400">No experience added.</p>}
              </section>

              <section>
                <h2 style={{ borderBottomColor: acc, color: pri }} className="text-lg font-extrabold uppercase border-b-2 pb-1 mb-3">Key Projects & Impact</h2>
                {projects.length > 0 ? (
                  <div className="space-y-3">
                    {projects.map((proj: any, idx: number) => (
                      <div key={idx} className="text-[12px]"><strong className="text-slate-800">{proj.title}</strong> {proj.year ? `(${proj.year})` : ""} — <span className="text-slate-600">{proj.description}</span></div>
                    ))}
                  </div>
                ) : <p className="text-[11px] italic text-slate-400">No projects added.</p>}
              </section>

              <section>
                <h2 style={{ borderBottomColor: acc, color: pri }} className="text-lg font-extrabold uppercase border-b-2 pb-1 mb-3">Education</h2>
                {education.length > 0 ? (
                  <div className="space-y-2">
                    {education.map((edu: any, idx: number) => (
                      <div key={idx} className="text-[12px]"><strong>{edu.degree}</strong> — {edu.institution} ({edu.year}){edu.details ? ` — ${edu.details}` : ""}</div>
                    ))}
                  </div>
                ) : <p className="text-[11px] italic text-slate-400">No education added.</p>}
              </section>
            </div>

            <aside className="space-y-5">
              <div className="text-center">
                {(cvSettings as any).showPhoto !== false && (
                  <div style={{ width: 120, height: 120, borderRadius: '50%', borderColor: acc, objectFit: cvSettings.photoFit }} className="mx-auto border-2 overflow-hidden mb-3">
                    <img src={personalInfo.photoUrl || "https://via.placeholder.com/120"} alt="Profile" className="w-full h-full" style={{ objectFit: cvSettings.photoFit }} />
                  </div>
                )}
              </div>

              <div>
                <h3 style={{ color: acc, borderBottomColor: acc }} className="text-xs font-extrabold uppercase tracking-wider border-b pb-1 mb-2">Core Competencies</h3>
                {skills.length > 0 ? skills.map((grp: any, idx: number) => (
                  <div key={idx} className="mb-2"><div className="text-[11px] font-bold text-slate-700">{grp.category}</div><div className="text-[10px] text-slate-500">{grp.items}</div></div>
                )) : <p className="text-[10px] italic text-slate-400">No skills.</p>}
              </div>

              <div>
                <h3 style={{ color: acc, borderBottomColor: acc }} className="text-xs font-extrabold uppercase tracking-wider border-b pb-1 mb-2">Languages</h3>
                {languages.length > 0 ? languages.map((l: any, idx: number) => (
                  <div key={idx} className="text-[11px] text-slate-600">{l.language} — {l.proficiency}</div>
                )) : <p className="text-[10px] italic text-slate-400">No languages.</p>}
              </div>

              {certifications.length > 0 && (
                <div>
                  <h3 style={{ color: acc, borderBottomColor: acc }} className="text-xs font-extrabold uppercase tracking-wider border-b pb-1 mb-2">Certifications</h3>
                  {certifications.map((c: any, idx: number) => (
                    <div key={idx} className="text-[11px] text-slate-600"><strong>{c.name}</strong> — {c.issuer}</div>
                  ))}
                </div>
              )}

              {additionalInfo.length > 0 && (
                <div>
                  <h3 style={{ color: acc, borderBottomColor: acc }} className="text-xs font-extrabold uppercase tracking-wider border-b pb-1 mb-2">Details</h3>
                  {additionalInfo.map((info: any, idx: number) => (
                    <div key={idx} className="text-[11px] text-slate-600"><strong>{info.label}:</strong> {info.value}</div>
                  ))}
                </div>
              )}

              <div>
                <h3 style={{ color: acc, borderBottomColor: acc }} className="text-xs font-extrabold uppercase tracking-wider border-b pb-1 mb-2">References</h3>
                {references.length > 0 ? references.map((ref: any, idx: number) => (
                  <div key={idx} className="text-[11px] text-slate-600 mb-2"><strong>{ref.name}</strong><br />{ref.title} | {ref.company}<br /><span style={{ color: acc }}>{ref.contact}</span></div>
                )) : <p className="text-[10px] italic text-slate-400">No references.</p>}
              </div>

              {declaration && (
                <div className="text-[9px] italic text-slate-400 border-t border-slate-200 pt-2 mt-4">{declaration}</div>
              )}
            </aside>
          </div>
        </div>
      );
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#FAFAFC]">
      {/* HEADER with workflow steps */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-custom-blue flex items-center justify-center">
            <FileText className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900">CV Builder</h1>
            <p className="text-[10px] text-slate-500">Import → Review & Edit → Design & Finalize</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-100 rounded-full p-1">
          {([
            { key: 'import', label: 'Import' },
            { key: 'review-edit', label: 'Review & Edit' },
            { key: 'design-finalize', label: 'Design & Finalize' },
          ] as const).map((step, i) => (
            <button
              key={step.key}
              onClick={() => setWorkflowStep(step.key)}
              className={`relative text-[11px] font-semibold px-4 py-1.5 rounded-full transition-all ${
                workflowStep === step.key
                  ? 'bg-custom-blue text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {i + 1}. {step.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleDownloadDocx}
            className="text-xs h-8 gap-1.5 border-slate-200"
          >
            <Download className="h-3.5 w-3.5" /> Word
          </Button>
          <Button
            size="sm"
            onClick={handleDownloadPdf}
            disabled={isDownloadingPdf}
            className="text-xs h-8 gap-1.5 bg-custom-blue hover:bg-[#2d5a94] text-white"
          >
            {isDownloadingPdf ? (
              <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generating...</>
            ) : (
              <><Download className="h-3.5 w-3.5" /> PDF</>
            )}
          </Button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex gap-4 p-4 overflow-hidden">

        {/* ─── STEP 1: IMPORT ─────────────────────────────────────────────── */}
        {workflowStep === 'import' && (
          <div className="flex-1 flex gap-4">
            <div className="flex-1 grid grid-cols-3 gap-4 content-start">
              {/* Upload CV */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col items-center text-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-blue-50 flex items-center justify-center">
                  <Upload className="h-6 w-6 text-custom-blue" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Upload CV</h3>
                  <p className="text-xs text-slate-400 mt-1">Parse an existing CV file</p>
                </div>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  <span className="text-[10px] font-medium bg-slate-100 text-slate-500 px-2 py-0.5 rounded">PDF</span>
                  <span className="text-[10px] font-medium bg-slate-100 text-slate-500 px-2 py-0.5 rounded">DOCX</span>
                  <span className="text-[10px] font-medium bg-slate-100 text-slate-500 px-2 py-0.5 rounded">TXT</span>
                </div>
                <Input type="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg" onChange={handleFileUpload} className="hidden" id="import-file-upload" disabled={isExtracting} />
                <Button asChild variant="outline" className="w-full" disabled={isExtracting}>
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
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
                <div className="flex flex-col items-center text-center gap-4">
                  <div className="h-14 w-14 rounded-2xl bg-blue-50 flex items-center justify-center">
                    <Users className="h-6 w-6 text-custom-blue" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Import From Registry</h3>
                    <p className="text-xs text-slate-400 mt-1">Search the individual registry</p>
                  </div>
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    className="pl-9 pr-4 h-9 text-sm bg-slate-50 border-slate-200 focus:bg-white"
                    placeholder="Search by name..."
                    value={individualSearch}
                    onChange={(e) => handleIndividualSearchChange(e.target.value)}
                  />
                  {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />}
                </div>

                {searchResults.length > 0 && (
                  <div className="border border-slate-200 rounded-lg overflow-hidden max-h-[220px] overflow-y-auto">
                    {searchResults.map((ind: any) => (
                      <button key={ind.id} onClick={() => handleSelectIndividual(ind)} className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b border-slate-100 last:border-0 transition-colors">
                        <div className="text-sm font-semibold text-slate-800">{ind.full_name}</div>
                        <div className="text-[11px] text-slate-400">{ind.gender} {ind.contact_details?.email?.primary ? `• ${ind.contact_details.email.primary}` : ''}</div>
                      </button>
                    ))}
                  </div>
                )}

                {selectedIndividual && (
                  <div className="border border-blue-200 rounded-lg bg-blue-50/30 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-800">{selectedIndividual.full_name}</span>
                      <button onClick={() => { setSelectedIndividual(null); setIndividualPhoto(null); setPendingPhotoPreview(null); setPendingPhotoFile(null); setShowSavePhotoPrompt(false); setShowSaveCvPrompt(false); }} className="text-slate-400 hover:text-slate-600 p-1"><X className="h-3 w-3" /></button>
                    </div>
                    <Button onClick={applyIndividualToCV} className="w-full" size="sm"><CheckCircle2 className="h-4 w-4 mr-2" /> Apply to CV</Button>
                  </div>
                )}

                {!selectedIndividual && !searchResults.length && !isSearching && individualSearch.length < 2 && (
                  <p className="text-[11px] text-slate-400 text-center py-2">Type a name to search the registry</p>
                )}
              </div>

              {/* Start From Scratch */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col items-center text-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-blue-50 flex items-center justify-center">
                  <FileText className="h-6 w-6 text-custom-blue" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Start From Scratch</h3>
                  <p className="text-xs text-slate-400 mt-1">Build your CV manually</p>
                </div>
                <Button onClick={() => { setCvData(EMPTY_CV_DATA); setWorkflowStep('review-edit'); setActiveSection('contact'); }} className="w-full bg-custom-blue hover:bg-[#2d5a94]">Start Building</Button>
              </div>
            </div>

            {/* Right preview during import */}
            <div className="w-[45%] bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Preview</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setZoomLevel(Math.max(0.4, zoomLevel - 0.05))} className="p-1 hover:bg-slate-100 rounded"><ZoomOut className="h-3.5 w-3.5 text-slate-500" /></button>
                  <span className="text-[11px] font-bold text-slate-600 min-w-[36px] text-center">{Math.round(zoomLevel * 100)}%</span>
                  <button onClick={() => setZoomLevel(Math.min(1.2, zoomLevel + 0.05))} className="p-1 hover:bg-slate-100 rounded"><ZoomIn className="h-3.5 w-3.5 text-slate-500" /></button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-6 flex items-start justify-center bg-slate-50">
                <div style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top center', transition: 'transform 0.15s ease-out' }} className="shrink-0">
                  <div ref={previewRef} id="cv-preview-container">{renderLayout()}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── STEP 2: REVIEW & EDIT ──────────────────────────────────────── */}
        {workflowStep === 'review-edit' && (
          <div className="flex-1 flex gap-4">
            {/* Left — Sections Sidebar (Collapsible Accordion) */}
            <div className="w-56 shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-3 py-2.5 border-b border-slate-200 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sections</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {sectionGroups.map((group) => (
                  <div key={group.label}>
                    <button
                      onClick={() => setCollapsedGroups(prev => ({ ...prev, [group.label]: !prev[group.label] }))}
                      className="w-full flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold text-slate-400 uppercase tracking-wider hover:text-slate-600"
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
                              <span className="text-[11px] font-semibold flex-1 truncate">{sec.label}</span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
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
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1 block">AI &amp; Tools</span>
                <button onClick={() => setShowAiWriter(true)} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left hover:bg-purple-50 text-slate-600 text-[11px] font-semibold"><PenLine className="h-3 w-3 text-purple-500" /> AI Writer</button>
                <button onClick={() => setShowAtsOptimizer(true)} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left hover:bg-amber-50 text-slate-600 text-[11px] font-semibold"><BarChart3 className="h-3 w-3 text-amber-600" /> ATS Optimizer</button>
                <button onClick={() => setShowJobMatch(true)} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left hover:bg-blue-50 text-slate-600 text-[11px] font-semibold"><Crosshair className="h-3 w-3 text-blue-600" /> Job Match</button>
                <button onClick={() => setShowCoverLetter(true)} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left hover:bg-green-50 text-slate-600 text-[11px] font-semibold"><CoverLetterIcon className="h-3 w-3 text-green-600" /> Cover Letter</button>
                <button onClick={() => setShowResumeVersions(true)} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left hover:bg-slate-50 text-slate-600 text-[11px] font-semibold"><Copy className="h-3 w-3 text-slate-500" /> Versions</button>
                <button onClick={() => setShowAnalytics(true)} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left hover:bg-slate-50 text-slate-600 text-[11px] font-semibold"><BarChart3 className="h-3 w-3 text-slate-500" /> Analytics</button>
              </div>
              <div className="border-t border-slate-200 p-3 space-y-1.5">
                <Button size="sm" onClick={() => setShowAdvancedExport(true)} variant="outline" className="w-full text-xs h-7 border-slate-200"><Download className="h-3 w-3 mr-1" /> Advanced Export</Button>
                <Button size="sm" onClick={() => setWorkflowStep('design-finalize')} className="w-full text-xs bg-custom-blue hover:bg-[#2d5a94] h-7">
                  Design &amp; Finalize <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </div>

            {/* Center — Editor Panel */}
            <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">{sectionMeta.find(s => s.id === activeSection)?.label || 'Section'}</h2>
                <span className="text-[10px] text-slate-400">Confidence Score <span className="text-emerald-600 font-bold">92%</span></span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-6">

                {/* Contact Information Editor */}
                {activeSection === 'contact' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5 col-span-2">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Full Name</Label>
                      <Input value={cvData.personalInfo?.fullName ?? ""} onChange={(e) => handlePersonalInfoChange("fullName", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Professional Title</Label>
                      <Input value={cvData.personalInfo?.title ?? ""} onChange={(e) => handlePersonalInfoChange("title", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Photo</Label>
                      <div className="flex gap-2 items-center">
                        {cvData.personalInfo?.photoUrl ? (
                          <img src={cvData.personalInfo.photoUrl} className="h-10 w-10 object-cover rounded-lg border border-slate-200" />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center"><User className="h-4 w-4 text-slate-400" /></div>
                        )}
                        <Input type="file" accept="image/*" className="text-xs h-8" onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) { const url = URL.createObjectURL(file); handlePersonalInfoChange("photoUrl", url); }
                        }} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Email</Label>
                      <Input value={cvData.personalInfo?.email ?? ""} onChange={(e) => handlePersonalInfoChange("email", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Phone</Label>
                      <Input value={cvData.personalInfo?.phone ?? ""} onChange={(e) => handlePersonalInfoChange("phone", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Location</Label>
                      <Input value={cvData.personalInfo?.location ?? ""} onChange={(e) => handlePersonalInfoChange("location", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">LinkedIn</Label>
                      <Input value={cvData.personalInfo?.linkedin ?? ""} onChange={(e) => handlePersonalInfoChange("linkedin", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">GitHub</Label>
                      <Input value={cvData.personalInfo?.github ?? ""} onChange={(e) => handlePersonalInfoChange("github", e.target.value)} />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Personal Details</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <Input placeholder="Date of Birth" value={cvData.personalDetails?.dateOfBirth ?? ""} onChange={(e) => handlePersonalDetailsChange("dateOfBirth", e.target.value)} />
                        <Input placeholder="Nationality" value={cvData.personalDetails?.nationality ?? ""} onChange={(e) => handlePersonalDetailsChange("nationality", e.target.value)} />
                        <Input placeholder="Marital Status" value={cvData.personalDetails?.maritalStatus ?? ""} onChange={(e) => handlePersonalDetailsChange("maritalStatus", e.target.value)} />
                        <Input placeholder="Residence" value={cvData.personalDetails?.residence ?? ""} onChange={(e) => handlePersonalDetailsChange("residence", e.target.value)} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Summary Editor */}
                {activeSection === 'summary' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Professional Summary</Label>
                      <Button size="sm" variant="ghost" onClick={() => setShowAiWriter(true)} className="h-6 text-[10px] text-purple-600 gap-1"><Sparkles className="h-3 w-3" /> AI Enhance</Button>
                    </div>
                    <Textarea rows={6} value={cvData.summary ?? ""} onChange={(e) => setCvData({ ...cvData, summary: e.target.value })} placeholder="Write a compelling professional summary..." />
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <Sparkles className="h-4 w-4 text-custom-blue shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-slate-700">AI Suggestion</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">Results-driven professional with expertise in... Consider adding measurable achievements and industry-specific keywords.</p>
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
                        <Button size="sm" variant="ghost" onClick={() => setShowAiWriter(true)} className="h-7 text-[10px] text-purple-600 gap-1"><Sparkles className="h-3 w-3" /> AI Enhance</Button>
                        <Button size="sm" variant="outline" onClick={addExperience} className="h-7 text-[10px] gap-1 border-dashed"><Plus className="h-3 w-3" /> Add</Button>
                      </div>
                    </div>
                    {cvData.experience.length === 0 && <p className="text-xs text-slate-400 italic py-4 text-center">No experience entries yet. Click "Add" to create one.</p>}
                    <div className="space-y-4">
                      {cvData.experience.map((exp: any, idx: number) => (
                        <div key={idx} className="p-4 border border-slate-200 rounded-xl space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-slate-500">Position #{idx + 1}</span>
                            <Button variant="ghost" size="icon" onClick={() => removeExperience(idx)} className="text-red-500 hover:text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
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
                                <Button type="button" variant="ghost" size="sm" onClick={() => addRespToExperience(idx)} className="h-6 text-[10px] text-blue-600"><Plus className="h-2.5 w-2.5" /> Add</Button>
                              </div>
                              {exp.responsibilities?.map((resp: string, rIdx: number) => (
                                <div key={rIdx} className="flex gap-2 items-center">
                                  <Input value={resp ?? ""} placeholder="e.g. Designed backend system" onChange={(e) => handleRespChangeInExperience(idx, rIdx, e.target.value)} className="h-8 text-xs" />
                                  <Button variant="ghost" size="icon" onClick={() => removeRespFromExperience(idx, rIdx)} className="h-8 w-8 text-red-400 hover:text-red-600"><Trash2 className="h-3 w-3" /></Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Education Editor */}
                {activeSection === 'education' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">{cvData.education.length} entries</span>
                      <Button size="sm" variant="outline" onClick={addEducation} className="h-7 text-[10px] gap-1 border-dashed"><Plus className="h-3 w-3" /> Add</Button>
                    </div>
                    {cvData.education.length === 0 && <p className="text-xs text-slate-400 italic py-4 text-center">No education entries yet.</p>}
                    {cvData.education.map((edu: any, idx: number) => (
                      <div key={idx} className="p-4 border border-slate-200 rounded-xl space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-500">Education #{idx + 1}</span>
                          <Button variant="ghost" size="icon" onClick={() => removeEducation(idx)} className="text-red-500 hover:text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <Input placeholder="Degree / Certificate" value={edu.degree ?? ""} onChange={(e) => handleEducationChange(idx, "degree", e.target.value)} />
                          <Input placeholder="Year of Completion" value={edu.year ?? ""} onChange={(e) => handleEducationChange(idx, "year", e.target.value)} />
                          <Input placeholder="Institution" className="col-span-2" value={edu.institution ?? ""} onChange={(e) => handleEducationChange(idx, "institution", e.target.value)} />
                          <Input placeholder="Extra Details / Certifications" className="col-span-2" value={edu.details ?? ""} onChange={(e) => handleEducationChange(idx, "details", e.target.value)} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Skills Editor */}
                {activeSection === 'skills' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">{cvData.skills.length} categories</span>
                      <Button size="sm" variant="outline" onClick={addSkillGroup} className="h-7 text-[10px] gap-1 border-dashed"><Plus className="h-3 w-3" /> Add</Button>
                    </div>
                    {cvData.skills.length === 0 && <p className="text-xs text-slate-400 italic py-4 text-center">No skills added yet.</p>}
                    {cvData.skills.map((skill: any, idx: number) => (
                      <div key={idx} className="flex gap-3 items-start p-3 border border-slate-200 rounded-lg">
                        <div className="flex-1 space-y-2">
                          <Input placeholder="Category (e.g. Frameworks & Tools)" value={skill.category ?? ""} onChange={(e) => handleSkillGroupChange(idx, "category", e.target.value)} />
                          <Textarea placeholder="Comma-separated items" rows={2} value={skill.items ?? ""} onChange={(e) => handleSkillGroupChange(idx, "items", e.target.value)} />
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => removeSkillGroup(idx)} className="text-red-500 hover:text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Internships Editor */}
                {activeSection === 'internships' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">{cvData.internships.length} entries</span>
                      <Button size="sm" variant="outline" onClick={addInternship} className="h-7 text-[10px] gap-1 border-dashed"><Plus className="h-3 w-3" /> Add</Button>
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
                              <Button type="button" variant="ghost" size="sm" onClick={() => addRespToInternship(idx)} className="h-6 text-[10px] text-blue-600"><Plus className="h-2.5 w-2.5" /> Add</Button>
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
                      <Button size="sm" variant="outline" onClick={addProject} className="h-7 text-[10px] gap-1 border-dashed"><Plus className="h-3 w-3" /> Add</Button>
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
                      <Button size="sm" variant="outline" onClick={addLanguage} className="h-7 text-[10px] gap-1 border-dashed"><Plus className="h-3 w-3" /> Add</Button>
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
                      <Button size="sm" variant="outline" onClick={addReference} className="h-7 text-[10px] gap-1 border-dashed"><Plus className="h-3 w-3" /> Add</Button>
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
                          <Input placeholder="Company" value={ref.company ?? ""} onChange={(e) => handleReferenceChange(idx, "company", e.target.value)} />
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
                      <Button size="sm" variant="outline" onClick={addCertification} className="h-7 text-[10px] gap-1 border-dashed"><Plus className="h-3 w-3" /> Add</Button>
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
                      <Button size="sm" variant="outline" onClick={addAchievement} className="h-7 text-[10px] gap-1 border-dashed"><Plus className="h-3 w-3" /> Add</Button>
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
                      <Button size="sm" variant="outline" onClick={addAdditionalInfo} className="h-7 text-[10px] gap-1 border-dashed"><Plus className="h-3 w-3" /> Add</Button>
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
                    <div className="space-y-2">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Declaration Statement</Label>
                      <Textarea rows={3} value={cvData.declaration || ""} onChange={(e) => setCvData({ ...cvData, declaration: e.target.value })} />
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="verifiedBadge" checked={cvData.verifiedBadge} onCheckedChange={(checked) => setCvData({ ...cvData, verifiedBadge: !!checked })} />
                      <Label htmlFor="verifiedBadge" className="text-xs text-slate-600 cursor-pointer">Include "Verified & Up-to-date" badge</Label>
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* Right — Preview Panel (Review & Edit step) */}
            <div className="w-[45%] bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Live Preview</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setZoomLevel(Math.max(0.4, zoomLevel - 0.05))} className="p-1 hover:bg-slate-100 rounded"><ZoomOut className="h-3.5 w-3.5 text-slate-500" /></button>
                  <span className="text-[11px] font-bold text-slate-600 min-w-[36px] text-center">{Math.round(zoomLevel * 100)}%</span>
                  <button onClick={() => setZoomLevel(Math.min(1.2, zoomLevel + 0.05))} className="p-1 hover:bg-slate-100 rounded"><ZoomIn className="h-3.5 w-3.5 text-slate-500" /></button>
                </div>
                <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
                  {[{ key: "theme1", label: "Classic" }, { key: "theme2", label: "Modern" }, { key: "theme3", label: "Minimal" }, { key: "theme4", label: "Executive" }].map(t => (
                    <button key={t.key} onClick={() => setSelectedLayout(t.key)}
                      className={`text-[10px] font-semibold px-2 py-1 rounded-md transition-all ${selectedLayout === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >{t.label}</button>
                  ))}
                </div>
              </div>
              <div className="flex-1 overflow-auto p-6 flex items-start justify-center bg-slate-50">
                <div style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top center', transition: 'transform 0.15s ease-out' }} className="shrink-0">
                  <div ref={previewRef} id="cv-preview-container">{renderLayout()}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── STEP 3: DESIGN & FINALIZE ──────────────────────────────────── */}
        {workflowStep === 'design-finalize' && (
          <div className="flex-1 flex gap-4">
            {/* Left — Design Studio (Tabbed) */}
            <div className="w-80 shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-4 py-2.5 border-b border-slate-200">
                <div className="flex gap-0.5 bg-slate-100 rounded-lg p-0.5">
                  {[{ key: 'theme', label: 'Layout' }, { key: 'colors', label: 'Color' }, { key: 'font', label: 'Font' }, { key: 'photo', label: 'Photo' }].map(tab => (
                    <button key={tab.key} onClick={() => setActiveDesignTab(tab.key)}
                      className={`flex-1 text-[10px] font-semibold py-1.5 rounded-md transition-all ${activeDesignTab === tab.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >{tab.label}</button>
                  ))}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Layout Tab */}
                {activeDesignTab === 'theme' && (
                  <div className="space-y-3">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Theme Layout</span>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { key: "theme1", label: "Classic", desc: "Two-column sidebar", icon: Layout },
                        { key: "theme2", label: "Modern", desc: "Top header layout", icon: Layout },
                        { key: "theme3", label: "Minimal", desc: "Single column", icon: Layout },
                        { key: "theme4", label: "Executive", desc: "Bold leadership focus", icon: Layout },
                      ].map(t => (
                        <button key={t.key} onClick={() => setSelectedLayout(t.key)}
                          className={`p-3 rounded-lg border-2 text-left transition-all ${selectedLayout === t.key ? 'border-custom-blue bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
                        >
                          <Layout className={`h-4 w-4 mb-1 ${selectedLayout === t.key ? 'text-custom-blue' : 'text-slate-400'}`} />
                          <div className="text-xs font-bold text-slate-700">{t.label}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{t.desc}</div>
                        </button>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Column Style</span>
                      <div className="flex gap-2">
                        {['single-column', 'two-column', 'sidebar', 'executive'].map(col => (
                          <button key={col} onClick={() => {}}
                            className={`flex-1 text-[10px] font-semibold py-2 rounded-lg border transition-all ${selectedLayout.includes(col) ? 'border-custom-blue bg-blue-50 text-custom-blue' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                          >{col.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}</button>
                        ))}
                      </div>
                    </div>
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-[10px] text-amber-700">Choose a layout that matches your industry. Classic is best for conservative fields like finance. Modern works for tech. Minimal for creative roles.</p>
                    </div>
                  </div>
                )}

                {/* Color Tab */}
                {activeDesignTab === 'colors' && (
                  <div className="space-y-3">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Color Scheme</span>
                    <div className="grid grid-cols-4 gap-2">
                      {COLOR_PRESETS.map(preset => (
                        <button key={preset.name} title={preset.name}
                          onClick={() => { updateCvSetting('primaryColor', preset.primary); updateCvSetting('accentColor', preset.accent); }}
                          className="relative w-full aspect-square rounded-xl border-2 transition-all hover:scale-105"
                          style={{
                            background: `linear-gradient(135deg, ${preset.primary} 50%, ${preset.accent} 50%)`,
                            borderColor: (cvSettings.primaryColor === preset.primary && cvSettings.accentColor === preset.accent) ? '#376bae' : 'transparent',
                          }}
                        >
                          {(cvSettings.primaryColor === preset.primary && cvSettings.accentColor === preset.accent) && (
                            <Check className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow" />
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      <span className="text-[10px] text-slate-500">Primary Color</span>
                      <input type="color" value={cvSettings.primaryColor} onChange={e => updateCvSetting('primaryColor', e.target.value)}
                        className="w-full h-8 rounded border border-slate-200 p-0.5 cursor-pointer" />
                    </div>
                    <div className="space-y-1.5">
                      <span className="text-[10px] text-slate-500">Accent Color</span>
                      <input type="color" value={cvSettings.accentColor} onChange={e => updateCvSetting('accentColor', e.target.value)}
                        className="w-full h-8 rounded border border-slate-200 p-0.5 cursor-pointer" />
                    </div>
                  </div>
                )}

                {/* Font Tab */}
                {activeDesignTab === 'font' && (
                  <div className="space-y-3">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Font Family</span>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { name: 'Inter', family: 'Inter, sans-serif', desc: 'Clean modern' },
                        { name: 'Roboto', family: 'Roboto, sans-serif', desc: 'Versatile' },
                        { name: 'Poppins', family: 'Poppins, sans-serif', desc: 'Friendly' },
                        { name: 'Lato', family: 'Lato, sans-serif', desc: 'Professional' },
                        { name: 'Merriweather', family: 'Merriweather, serif', desc: 'Elegant serif' },
                        { name: 'System', family: '-apple-system, sans-serif', desc: 'Default' },
                      ].map(f => (
                        <button key={f.name} onClick={() => updateCvSetting('fontFamily', f.family)}
                          className={`p-2.5 rounded-lg border-2 text-left transition-all ${(cvSettings as any).fontFamily === f.family ? 'border-custom-blue bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
                        >
                          <div className="text-xs font-bold text-slate-700" style={{ fontFamily: f.family }}>{f.name}</div>
                          <div className="text-[9px] text-slate-400">{f.desc}</div>
                        </button>
                      ))}
                    </div>
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider mt-3 block">Font Size</span>
                    <div className="flex items-center border border-slate-200 rounded-md overflow-hidden h-8 bg-white">
                      {([0.85, 1, 1.15] as const).map((s, i) => (
                        <button key={s} onClick={() => updateCvSetting('fontScale', s)}
                          className={`flex-1 text-xs font-bold h-full transition-colors ${cvSettings.fontScale === s ? 'bg-custom-blue text-white' : 'text-slate-500 hover:bg-slate-50'} ${i > 0 ? 'border-l border-slate-200' : ''}`}
                        >{['Small', 'Medium', 'Large'][i]}</button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Photo Tab */}
                {activeDesignTab === 'photo' && (
                  <div className="space-y-3">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Photo Settings</span>
                    <div className="flex justify-center">
                      <div className="relative">
                        <div
                          style={{
                            width: cvSettings.photoSize,
                            height: cvSettings.photoSize,
                            borderRadius: cvSettings.photoShape === 'circle' ? '50%' : cvSettings.photoShape === 'rounded' ? '12px' : '0',
                            objectFit: cvSettings.photoFit,
                          }}
                          className="bg-slate-100 border-2 border-slate-200 flex items-center justify-center overflow-hidden"
                        >
                          {cvData.personalInfo?.photoUrl ? (
                            <img src={cvData.personalInfo.photoUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: cvSettings.photoFit }} />
                          ) : (
                            <User className="h-8 w-8 text-slate-400" />
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <span className="text-[10px] text-slate-500">Size</span>
                        <input type="range" min={80} max={250} value={cvSettings.photoSize} onChange={e => updateCvSetting('photoSize', Number(e.target.value))}
                          className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-custom-blue mt-1" />
                        <div className="flex justify-between text-[9px] text-slate-400"><span>Small</span><span>{cvSettings.photoSize}px</span><span>Large</span></div>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500">Shape</span>
                        <div className="flex items-center border border-slate-200 rounded-md overflow-hidden h-7 bg-white mt-1">
                          {(['square','circle','rounded'] as const).map((s, i) => (
                            <button key={s} onClick={() => updateCvSetting('photoShape', s)}
                              className={`flex-1 text-[10px] font-bold h-full transition-colors ${cvSettings.photoShape === s ? 'bg-custom-blue text-white' : 'text-slate-500 hover:bg-slate-50'} ${i > 0 ? 'border-l border-slate-200' : ''}`}
                            >{s.charAt(0).toUpperCase() + s.slice(1)}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500">Fit</span>
                        <select value={cvSettings.photoFit} onChange={e => updateCvSetting('photoFit', e.target.value as any)}
                          className="w-full h-7 text-xs border border-slate-200 rounded-md px-2 bg-white text-slate-600 mt-1"
                        >
                          <option value="cover">Cover (crop to fill)</option>
                          <option value="contain">Fit (show all)</option>
                          <option value="fill">Stretch (fill)</option>
                        </select>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500">Show/Hide</span>
                        <label className="flex items-center gap-2 mt-1 cursor-pointer">
                          <input type="checkbox" checked={cvSettings.showPhoto !== false}
                            onChange={e => updateCvSetting('showPhoto', e.target.checked)}
                            className="rounded border-slate-300 text-custom-blue focus:ring-custom-blue h-4 w-4" />
                          <span className="text-xs text-slate-600">Show photo in CV</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* Export */}
                <div className="space-y-2 pt-4 border-t border-slate-200">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Export</span>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" onClick={handleDownloadPdf} disabled={isDownloadingPdf} className="bg-custom-blue hover:bg-[#2d5a94] text-xs h-9">
                      {isDownloadingPdf ? 'Generating...' : 'Download PDF'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleDownloadDocx} className="text-xs h-9">Download Word</Button>
                  </div>
                </div>

                {/* Save to Database */}
                <div className="space-y-2 pt-4 border-t border-slate-200">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Save to Database</span>
                  <p className="text-[10px] text-slate-400 leading-relaxed">Your CV is auto-saved locally. Save to database for permanent access.</p>
                  <Button size="sm" onClick={() => setShowSaveCvPrompt(true)} className="bg-green-600 hover:bg-green-700 text-xs w-full h-9">
                    <Database className="h-3.5 w-3.5 mr-1.5" /> Save to Database
                  </Button>
                </div>

                {/* AI Enhancement */}
                <div className="space-y-2 pt-4 border-t border-slate-200">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">AI Enhancement</span>
                  <div className="grid grid-cols-2 gap-2">
                    {ENHANCEMENT_OPTIONS.map((opt) => (
                      <button key={opt.value} type="button" onClick={() => setEnhancementLevel(opt.value)}
                        className={`text-left p-2.5 rounded-lg border-2 transition-all ${enhancementLevel === opt.value ? 'border-custom-blue bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
                      >
                        <div className="text-[10px] font-bold text-slate-700">{opt.label}</div>
                        <div className="text-[9px] text-slate-400 leading-tight mt-0.5">{opt.description}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right — Preview + Viewport */}
            <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Final Preview</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setZoomLevel(Math.max(0.4, zoomLevel - 0.05))} className="p-1 hover:bg-slate-100 rounded"><ZoomOut className="h-3.5 w-3.5 text-slate-500" /></button>
                  <span className="text-[11px] font-bold text-slate-600 min-w-[36px] text-center">{Math.round(zoomLevel * 100)}%</span>
                  <button onClick={() => setZoomLevel(Math.min(1.2, zoomLevel + 0.05))} className="p-1 hover:bg-slate-100 rounded"><ZoomIn className="h-3.5 w-3.5 text-slate-500" /></button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-8 flex items-start justify-center bg-slate-50">
                <div style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top center', transition: 'transform 0.15s ease-out' }} className="shrink-0">
                  <div ref={previewRef} id="cv-preview-container">{renderLayout()}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI Writer Modal */}
        {showAiWriter && (
          <AIWriterModule cvData={cvData} setCvData={setCvData} onClose={() => setShowAiWriter(false)} />
        )}

        {/* ATS Optimizer Modal */}
        {showAtsOptimizer && (
          <ATSOptimizer cvData={cvData} onClose={() => setShowAtsOptimizer(false)} />
        )}

        {/* Job Match Modal */}
        {showJobMatch && (
          <JobMatch cvData={cvData} onClose={() => setShowJobMatch(false)} />
        )}

        {/* Cover Letter Modal */}
        {showCoverLetter && (
          <CoverLetterGenerator cvData={cvData} onClose={() => setShowCoverLetter(false)} />
        )}

        {/* Resume Versions Modal */}
        {showResumeVersions && (
          <ResumeVersions
            cvData={cvData}
            setCvData={setCvData}
            cvVersions={cvVersions}
            setCvVersions={setCvVersions}
            onClose={() => setShowResumeVersions(false)}
          />
        )}

        {/* Analytics Modal */}
        {showAnalytics && (
          <ResumeAnalytics cvData={cvData} onClose={() => setShowAnalytics(false)} />
        )}

        {/* Advanced Export Modal */}
        {showAdvancedExport && (
          <AdvancedExport cvData={cvData} previewRef={previewRef as React.RefObject<HTMLDivElement>} onClose={() => setShowAdvancedExport(false)} />
        )}

      </div>
    </div>
  );
}
