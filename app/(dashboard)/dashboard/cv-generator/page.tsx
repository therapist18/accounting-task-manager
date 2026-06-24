"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, FileText, Upload, Plus, Trash2, Download, ZoomIn, ZoomOut, Check, User, Briefcase, GraduationCap, FolderGit2, BookOpen, MessageSquare, AlertCircle, Eye, Search, Users, ImagePlus, X, Loader2, CheckCircle2, Save, Settings2, Palette, ChevronDown, ChevronUp, Globe } from "lucide-react";
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

export default function CVGeneratorPage() {
  const [cvData, setCvData] = useState<any>(initialCVData);
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
  const photoInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [registryFormData, setRegistryFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    location: '',
    languages: [{ language: 'English', proficiency: 'Professional' }] as { language: string; proficiency: string }[],
  });
  const [cvSettings, setCvSettings] = useState({
    photoSize: 150,
    photoFit: 'cover' as 'cover' | 'contain' | 'fill',
    photoShape: 'square' as 'square' | 'circle' | 'rounded',
    primaryColor: '#2c3e50',
    accentColor: '#3498db',
    fontScale: 1 as 0.85 | 1 | 1.15,
    showCustomize: false,
  });

  const updateCvSetting = <K extends keyof typeof cvSettings>(key: K, value: typeof cvSettings[K]) =>
    setCvSettings(prev => ({ ...prev, [key]: value }));

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
    setCvData({
      ...EMPTY_CV_DATA,
      personalInfo: {
        ...EMPTY_CV_DATA.personalInfo,
        fullName: registryFormData.fullName || selectedIndividual.full_name || "",
        phone: registryFormData.phone || "",
        email: registryFormData.email || "",
        location: registryFormData.location || "",
        photoUrl,
      },
      languages: registryFormData.languages.length > 0
        ? registryFormData.languages
        : EMPTY_CV_DATA.languages,
    });
    toast.success(`CV reset and pre-filled with ${registryFormData.fullName || selectedIndividual.full_name}'s details`);
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
      declaration = "",
      verifiedBadge = false
    } = cvData;

    const photoShapeStyle: React.CSSProperties = {
      borderRadius: cvSettings.photoShape === 'circle' ? '50%' : cvSettings.photoShape === 'rounded' ? '12px' : '0',
    };
    const fontScaleStyle: React.CSSProperties = { fontSize: `${cvSettings.fontScale}em` };

    if (selectedLayout === "theme1") {
      const acc = cvSettings.accentColor;
      const pri = cvSettings.primaryColor;
      return (
        <div className="w-[210mm] min-h-[297mm] bg-white text-[#333] grid grid-cols-[280px_1fr] relative shadow-2xl text-left font-sans leading-normal" style={fontScaleStyle}>
          {/* Sidebar */}
          <aside style={{ backgroundColor: pri }} className="text-[#ecf0f1] p-[20px_15px] flex flex-col gap-6">
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
              <div style={{ borderLeftColor: acc, color: pri, backgroundColor: `${acc}18` }} className="border-l-[5px] p-2 px-4 text-[13px] font-extrabold uppercase mb-3">Education & Certifications</div>
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
    } else {
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
    }
  };

  return (
    <div className="flex flex-col xl:flex-row h-screen overflow-hidden gap-4 p-4 bg-gray-100 dark:bg-zinc-900">
      {/* LEFT PANEL - Form Input & AI Parsing (Scrollable) */}
      <div className="flex-1 xl:max-w-[45%] h-full flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <Tabs defaultValue="registry" className="flex-1 flex flex-col overflow-hidden">
          <CardHeader className="py-3 px-4 border-b border-slate-100 dark:border-slate-800 flex flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-sm font-bold truncate">CV Builder</CardTitle>
                <CardDescription className="text-[10px] text-slate-400 truncate">
                  Load from registry or fill manually
                </CardDescription>
              </div>
            </div>
            <TabsList className="bg-slate-100 dark:bg-slate-800 h-8 p-0.5 shrink-0 rounded-lg">
              <TabsTrigger value="registry" className="text-[10px] font-semibold py-1 px-2.5 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm">
                <Users className="h-3 w-3 mr-1" /> Registry
              </TabsTrigger>
              <TabsTrigger value="form" className="text-[10px] font-semibold py-1 px-2.5 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm">
                <FileText className="h-3 w-3 mr-1" /> Form
              </TabsTrigger>
              <TabsTrigger value="upload" className="text-[10px] font-semibold py-1 px-2.5 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm">
                <Upload className="h-3 w-3 mr-1" /> AI Upload
              </TabsTrigger>
              <TabsTrigger value="raw" className="text-[10px] font-semibold py-1 px-2.5 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm">
                <span className="font-mono">{'{}'}</span>
              </TabsTrigger>
            </TabsList>
          </CardHeader>

          {/* Form Tabs Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* ── Registry Tab ─────────────────────────────────────────────── */}
            <TabsContent value="registry" className="m-0 outline-none space-y-4">
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-blue-500" />
                  Load from Individual Registry
                </h3>
                <p className="text-[11px] text-slate-400">Search by name to pre-fill the CV with their contact details and photo.</p>
              </div>

              {/* Search Box */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-9 pr-4 h-9 text-sm bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-900"
                  placeholder="Search by name..."
                  value={individualSearch}
                  onChange={(e) => handleIndividualSearchChange(e.target.value)}
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />
                )}
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm bg-white dark:bg-slate-800/50">
                  {searchResults.map((ind: any) => (
                    <button
                      key={ind.id}
                      onClick={() => handleSelectIndividual(ind)}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-b border-slate-100 dark:border-slate-700 last:border-0 transition-colors group"
                    >
                      <div className="font-semibold text-sm text-slate-800 dark:text-slate-200 group-hover:text-blue-700 dark:group-hover:text-blue-300">{ind.full_name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex gap-3 items-center">
                        {ind.gender && <span className="capitalize">{ind.gender}</span>}
                        {ind.contact_details?.email?.primary && (
                          <span>{ind.contact_details.email.primary}</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Selected Individual — Editable Form */}
              {selectedIndividual && (
                <div className="border border-blue-200 dark:border-blue-800/50 rounded-xl bg-blue-50/30 dark:bg-blue-900/10 p-4 space-y-4">
                  {/* Header row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                        <CheckCircle2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{selectedIndividual.full_name}</span>
                      {selectedIndividual.gender && <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full text-slate-500 capitalize">{selectedIndividual.gender}</span>}
                    </div>
                    <button onClick={() => { setSelectedIndividual(null); setIndividualPhoto(null); setPendingPhotoPreview(null); setPendingPhotoFile(null); setShowSavePhotoPrompt(false); setShowSaveCvPrompt(false); }} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Editable fields */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 space-y-1">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Full Name</Label>
                      <Input
                        value={registryFormData.fullName}
                        onChange={e => setRegistryFormData(p => ({ ...p, fullName: e.target.value }))}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Phone</Label>
                      <Input
                        value={registryFormData.phone}
                        onChange={e => setRegistryFormData(p => ({ ...p, phone: e.target.value }))}
                        className="h-8 text-sm"
                        placeholder="+254..."
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Email</Label>
                      <Input
                        value={registryFormData.email}
                        onChange={e => setRegistryFormData(p => ({ ...p, email: e.target.value }))}
                        className="h-8 text-sm"
                        placeholder="email@..."
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Location</Label>
                      <Input
                        value={registryFormData.location}
                        onChange={e => setRegistryFormData(p => ({ ...p, location: e.target.value }))}
                        className="h-8 text-sm"
                        placeholder="City, Country"
                      />
                    </div>
                  </div>

                  {/* Languages */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5" /> Languages
                      </Label>
                      <button onClick={addRegistryLanguage} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                        <Plus className="h-3 w-3" /> Add
                      </button>
                    </div>
                    <div className="space-y-2">
                      {registryFormData.languages.map((lang, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                          <Select value={lang.language} onValueChange={v => updateRegistryLanguage(idx, 'language', v)}>
                            <SelectTrigger className="h-8 flex-1 text-xs">
                              <SelectValue placeholder="Select language" />
                            </SelectTrigger>
                            <SelectContent>
                              {COMMON_LANGUAGES.map(l => (
                                <SelectItem key={l} value={l} className="text-xs">{l}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select value={lang.proficiency} onValueChange={v => updateRegistryLanguage(idx, 'proficiency', v)}>
                            <SelectTrigger className="h-8 w-32 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PROFICIENCY_LEVELS.map(p => (
                                <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {registryFormData.languages.length > 1 && (
                            <button onClick={() => removeRegistryLanguage(idx)} className="text-slate-400 hover:text-red-500 flex-shrink-0">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Photo Section */}
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Photo</Label>
                    {isFetchingPhoto ? (
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" /> Fetching from registry...
                      </div>
                    ) : (pendingPhotoPreview || individualPhoto) ? (
                      <div className="flex items-start gap-3">
                        <img
                          src={pendingPhotoPreview || individualPhoto!}
                          alt="Individual"
                          className="w-20 h-20 object-cover rounded-lg border border-slate-200 shadow-sm"
                        />
                        <div className="flex flex-col gap-1.5">
                          {pendingPhotoPreview ? (
                            <span className="text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">Pending upload</span>
                          ) : (
                            <span className="text-xs text-green-700 font-medium bg-green-50 border border-green-200 px-2 py-0.5 rounded flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> From registry
                            </span>
                          )}
                          <button onClick={() => photoInputRef.current?.click()} className="text-xs text-blue-600 hover:underline text-left">
                            Replace photo
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() => photoInputRef.current?.click()}
                        className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-lg p-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
                      >
                        <ImagePlus className="h-6 w-6 text-slate-400" />
                        <p className="text-xs text-slate-500">No photo in registry — click to upload</p>
                      </div>
                    )}
                    <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handleRegistryPhotoUpload} />
                  </div>

                  {/* Save photo to registry prompt */}
                  {showSavePhotoPrompt && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                      <p className="text-xs text-amber-800 font-medium">Save this photo to the individual's registry record?</p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-100" onClick={savePhotoToRegistry} disabled={isSavingPhoto}>
                          {isSavingPhoto ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                          {isSavingPhoto ? 'Saving...' : 'Yes, save to registry'}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-600" onClick={() => setShowSavePhotoPrompt(false)}>
                          Skip
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Save CV to DB prompt */}
                  {showSaveCvPrompt && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                      <p className="text-xs text-blue-800 font-medium">Save this CV to the individual's database record?</p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="h-7 text-xs border-blue-300 text-blue-800 hover:bg-blue-100" onClick={saveCVToDb} disabled={isSavingCv}>
                          {isSavingCv ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                          {isSavingCv ? 'Saving...' : 'Yes, save CV'}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-600" onClick={() => setShowSaveCvPrompt(false)}>
                          Skip
                        </Button>
                      </div>
                    </div>
                  )}

                  <Button onClick={applyIndividualToCV} className="w-full" size="sm">
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Apply to CV
                  </Button>
                </div>
              )}

              {!selectedIndividual && !searchResults.length && !isSearching && individualSearch.length < 2 && (
                <div className="text-center py-12 text-slate-300 dark:text-slate-600">
                  <div className="h-14 w-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
                    <Users className="h-6 w-6 opacity-40" />
                  </div>
                  <p className="text-xs font-medium">Type a name to search the registry</p>
                  <p className="text-[10px] text-slate-300 dark:text-slate-600 mt-1">Minimum 2 characters</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="form" className="space-y-6 m-0 outline-none">

              {/* Personal Info Section */}
              <section className="space-y-4">
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                  <div className="h-5 w-5 rounded bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                    <User className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                  </div>
                  1. Contact Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input
                      id="fullName"
                      value={cvData.personalInfo.fullName}
                      onChange={(e) => handlePersonalInfoChange("fullName", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="title">Professional Title</Label>
                    <Input
                      id="title"
                      value={cvData.personalInfo.title}
                      onChange={(e) => handlePersonalInfoChange("title", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      value={cvData.personalInfo.email}
                      onChange={(e) => handlePersonalInfoChange("email", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={cvData.personalInfo.phone}
                      onChange={(e) => handlePersonalInfoChange("phone", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="location">Location / Address</Label>
                    <Input
                      id="location"
                      value={cvData.personalInfo.location}
                      onChange={(e) => handlePersonalInfoChange("location", e.target.value)}
                      placeholder="e.g. Nairobi, Kenya"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="github">GitHub Link</Label>
                    <Input
                      id="github"
                      value={cvData.personalInfo.github}
                      onChange={(e) => handlePersonalInfoChange("github", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="linkedin">LinkedIn Link</Label>
                    <Input
                      id="linkedin"
                      value={cvData.personalInfo.linkedin}
                      onChange={(e) => handlePersonalInfoChange("linkedin", e.target.value)}
                    />
                  </div>
                </div>
              </section>

              {/* Personal Details Section */}
              <section className="space-y-4">
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                  <div className="h-5 w-5 rounded bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                    <User className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  2. Personal Details
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dob">Date of Birth</Label>
                    <Input
                      id="dob"
                      value={cvData.personalDetails.dateOfBirth || ""}
                      onChange={(e) => handlePersonalDetailsChange("dateOfBirth", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nationality">Nationality</Label>
                    <Input
                      id="nationality"
                      value={cvData.personalDetails.nationality || ""}
                      onChange={(e) => handlePersonalDetailsChange("nationality", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maritalStatus">Marital Status</Label>
                    <Input
                      id="maritalStatus"
                      value={cvData.personalDetails.maritalStatus || ""}
                      onChange={(e) => handlePersonalDetailsChange("maritalStatus", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="residence">Current Residence</Label>
                    <Input
                      id="residence"
                      value={cvData.personalDetails.residence || ""}
                      onChange={(e) => handlePersonalDetailsChange("residence", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="kenyaStatus">Kenya Status (Visa / Permit Info)</Label>
                    <Input
                      id="kenyaStatus"
                      value={cvData.personalDetails.kenyaStatus || ""}
                      onChange={(e) => handlePersonalDetailsChange("kenyaStatus", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nairobiRes">Nairobi Residence</Label>
                    <Input
                      id="nairobiRes"
                      value={cvData.personalDetails.nairobiRes || ""}
                      onChange={(e) => handlePersonalDetailsChange("nairobiRes", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="driving">Driving Experience</Label>
                    <Input
                      id="driving"
                      value={cvData.personalDetails.drivingExperience || ""}
                      onChange={(e) => handlePersonalDetailsChange("drivingExperience", e.target.value)}
                    />
                  </div>
                </div>
              </section>

              {/* Profile Summary Section */}
              <section className="space-y-4">
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                  <div className="h-5 w-5 rounded bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center">
                    <BookOpen className="h-3 w-3 text-violet-600 dark:text-violet-400" />
                  </div>
                  3. Professional Profile
                </h3>
                <div className="space-y-2">
                  <Label htmlFor="summary">Summary Paragraph</Label>
                  <Textarea
                    id="summary"
                    rows={4}
                    value={cvData.summary}
                    onChange={(e) => setCvData({ ...cvData, summary: e.target.value })}
                  />
                </div>
              </section>

              {/* Skills Group Section */}
              <section className="space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <div className="h-5 w-5 rounded bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
                      <Sparkles className="h-3 w-3 text-amber-500" />
                    </div>
                    4. Core Competencies (Skills)
                  </h3>
                  <Button type="button" variant="outline" size="sm" onClick={addSkillGroup} className="h-7 text-[10px] gap-1 border-dashed">
                    <Plus className="h-3 w-3" /> Add
                  </Button>
                </div>
                <div className="space-y-4">
                  {cvData.skills.length === 0 && (
                    <p className="text-[11px] text-slate-400 italic py-2">No skills added yet. Click "Add" to create a skill category.</p>
                  )}
                  {cvData.skills.map((skill: any, idx: number) => (
                    <div key={idx} className="flex gap-4 items-start p-3 border border-slate-100 rounded-lg dark:border-slate-800">
                      <div className="flex-1 space-y-2">
                        <Input
                          placeholder="Category (e.g. Frameworks & Tools)"
                          value={skill.category}
                          onChange={(e) => handleSkillGroupChange(idx, "category", e.target.value)}
                        />
                        <Textarea
                          placeholder="Comma-separated items (e.g. Next.js, React, Node.js)"
                          rows={2}
                          value={skill.items}
                          onChange={(e) => handleSkillGroupChange(idx, "items", e.target.value)}
                        />
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removeSkillGroup(idx)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </section>

              {/* Work Experience Section */}
              <section className="space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <div className="h-5 w-5 rounded bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                      <Briefcase className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                    </div>
                    5. Work Experience
                  </h3>
                  <Button type="button" variant="outline" size="sm" onClick={addExperience} className="h-7 text-[10px] gap-1 border-dashed">
                    <Plus className="h-3 w-3" /> Add
                  </Button>
                </div>
                <div className="space-y-6">
                  {cvData.experience.length === 0 && (
                    <p className="text-[11px] text-slate-400 italic py-2">No work experience added yet. Click "Add" to create one.</p>
                  )}
                  {cvData.experience.map((exp: any, idx: number) => (
                    <div key={idx} className="p-4 border border-slate-100 dark:border-slate-800 rounded-xl space-y-4 bg-slate-50/50 dark:bg-slate-900/50">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-500">Position #{idx + 1}</span>
                        <Button variant="ghost" size="icon" onClick={() => removeExperience(idx)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Company Name</Label>
                          <Input
                            value={exp.company}
                            onChange={(e) => handleExperienceChange(idx, "company", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Location</Label>
                          <Input
                            value={exp.location}
                            placeholder="e.g. Kenya or Remote"
                            onChange={(e) => handleExperienceChange(idx, "location", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Role / Job Title</Label>
                          <Input
                            value={exp.role}
                            onChange={(e) => handleExperienceChange(idx, "role", e.target.value)}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-2">
                            <Label>Start Date</Label>
                            <Input
                              value={exp.startDate}
                              placeholder="e.g. Jan 2021"
                              onChange={(e) => handleExperienceChange(idx, "startDate", e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>End Date</Label>
                            <Input
                              value={exp.endDate}
                              placeholder="e.g. Present"
                              onChange={(e) => handleExperienceChange(idx, "endDate", e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="space-y-2 col-span-2">
                          <Label>Company Short Description</Label>
                          <Input
                            value={exp.companyDesc || ""}
                            onChange={(e) => handleExperienceChange(idx, "companyDesc", e.target.value)}
                          />
                        </div>

                        {/* Responsibilities list */}
                        <div className="col-span-2 space-y-2">
                          <div className="flex justify-between items-center">
                            <Label className="text-xs">Key Responsibilities / Accomplishments</Label>
                            <Button type="button" variant="ghost" size="sm" onClick={() => addRespToExperience(idx)} className="h-6 text-[10px] text-blue-600 gap-0.5">
                              <Plus className="h-2.5 w-2.5" /> Add bullet
                            </Button>
                          </div>
                          <div className="space-y-2">
                            {exp.responsibilities?.map((resp: string, rIdx: number) => (
                              <div key={rIdx} className="flex gap-2 items-center">
                                <Input
                                  value={resp}
                                  placeholder="e.g. Designed backend system for scaling ETL pipelines"
                                  onChange={(e) => handleRespChangeInExperience(idx, rIdx, e.target.value)}
                                  className="h-8 text-xs"
                                />
                                <Button variant="ghost" size="icon" onClick={() => removeRespFromExperience(idx, rIdx)} className="h-8 w-8 text-red-400 hover:text-red-600">
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Internships Section */}
              <section className="space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <div className="h-5 w-5 rounded bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                      <Briefcase className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    6. Internships
                  </h3>
                  <Button type="button" variant="outline" size="sm" onClick={addInternship} className="h-7 text-[10px] gap-1 border-dashed">
                    <Plus className="h-3 w-3" /> Add
                  </Button>
                </div>
                <div className="space-y-6">
                  {(!cvData.internships || cvData.internships.length === 0) && (
                    <p className="text-[11px] text-slate-400 italic py-2">No internships added yet. Click "Add" to create one.</p>
                  )}
                  {cvData.internships?.map((intern: any, idx: number) => (
                    <div key={idx} className="p-4 border border-slate-100 dark:border-slate-800 rounded-xl space-y-4 bg-slate-50/50 dark:bg-slate-900/50">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-500">Internship #{idx + 1}</span>
                        <Button variant="ghost" size="icon" onClick={() => removeInternship(idx)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Company Name</Label>
                          <Input
                            value={intern.company}
                            onChange={(e) => handleInternshipChange(idx, "company", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Location</Label>
                          <Input
                            value={intern.location}
                            onChange={(e) => handleInternshipChange(idx, "location", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Role / Title</Label>
                          <Input
                            value={intern.role}
                            onChange={(e) => handleInternshipChange(idx, "role", e.target.value)}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-2">
                            <Label>Start Date</Label>
                            <Input
                              value={intern.startDate}
                              onChange={(e) => handleInternshipChange(idx, "startDate", e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>End Date</Label>
                            <Input
                              value={intern.endDate}
                              onChange={(e) => handleInternshipChange(idx, "endDate", e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="space-y-2 col-span-2">
                          <Label>Company Short Description</Label>
                          <Input
                            value={intern.companyDesc || ""}
                            onChange={(e) => handleInternshipChange(idx, "companyDesc", e.target.value)}
                          />
                        </div>
                        <div className="col-span-2 space-y-2">
                          <div className="flex justify-between items-center">
                            <Label className="text-xs">Key Responsibilities</Label>
                            <Button type="button" variant="ghost" size="sm" onClick={() => addRespToInternship(idx)} className="h-6 text-[10px] text-blue-600 gap-0.5">
                              <Plus className="h-2.5 w-2.5" /> Add bullet
                            </Button>
                          </div>
                          <div className="space-y-2">
                            {intern.responsibilities?.map((resp: string, rIdx: number) => (
                              <div key={rIdx} className="flex gap-2 items-center">
                                <Input
                                  value={resp}
                                  onChange={(e) => handleRespChangeInInternship(idx, rIdx, e.target.value)}
                                  className="h-8 text-xs"
                                />
                                <Button variant="ghost" size="icon" onClick={() => removeRespFromInternship(idx, rIdx)} className="h-8 w-8 text-red-400 hover:text-red-600">
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Projects Section */}
              <section className="space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <div className="h-5 w-5 rounded bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
                      <FolderGit2 className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                    </div>
                    7. Key Projects
                  </h3>
                  <Button type="button" variant="outline" size="sm" onClick={addProject} className="h-7 text-[10px] gap-1 border-dashed">
                    <Plus className="h-3 w-3" /> Add
                  </Button>
                </div>
                <div className="space-y-4">
                  {cvData.projects.length === 0 && (
                    <p className="text-[11px] text-slate-400 italic py-2">No projects added yet. Click "Add" to create one.</p>
                  )}
                  {cvData.projects.map((proj: any, idx: number) => (
                    <div key={idx} className="p-4 border border-slate-100 dark:border-slate-800 rounded-xl space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-500">Project #{idx + 1}</span>
                        <Button variant="ghost" size="icon" onClick={() => removeProject(idx)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-[1fr_120px] gap-4">
                        <div className="space-y-2">
                          <Label>Project Title</Label>
                          <Input
                            value={proj.title}
                            onChange={(e) => handleProjectChange(idx, "title", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Year</Label>
                          <Input
                            value={proj.year || ""}
                            placeholder="e.g. 2025"
                            onChange={(e) => handleProjectChange(idx, "year", e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Project Description</Label>
                        <Textarea
                          value={proj.description}
                          rows={2}
                          onChange={(e) => handleProjectChange(idx, "description", e.target.value)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Education Section */}
              <section className="space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <div className="h-5 w-5 rounded bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center">
                      <GraduationCap className="h-3 w-3 text-violet-600 dark:text-violet-400" />
                    </div>
                    8. Education & Certifications
                  </h3>
                  <Button type="button" variant="outline" size="sm" onClick={addEducation} className="h-7 text-[10px] gap-1 border-dashed">
                    <Plus className="h-3 w-3" /> Add
                  </Button>
                </div>
                <div className="space-y-4">
                  {cvData.education.length === 0 && (
                    <p className="text-[11px] text-slate-400 italic py-2">No education added yet. Click "Add" to create one.</p>
                  )}
                  {cvData.education.map((edu: any, idx: number) => (
                    <div key={idx} className="p-4 border border-slate-100 dark:border-slate-800 rounded-xl space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-500">Education #{idx + 1}</span>
                        <Button variant="ghost" size="icon" onClick={() => removeEducation(idx)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-[1fr_120px] gap-4">
                        <div className="space-y-2">
                          <Label>Degree / Certificate</Label>
                          <Input
                            value={edu.degree}
                            onChange={(e) => handleEducationChange(idx, "degree", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Year of Completion</Label>
                          <Input
                            value={edu.year}
                            placeholder="e.g. 2019"
                            onChange={(e) => handleEducationChange(idx, "year", e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Institution</Label>
                        <Input
                          value={edu.institution}
                          onChange={(e) => handleEducationChange(idx, "institution", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Extra Details / Certifications</Label>
                        <Input
                          value={edu.details || ""}
                          placeholder="e.g. Red Hat Certification (2019)"
                          onChange={(e) => handleEducationChange(idx, "details", e.target.value)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* References Section */}
              <section className="space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <div className="h-5 w-5 rounded bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                      <MessageSquare className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    9. References
                  </h3>
                  <Button type="button" variant="outline" size="sm" onClick={addReference} className="h-7 text-[10px] gap-1 border-dashed">
                    <Plus className="h-3 w-3" /> Add
                  </Button>
                </div>
                <div className="space-y-4">
                  {cvData.references.length === 0 && (
                    <p className="text-[11px] text-slate-400 italic py-2">No references added yet. Click "Add" to create one.</p>
                  )}
                  {cvData.references.map((ref: any, idx: number) => (
                    <div key={idx} className="p-4 border border-slate-100 dark:border-slate-800 rounded-xl space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-500">Reference #{idx + 1}</span>
                        <Button variant="ghost" size="icon" onClick={() => removeReference(idx)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Reference Name</Label>
                          <Input
                            value={ref.name}
                            onChange={(e) => handleReferenceChange(idx, "name", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Title / Role</Label>
                          <Input
                            value={ref.title}
                            onChange={(e) => handleReferenceChange(idx, "title", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Company</Label>
                          <Input
                            value={ref.company}
                            onChange={(e) => handleReferenceChange(idx, "company", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Contact (Phone / Email)</Label>
                          <Input
                            value={ref.contact}
                            onChange={(e) => handleReferenceChange(idx, "contact", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2 col-span-2">
                          <Label>Address / Office Details</Label>
                          <Input
                            value={ref.address || ""}
                            onChange={(e) => handleReferenceChange(idx, "address", e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Languages Section */}
              <section className="space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <div className="h-5 w-5 rounded bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                      <Globe className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                    </div>
                    10. Languages
                  </h3>
                  <Button type="button" variant="outline" size="sm" onClick={addLanguage} className="h-7 text-[10px] gap-1 border-dashed">
                    <Plus className="h-3 w-3" /> Add
                  </Button>
                </div>
                <div className="space-y-3">
                  {(!cvData.languages || cvData.languages.length === 0) && (
                    <p className="text-[11px] text-slate-400 italic py-2">No languages added yet. Click "Add" to create one.</p>
                  )}
                  {cvData.languages?.map((lang: any, idx: number) => (
                    <div key={idx} className="flex gap-4 items-center">
                      <Input
                        placeholder="Language (e.g. English)"
                        value={lang.language}
                        onChange={(e) => handleLanguageChange(idx, "language", e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        placeholder="Proficiency (e.g. Professional)"
                        value={lang.proficiency}
                        onChange={(e) => handleLanguageChange(idx, "proficiency", e.target.value)}
                        className="flex-1"
                      />
                      <Button variant="ghost" size="icon" onClick={() => removeLanguage(idx)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </section>

              {/* Declaration & Extra Section */}
              <section className="space-y-4 border-t border-slate-100 dark:border-slate-800 pt-6">
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <div className="h-5 w-5 rounded bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                    <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  11. Declaration & Badge
                </h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="declaration">Declaration Statement</Label>
                    <Textarea
                      id="declaration"
                      rows={2}
                      value={cvData.declaration || ""}
                      onChange={(e) => setCvData({ ...cvData, declaration: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="verifiedBadge"
                      checked={cvData.verifiedBadge}
                      onCheckedChange={(checked) => setCvData({ ...cvData, verifiedBadge: !!checked })}
                    />
                    <Label htmlFor="verifiedBadge" className="text-xs text-slate-600 cursor-pointer">
                      Include a "Verified & Up-to-date" badge at the bottom of the CV
                    </Label>
                  </div>
                </div>
              </section>
            </TabsContent>

            {/* AI UPLOAD / EXTRACTION TAB */}
            <TabsContent value="upload" className="space-y-6 m-0 outline-none">

              {/* Enhancement Level Selector */}
              <div className="space-y-2">
                <Label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  Enhancement Level
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {ENHANCEMENT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setEnhancementLevel(opt.value)}
                      className={`text-left p-3 rounded-xl border-2 transition-all ${
                        enhancementLevel === opt.value
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                          : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <div className={`text-xs font-bold mb-0.5 ${enhancementLevel === opt.value ? "text-blue-700 dark:text-blue-300" : "text-slate-700 dark:text-slate-300"}`}>
                        {opt.label}
                      </div>
                      <div className="text-[10px] text-slate-500 leading-relaxed">{opt.description}</div>
                    </button>
                  ))}
                </div>
                {enhancementLevel !== "none" && (
                  <p className="text-[10px] text-slate-400 italic">
                    Company names, dates, job titles, and all factual details are never changed — only the language is improved.
                  </p>
                )}
              </div>

              {/* Upload Drop Zone */}
              <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-900/30 text-center gap-4">
                <div className="h-12 w-12 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600">
                  <Upload className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">Parse CV with Gemini AI</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-[320px] mx-auto">
                    Upload your current CV (PDF or Image). Gemini will extract all data{enhancementLevel !== "none" ? ` then apply ${enhancementLevel} enhancement` : ""}.
                  </p>
                </div>
                <div className="w-full max-w-[240px]">
                  <Input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="cv-file-upload"
                    disabled={isExtracting}
                  />
                  <Button asChild variant="outline" className="w-full cursor-pointer h-10" disabled={isExtracting}>
                    <label htmlFor="cv-file-upload">
                      Choose PDF / Image File
                    </label>
                  </Button>
                </div>
                <span className="text-[10px] text-slate-400">Supported formats: PDF, PNG, JPG (Max 5MB)</span>
              </div>

              {isExtracting && (
                <div className="flex flex-col items-center justify-center p-6 border border-blue-100 bg-blue-50/20 rounded-xl text-center gap-3">
                  <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-bold text-blue-700">AI Processing...</span>
                  <p className="text-[11px] text-blue-500 max-w-[280px]">{extractionProgress}</p>
                </div>
              )}

              <div className="flex items-start gap-3 p-4 border border-amber-100 bg-amber-50/20 rounded-xl text-amber-800 dark:text-amber-300 dark:border-amber-950/40 text-left">
                <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
                <div className="text-xs leading-relaxed">
                  <strong className="block font-bold mb-0.5">Note:</strong>
                  Extracted content replaces all current form fields. You can always review and edit anything after parsing.
                </div>
              </div>
            </TabsContent>

            {/* RAW DATA JSON TAB */}
            <TabsContent value="raw" className="space-y-4 m-0 outline-none flex-1 flex flex-col h-full">
              <Label className="text-xs font-bold">Copy/Paste CV JSON directly</Label>
              <Textarea
                className="flex-1 min-h-[360px] font-mono text-[10.5px] leading-relaxed bg-slate-900 text-slate-100 p-4 rounded-xl border-none focus:ring-1 focus:ring-blue-600"
                value={JSON.stringify(cvData, null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    setCvData(parsed);
                  } catch (err) {}
                }}
              />
              <span className="text-[10px] text-slate-400">You can paste compatible CV JSON configurations here to load files instantly.</span>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* RIGHT PANEL - Live Render A4 Preview (Zoomable / Floating Layout) */}
      <div className="flex-1 h-full flex flex-col bg-slate-100 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Preview Control Toolbar */}
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
          {/* Row 1: Theme selector + Zoom + Downloads */}
          <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              <span className="text-[10px] font-bold text-slate-500 px-2 flex items-center gap-1">
                <Palette className="h-3 w-3" /> Theme
              </span>
              {[
                { key: "theme1", label: "Classic" },
                { key: "theme2", label: "Modern" },
                { key: "theme3", label: "Minimal" }
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => setSelectedLayout(t.key)}
                  className={`text-[11px] font-semibold px-3 py-1.5 rounded-md transition-all ${
                    selectedLayout === t.key
                      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden h-8 bg-white dark:bg-slate-800">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setZoomLevel(Math.max(0.4, zoomLevel - 0.05))}
                  className="h-full w-8 rounded-none hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
                <span className="text-[11px] font-bold px-2 shrink-0 min-w-[40px] text-center border-x border-slate-100 dark:border-slate-700">{Math.round(zoomLevel * 100)}%</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setZoomLevel(Math.min(1.2, zoomLevel + 0.05))}
                  className="h-full w-8 rounded-none hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="w-px h-6 bg-slate-200 dark:bg-slate-700" />

              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadDocx}
                className="text-xs h-8 gap-1.5 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Download className="h-3.5 w-3.5" /> Word
              </Button>

              <Button
                size="sm"
                onClick={handleDownloadPdf}
                disabled={isDownloadingPdf}
                className="text-xs h-8 gap-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900"
              >
                {isDownloadingPdf ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent dark:border-slate-900 dark:border-t-transparent rounded-full animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" /> PDF
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Row 2: Customization toolbar */}
          <div className="px-4 pb-3 border-t border-slate-100 dark:border-slate-800 pt-2.5 flex flex-wrap items-center gap-5">
            {/* Photo controls */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Photo</span>
              <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden h-7 bg-white dark:bg-slate-800">
                {([100, 150, 200] as const).map((s, i) => (
                  <button
                    key={s}
                    onClick={() => updateCvSetting('photoSize', s)}
                    className={`px-2.5 text-[10px] font-bold h-full transition-colors ${cvSettings.photoSize === s ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'} ${i > 0 ? 'border-l border-slate-200 dark:border-slate-700' : ''}`}
                  >
                    {['S','M','L'][i]}
                  </button>
                ))}
              </div>
              <select
                value={cvSettings.photoFit}
                onChange={e => updateCvSetting('photoFit', e.target.value as any)}
                className="h-7 text-[10px] border border-slate-200 dark:border-slate-700 rounded-md px-2 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium"
              >
                <option value="cover">Cover</option>
                <option value="contain">Fit</option>
                <option value="fill">Stretch</option>
              </select>
              <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden h-7 bg-white dark:bg-slate-800">
                {(['square','circle','rounded'] as const).map((s, i) => (
                  <button
                    key={s}
                    onClick={() => updateCvSetting('photoShape', s)}
                    title={s.charAt(0).toUpperCase() + s.slice(1)}
                    className={`px-2 text-[10px] font-bold h-full transition-colors ${cvSettings.photoShape === s ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'} ${i > 0 ? 'border-l border-slate-200 dark:border-slate-700' : ''}`}
                  >
                    {s === 'square' ? '⬜' : s === 'circle' ? '⭕' : '▢'}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-px h-5 bg-slate-200 dark:bg-slate-700" />

            {/* Color presets */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Color</span>
              <div className="flex items-center gap-1.5">
                {COLOR_PRESETS.map(preset => (
                  <button
                    key={preset.name}
                    title={preset.name}
                    onClick={() => { updateCvSetting('primaryColor', preset.primary); updateCvSetting('accentColor', preset.accent); }}
                    className="relative w-5 h-5 rounded-full border-2 transition-all hover:scale-110"
                    style={{
                      background: `linear-gradient(135deg, ${preset.primary} 50%, ${preset.accent} 50%)`,
                      borderColor: (cvSettings.primaryColor === preset.primary && cvSettings.accentColor === preset.accent) ? '#000' : 'transparent',
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="w-px h-5 bg-slate-200 dark:bg-slate-700" />

            {/* Font scale */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Font</span>
              <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden h-7 bg-white dark:bg-slate-800">
                {([0.85, 1, 1.15] as const).map((s, i) => (
                  <button
                    key={s}
                    onClick={() => updateCvSetting('fontScale', s)}
                    className={`px-2.5 text-[10px] font-bold h-full transition-colors ${cvSettings.fontScale === s ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'} ${i > 0 ? 'border-l border-slate-200 dark:border-slate-700' : ''}`}
                  >
                    {['S','M','L'][i]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Zoom Canvas viewport */}
        <div className="flex-1 overflow-auto p-8 flex items-start justify-center relative bg-slate-200 dark:bg-slate-900/30">
          <div
            style={{
              transform: `scale(${zoomLevel})`,
              transformOrigin: "top center",
              transition: "transform 0.15s ease-out"
            }}
            className="shrink-0"
          >
            <div ref={previewRef} id="cv-preview-container">
              {renderLayout()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
