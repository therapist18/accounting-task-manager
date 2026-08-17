// Constants, seed data, and pure data-shaping helpers for the CV Generator.
// Nothing here touches React state — safe to import from any client or server context.

export const PASSPORT_PHOTO_ID = '48f48255-e5db-4944-8864-6f35b3af4696';
export const CLEAR_PHOTO_ID = 'fa74ff82-09ce-418d-8985-174158d73316';
export const CV_DOCUMENT_ID = 'd615e776-7d32-4704-b510-62287d459fae';

export const DEFAULT_DECLARATION_TEXT = "DECLARATION: I hereby declare that the above information is accurate to the best of my knowledge and reflects my professional qualifications, experience, and readiness for international employment opportunities.";

// ---------------------------------------------------------------------------
// CV data model — shared across page.tsx, the step editors, the preview, the
// theme engines and the export helpers so the whole module agrees on shapes.
// ---------------------------------------------------------------------------

export interface PersonalInfo {
  fullName: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  github: string;
  linkedin: string;
  photoUrl: string;
  portfolio?: string;
}

export interface PersonalDetails {
  dateOfBirth: string;
  nationality: string;
  maritalStatus: string;
  residence: string;
  kenyaStatus: string;
  nairobiRes: string;
  drivingExperience: string;
}

export interface SkillGroup {
  category: string;
  items: string;
}

export interface WorkEntry {
  company: string;
  location?: string;
  role: string;
  startDate: string;
  endDate: string;
  companyDesc?: string;
  responsibilities: string[] | string;
}

export interface ProjectEntry {
  title: string;
  description: string;
  year?: string;
}

export interface EducationEntry {
  degree: string;
  institution: string;
  year: string;
  details?: string;
}

export interface ReferenceEntry {
  name: string;
  title: string;
  company: string;
  address?: string;
  contact: string;
}

export interface LanguageEntry {
  language: string;
  proficiency: string;
}

export interface CertificationEntry {
  name: string;
  issuer: string;
  date: string;
  url: string;
}

export interface AchievementEntry {
  title: string;
  description: string;
  date: string;
}

export interface AdditionalInfoEntry {
  label: string;
  value: string;
}

export interface CvData {
  personalInfo: PersonalInfo;
  personalDetails: PersonalDetails;
  summary: string;
  skills: SkillGroup[];
  experience: WorkEntry[];
  internships: WorkEntry[];
  projects: ProjectEntry[];
  education: EducationEntry[];
  references: ReferenceEntry[];
  languages: LanguageEntry[];
  certifications: CertificationEntry[];
  achievements: AchievementEntry[];
  additionalInfo: AdditionalInfoEntry[];
  declaration: string;
  includeDeclaration: boolean;
  verifiedBadge: boolean;
}

export type PhotoFit = "cover" | "contain" | "fill";
export type PhotoShape = "square" | "circle" | "rounded";

export interface CvSettings {
  photoSize: number | string;
  photoFit: PhotoFit;
  photoShape: PhotoShape;
  primaryColor: string;
  accentColor: string;
  fontScale: number;
  fontFamily: string;
  showPhoto: boolean;
  showCustomize: boolean;
}

export const EMPTY_CV_DATA: CvData = {
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
  skills: [],
  experience: [],
  internships: [],
  projects: [],
  education: [],
  references: [],
  languages: [],
  certifications: [],
  achievements: [],
  additionalInfo: [],
  declaration: DEFAULT_DECLARATION_TEXT,
  includeDeclaration: true,
  verifiedBadge: true
};

export function mapSkillsFromExtractedDetails(ed: any): SkillGroup[] {
  const rawSkills = ed?.['Skills'] || ed?.skills;
  if (!Array.isArray(rawSkills) || rawSkills.length === 0) return [];
  return rawSkills.map((s: any): SkillGroup => {
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

export function mapCertificationsFromExtractedDetails(ed: any, qualificationsText?: string | null): CertificationEntry[] {
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

export function isSkillsBlank(skills: any[]): boolean {
  return !Array.isArray(skills) || skills.length === 0 || skills.every((s) => !s?.category && !s?.items);
}

export function isCertificationsBlank(certs: any[]): boolean {
  return !Array.isArray(certs) || certs.length === 0 || certs.every((c) => !c?.name && !c?.issuer && !c?.date && !c?.url);
}

export const COMMON_LANGUAGES = [
  'English', 'Swahili', 'French', 'Arabic', 'Mandarin', 'Spanish', 'Portuguese',
  'German', 'Italian', 'Dutch', 'Hindi', 'Urdu', 'Japanese', 'Korean', 'Russian',
  'Turkish', 'Polish', 'Swedish', 'Norwegian', 'Danish', 'Afrikaans', 'Zulu',
  'Amharic', 'Hausa', 'Yoruba', 'Igbo', 'Somali', 'Luganda', 'Kinyarwanda',
  'Shona', 'Oromo', 'Tigrinya', 'Lingala', 'Wolof'
];
export const PROFICIENCY_LEVELS = ['Native', 'Fluent', 'Professional', 'Conversational', 'Basic'];

// Initial Ajay Yadav data for interactive demo and first-load preview
export const initialCVData: CvData = {
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
      company: "Velvet Furniture",
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
      company: "KreditBee",
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

export type EnhancementLevel = "none" | "light" | "professional" | "executive";

export const ENHANCEMENT_OPTIONS: { value: EnhancementLevel; label: string; description: string }[] = [
  { value: "none",         label: "None",         description: "Extract content exactly as written" },
  { value: "light",        label: "Light Polish",  description: "Fix grammar & spelling only" },
  { value: "professional", label: "Professional",  description: "Action verbs, cleaner phrasing, no invented details" },
  { value: "executive",    label: "Executive",     description: "Strategic language, leadership framing, impact-focused" },
];

export const CONSENT_VERSION = 'v1-2026-07-01';

export const PRIVACY_NOTICE = {
  intro: "Before you continue, please review how BookSmart Consultancy Ltd. will use the information you provide below.",
  points: [
    { title: 'What we collect', body: 'Your contact details, work history, education, a professional photo, and other career-related information you choose to share — including personal details such as date of birth, nationality, and work-permit status where relevant to a role.' },
    { title: 'Why we collect it', body: 'Solely to prepare, verify, and present your CV to prospective employers and to support your job placement process.' },
    { title: 'Who we share it with', body: 'BookSmart Consultancy staff handling your application, the prospective employer/client you are being placed with, and any named referee/recommender whose details you provide. We do not sell your data or use it for unrelated marketing.' },
    { title: 'How long we keep it', body: 'For as long as your application is active, and for a reasonable period afterwards in case you are considered for future roles, unless you ask us to delete it sooner.' },
    { title: 'Your rights', body: 'You can ask to see, correct, or delete the information we hold about you at any time by contacting info@booksmartconsult.com.' },
  ],
};

export const LS_PREFIX = 'cv_generator_';

export function loadFromLocalStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(LS_PREFIX + key);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return fallback;
}

export function saveToLocalStorage(key: string, value: any) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch { /* ignore */ }
}

export interface CompletenessItem {
  id: string;
  label: string;
  status: 'success' | 'warning' | 'danger';
  missing: boolean;
  missingItems: string[];
  score: number;
}

export interface EmploymentGap {
  from: number;
  to: number;
  prevCompany: string;
  currCompany: string;
  gapYears: number;
}

export const analyzeCVCompleteness = (data: CvData | null | undefined) => {
  if (!data) return { completionPercent: 0, checklist: [] as CompletenessItem[], gaps: [] as EmploymentGap[] };
  const checklist: CompletenessItem[] = [];
  let filledWeight = 0;
  let totalWeight = 0;

  // Contact Info (20 pts)
  totalWeight += 20;
  const contactKeys: (keyof PersonalInfo)[] = ['fullName', 'email', 'phone', 'location'];
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
  const gaps: EmploymentGap[] = [];
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

export const getCVDiffs = (oldData: any, newData: any) => {
  if (!oldData || !newData) return [];
  const diffs: any[] = [];

  // Compare personalInfo
  const infoKeys: { key: keyof PersonalInfo; label: string }[] = [
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
  const detailKeys: { key: keyof PersonalDetails; label: string }[] = [
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

export const isJustYear = (dateStr: string): boolean => {
  if (!dateStr) return false;
  const trimmed = dateStr.trim();
  return /^(19|20)\d{2}$/.test(trimmed);
};

// Merges the AI's "enhance-full-cv" response back into the current CV data.
// Only wording-level fields (summary, skills, responsibilities, descriptions) are
// taken from the AI — factual/identity data (contact info, dates, company/institution
// names, declaration, references, certifications, etc.) is always kept exactly as the
// user already had it, regardless of what the model returned for those fields.
const mergeEnhancedList = (originalList: any[], aiList: any[]) => {
  if (!Array.isArray(originalList) || originalList.length === 0) return originalList;
  return originalList.map((orig: any, idx: number) => {
    const enhanced = Array.isArray(aiList) ? aiList[idx] : null;
    if (!enhanced) return orig;
    return {
      ...orig,
      companyDesc: enhanced.companyDesc || orig.companyDesc,
      responsibilities: Array.isArray(enhanced.responsibilities) && enhanced.responsibilities.length > 0
        ? enhanced.responsibilities
        : orig.responsibilities,
    };
  });
};

export const mergeAiEnhancedCv = (current: any, aiResult: any) => {
  if (!current) return current;
  if (!aiResult || typeof aiResult !== 'object') return current;

  return {
    ...current,
    summary: typeof aiResult.summary === 'string' && aiResult.summary.trim() ? aiResult.summary : current.summary,
    skills: Array.isArray(aiResult.skills) && aiResult.skills.length > 0 ? aiResult.skills : current.skills,
    experience: mergeEnhancedList(current.experience, aiResult.experience),
    internships: mergeEnhancedList(current.internships, aiResult.internships),
    projects: Array.isArray(current.projects) && Array.isArray(aiResult.projects)
      ? current.projects.map((p: any, i: number) => ({ ...p, description: aiResult.projects[i]?.description || p.description }))
      : current.projects,
    achievements: Array.isArray(current.achievements) && Array.isArray(aiResult.achievements)
      ? current.achievements.map((a: any, i: number) => ({ ...a, description: aiResult.achievements[i]?.description || a.description }))
      : current.achievements,
    // Everything else (personalInfo, personalDetails, education, references,
    // certifications, languages, additionalInfo, declaration, includeDeclaration,
    // verifiedBadge) is intentionally left untouched — spread from `current` above.
  };
};
