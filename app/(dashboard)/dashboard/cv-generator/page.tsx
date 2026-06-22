"use client";

import React, { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Trash2, 
  Download, 
  Upload, 
  User, 
  Briefcase, 
  GraduationCap, 
  FolderGit2, 
  Wrench, 
  Globe, 
  FileText, 
  Sparkles, 
  CheckCircle2, 
  FileSpreadsheet, 
  ArrowLeft,
  Settings,
  Phone,
  Mail,
  MapPin,
  Github,
  Linkedin,
  Clock,
  UserCheck
} from "lucide-react";
import { exportToDocx } from "@/lib/cvDocxExporter";

// Presets for theme colors
const THEME_PRESETS = [
  { name: "Deep Navy", primary: "#2c3e50", secondary: "#3498db", text: "#333", sidebarText: "#ecf0f1" },
  { name: "Charcoal Emerald", primary: "#2c3e50", secondary: "#10b981", text: "#333", sidebarText: "#f3f4f6" },
  { name: "Slate Violet", primary: "#1e293b", secondary: "#8b5cf6", text: "#1f2937", sidebarText: "#f8fafc" },
  { name: "Warm Burgundy", primary: "#4c0519", secondary: "#eab308", text: "#1c1917", sidebarText: "#fffbeb" },
  { name: "Midnight Teal", primary: "#0f172a", secondary: "#0d9488", text: "#1e293b", sidebarText: "#f0fdfa" },
];

const DEFAULT_CV_DATA = {
  personalInfo: {
    fullName: "Ajay Yadav",
    title: "Software Engineer & Automation Specialist",
    email: "ajay.yadav.dev@gmail.com",
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
  summary: "Results-driven Software Engineer, Advanced Automation Specialist, AI Workflow Integrator, and Business Owner with 6+ years of experience building enterprise-grade automation systems, browser automation frameworks, web scraping infrastructure, ETL pipelines, and business intelligence solutions across consulting, finance, recruitment, and operations sectors. Expert in Python, JavaScript, Playwright, Selenium, AI-powered productivity tools, cloud ecosystems, and process optimization. Demonstrated success in designing scalable automation for accounting firms, consulting businesses, regulatory workflows, and operational systems while also leading real-world business operations. Recognized for combining technical engineering excellence with strategic business understanding, making him uniquely positioned for software engineering, automation leadership, technical operations, and digital transformation roles in Kenya.",
  skills: [
    {
      category: "Software & Programming",
      items: ["Python", "R", "SQL", "MariaDB", "PostgreSQL", "MySQL", "JavaScript", "TypeScript", "PHP", "HTML5", "CSS3", "JSON", "XML", "Regex"]
    },
    {
      category: "Frameworks & Tools",
      items: ["Streamlit", "Dash", "Flask", "Next.js", "React", "Selenium", "Playwright", "Puppeteer", "Scrapy", "BeautifulSoup", "Requests", "Pandas", "NumPy", "Matplotlib", "Plotly", "Power BI", "GitHub", "Git", "REST APIs"]
    },
    {
      category: "AI & Productivity",
      items: ["ChatGPT / OpenAI", "Claude AI", "Google Gemini", "GitHub Copilot", "Prompt Engineering", "AI Workflow Automation", "LLM-assisted Development"]
    },
    {
      category: "Data & Cloud",
      items: ["ETL Pipelines", "AWS (EC2, Lambda, Load Balancers)", "Azure (ADF, Databricks)", "Linux/Microsoft Servers"]
    }
  ],
  languages: ["English (Professional)", "Hindi (Native)"],
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
        "Coordinate event execution, workforce scheduling, and financial oversight while ensuring customer satisfaction.",
        "Developed scalable operational systems to improve turnaround time and service reliability."
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
        "Built scalable data extraction systems for regulatory portals, financial platforms, and business intelligence use cases.",
        "Leveraged AI tools including ChatGPT, prompt engineering, workflow automation platforms, and intelligent scripting to optimize repetitive business functions.",
        "Developed end-to-end automation pipelines integrating APIs, browser scripting, OCR-adjacent extraction strategies, and cloud deployment workflows."
      ]
    },
    {
      company: "OceanFrogs Consulting Pvt. Ltd.",
      location: "Bangalore, India",
      role: "Web Scraping Engineer (Python)",
      startDate: "June 2019",
      endDate: "Nov 2020",
      companyDesc: "A consulting firm operating in Bangalore, India.",
      responsibilities: [
        "Designed and deployed enterprise-grade web crawlers for structured and unstructured data extraction.",
        "Optimized scraping systems for high-volume websites with anti-blocking resilience.",
        "Delivered clean datasets for recruitment, market intelligence, and analytics teams."
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
      companyDesc: "A specialized IT training institute and software solutions provider located in Jaipur, India.",
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
    },
    {
      title: "Indeed Global Job Crawler",
      description: "Automated multinational job scraping and structured recruitment intelligence. Cleaned and stored data for analytical applications.",
      year: ""
    }
  ],
  education: [
    {
      degree: "Bachelor of Computer Applications (B.C.A)",
      institution: "S.S Jain Subodh PG College",
      year: "2019",
      details: ""
    },
    {
      degree: "12th Grade",
      institution: "Rajasthan Board",
      year: "2016",
      details: ""
    }
  ],
  references: [
    {
      name: "Sandip Patel",
      title: "Director",
      company: "BookSmart Consultancy Ltd.",
      address: "Parksuits, Parklands, Nairobi, Kenya",
      contact: "info@booksmartconsult.com | +254 700 298298"
    }
  ],
  declaration: "I hereby declare that the above information is accurate to the best of my knowledge and reflects my professional qualifications, experience, and readiness for international employment opportunities.",
  verifiedBadge: true
};

export default function CVGeneratorPage() {
  const [cvData, setCvData] = useState<any>(DEFAULT_CV_DATA);
  const [activeTab, setActiveTab] = useState<string>("personal");
  const [activeLayout, setActiveLayout] = useState<string>("traditional");
  const [activeTheme, setActiveTheme] = useState<any>(THEME_PRESETS[0]);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractionProgress, setExtractionProgress] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [successMsg, setSuccessMsg] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dynamic updates for personalInfo
  const handlePersonalInfoChange = (field: string, value: string) => {
    setCvData((prev: any) => ({
      ...prev,
      personalInfo: {
        ...prev.personalInfo,
        [field]: value
      }
    }));
  };

  // Dynamic updates for personalDetails
  const handlePersonalDetailsChange = (field: string, value: string) => {
    setCvData((prev: any) => ({
      ...prev,
      personalDetails: {
        ...prev.personalDetails,
        [field]: value
      }
    }));
  };

  // Dynamic updates for Experience
  const handleExperienceChange = (index: number, field: string, value: any) => {
    setCvData((prev: any) => {
      const exp = [...prev.experience];
      exp[index] = { ...exp[index], [field]: value };
      return { ...prev, experience: exp };
    });
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

  const removeExperience = (index: number) => {
    setCvData((prev: any) => ({
      ...prev,
      experience: prev.experience.filter((_: any, i: number) => i !== index)
    }));
  };

  const handleRespChange = (expIndex: number, respIndex: number, value: string) => {
    setCvData((prev: any) => {
      const exp = [...prev.experience];
      const resps = [...exp[expIndex].responsibilities];
      resps[respIndex] = value;
      exp[expIndex] = { ...exp[expIndex], responsibilities: resps };
      return { ...prev, experience: exp };
    });
  };

  const addResp = (expIndex: number) => {
    setCvData((prev: any) => {
      const exp = [...prev.experience];
      exp[expIndex] = {
        ...exp[expIndex],
        responsibilities: [...exp[expIndex].responsibilities, ""]
      };
      return { ...prev, experience: exp };
    });
  };

  const removeResp = (expIndex: number, respIndex: number) => {
    setCvData((prev: any) => {
      const exp = [...prev.experience];
      exp[expIndex] = {
        ...exp[expIndex],
        responsibilities: exp[expIndex].responsibilities.filter((_: any, i: number) => i !== respIndex)
      };
      return { ...prev, experience: exp };
    });
  };

  // Dynamic updates for Internships
  const handleInternshipChange = (index: number, field: string, value: any) => {
    setCvData((prev: any) => {
      const intern = [...prev.internships];
      intern[index] = { ...intern[index], [field]: value };
      return { ...prev, internships: intern };
    });
  };

  const addInternship = () => {
    setCvData((prev: any) => ({
      ...prev,
      internships: [
        ...(prev.internships || []),
        { company: "", location: "", role: "", startDate: "", endDate: "", companyDesc: "", responsibilities: [""] }
      ]
    }));
  };

  const removeInternship = (index: number) => {
    setCvData((prev: any) => ({
      ...prev,
      internships: (prev.internships || []).filter((_: any, i: number) => i !== index)
    }));
  };

  // Dynamic updates for Skills
  const handleSkillCategoryChange = (index: number, value: string) => {
    setCvData((prev: any) => {
      const skills = [...prev.skills];
      skills[index] = { ...skills[index], category: value };
      return { ...prev, skills };
    });
  };

  const handleSkillItemsChange = (index: number, value: string) => {
    setCvData((prev: any) => {
      const skills = [...prev.skills];
      skills[index] = { ...skills[index], items: value.split(",").map(s => s.trim()) };
      return { ...prev, skills };
    });
  };

  const addSkillGroup = () => {
    setCvData((prev: any) => ({
      ...prev,
      skills: [...prev.skills, { category: "", items: [] }]
    }));
  };

  const removeSkillGroup = (index: number) => {
    setCvData((prev: any) => ({
      ...prev,
      skills: prev.skills.filter((_: any, i: number) => i !== index)
    }));
  };

  // Dynamic updates for Projects
  const handleProjectChange = (index: number, field: string, value: string) => {
    setCvData((prev: any) => {
      const projs = [...prev.projects];
      projs[index] = { ...projs[index], [field]: value };
      return { ...prev, projects: projs };
    });
  };

  const addProject = () => {
    setCvData((prev: any) => ({
      ...prev,
      projects: [...prev.projects, { title: "", description: "", year: "" }]
    }));
  };

  const removeProject = (index: number) => {
    setCvData((prev: any) => ({
      ...prev,
      projects: prev.projects.filter((_: any, i: number) => i !== index)
    }));
  };

  // Dynamic updates for Education
  const handleEducationChange = (index: number, field: string, value: string) => {
    setCvData((prev: any) => {
      const edus = [...prev.education];
      edus[index] = { ...edus[index], [field]: value };
      return { ...prev, education: edus };
    });
  };

  const addEducation = () => {
    setCvData((prev: any) => ({
      ...prev,
      education: [...prev.education, { degree: "", institution: "", year: "", details: "" }]
    }));
  };

  const removeEducation = (index: number) => {
    setCvData((prev: any) => ({
      ...prev,
      education: prev.education.filter((_: any, i: number) => i !== index)
    }));
  };

  // Dynamic updates for References
  const handleReferenceChange = (index: number, field: string, value: string) => {
    setCvData((prev: any) => {
      const refs = [...prev.references];
      refs[index] = { ...refs[index], [field]: value };
      return { ...prev, references: refs };
    });
  };

  const addReference = () => {
    setCvData((prev: any) => ({
      ...prev,
      references: [...prev.references, { name: "", title: "", company: "", address: "", contact: "" }]
    }));
  };

  const removeReference = (index: number) => {
    setCvData((prev: any) => ({
      ...prev,
      references: prev.references.filter((_: any, i: number) => i !== index)
    }));
  };

  // Dynamic updates for Languages
  const handleLanguagesChange = (value: string) => {
    setCvData((prev: any) => ({
      ...prev,
      languages: value.split(",").map(l => l.trim()).filter(Boolean)
    }));
  };

  // Handle CV Document Extraction using Gemini
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtracting(true);
    setErrorMsg("");
    setSuccessMsg("");
    setExtractionProgress("Reading file content...");

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const result = reader.result as string;
          // Extract base64 prefix
          const base64Data = result.split(",")[1];
          const mimeType = file.type;

          setExtractionProgress("Extracting details using Gemini AI...");

          const response = await fetch("/api/cv/extract", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              fileBase64: base64Data,
              mimeType: mimeType,
            }),
          });

          if (!response.ok) {
            throw new Error("Failed to extract CV details");
          }

          const parsedCV = await response.json();
          console.log("Extracted CV Data:", parsedCV);

          // Populate the CV form with the parsed values
          // Fallback to defaults for empty fields to prevent broken layout
          setCvData({
            personalInfo: {
              fullName: parsedCV.personalInfo?.fullName || parsedCV.fullName || "",
              title: parsedCV.personalInfo?.title || parsedCV.title || "",
              email: parsedCV.personalInfo?.email || parsedCV.email || "",
              phone: parsedCV.personalInfo?.phone || parsedCV.phone || "",
              location: parsedCV.personalInfo?.location || parsedCV.location || "",
              github: parsedCV.personalInfo?.github || parsedCV.github || "",
              linkedin: parsedCV.personalInfo?.linkedin || parsedCV.linkedin || "",
              photoUrl: ""
            },
            personalDetails: {
              dateOfBirth: parsedCV.personalDetails?.dateOfBirth || "",
              nationality: parsedCV.personalDetails?.nationality || "",
              maritalStatus: parsedCV.personalDetails?.maritalStatus || "",
              residence: parsedCV.personalDetails?.residence || "",
              kenyaStatus: parsedCV.personalDetails?.kenyaStatus || "",
              nairobiRes: parsedCV.personalDetails?.nairobiRes || "",
              drivingExperience: parsedCV.personalDetails?.drivingExperience || ""
            },
            summary: parsedCV.summary || "",
            skills: Array.isArray(parsedCV.skills) ? parsedCV.skills : [],
            languages: Array.isArray(parsedCV.languages) ? parsedCV.languages : [],
            experience: Array.isArray(parsedCV.experience) ? parsedCV.experience : [],
            internships: Array.isArray(parsedCV.internships) ? parsedCV.internships : [],
            projects: Array.isArray(parsedCV.projects) ? parsedCV.projects : [],
            education: Array.isArray(parsedCV.education) ? parsedCV.education : [],
            references: Array.isArray(parsedCV.references) ? parsedCV.references : [],
            declaration: parsedCV.declaration || "",
            verifiedBadge: parsedCV.verifiedBadge !== undefined ? parsedCV.verifiedBadge : true
          });

          setSuccessMsg("CV data parsed and populated successfully!");
          setActiveTab("personal");
        } catch (err: any) {
          console.error(err);
          setErrorMsg("Failed to extract details from CV. Please fill in the details manually.");
        } finally {
          setIsExtracting(false);
          setExtractionProgress("");
        }
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Failed to read the file. Please try again.");
      setIsExtracting(false);
      setExtractionProgress("");
    }
  };

  // Client-side PDF generation using html2canvas & jsPDF
  const handleDownloadPdf = async () => {
    const btn = document.getElementById("btn-pdf-download");
    if (!btn) return;
    const originalLabel = btn.innerHTML;
    btn.innerHTML = '<span class="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> Generating PDF...';
    (btn as HTMLButtonElement).disabled = true;

    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");

      const cvElement = document.getElementById("cv-preview-page");
      if (!cvElement) throw new Error("Preview element not found");

      // Set scale and configurations
      const canvas = await html2canvas(cvElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

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

      const name = cvData.personalInfo?.fullName || "CV";
      pdf.save(`${name.replace(/\s+/g, "_")}_CV.pdf`);
      setSuccessMsg("PDF downloaded successfully!");
    } catch (error) {
      console.error("PDF generation failed", error);
      setErrorMsg("Failed to generate PDF download.");
    } finally {
      btn.innerHTML = originalLabel;
      (btn as HTMLButtonElement).disabled = false;
    }
  };

  // Word Document download
  const handleDownloadDocx = async () => {
    try {
      await exportToDocx(cvData);
      setSuccessMsg("Word document downloaded successfully!");
    } catch (error) {
      console.error("Word export failed", error);
      setErrorMsg("Failed to export Word document.");
    }
  };

  // Preview Layout Renderers
  const renderTraditionalLayout = () => {
    const { personalInfo = {}, personalDetails = {}, summary = "", skills = [], languages = [], experience = [], internships = [], projects = [], education = [], references = [], declaration = "", verifiedBadge = true } = cvData;

    return (
      <div 
        id="cv-preview-page"
        className="w-[210mm] min-h-[297mm] bg-white text-slate-800 text-left grid grid-cols-[280px_1fr] shadow-2xl relative"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        {/* Sidebar */}
        <aside className="p-6 flex flex-col gap-6" style={{ backgroundColor: activeTheme.primary, color: activeTheme.sidebarText }}>
          {/* Avatar Area */}
          <div className="flex justify-center mb-2">
            <div className="w-36 h-36 border-4 rounded-xl flex items-center justify-center bg-white/10" style={{ borderColor: activeTheme.secondary }}>
              <User className="w-20 h-20 opacity-80" />
            </div>
          </div>

          {/* Contact details */}
          <div className="flex flex-col gap-3">
            <div className="text-[11px] font-extrabold uppercase tracking-wider pb-1 border-b border-white/20" style={{ color: activeTheme.secondary }}>
              Contact Information
            </div>
            <div className="text-[11px] flex items-center gap-2"><MapPin className="w-3.5 h-3.5" style={{ color: activeTheme.secondary }} /> {personalInfo.location || "Jaipur, India"}</div>
            <div className="text-[11px] flex items-center gap-2"><Phone className="w-3.5 h-3.5" style={{ color: activeTheme.secondary }} /> {personalInfo.phone || "+91-8949544021"}</div>
            <div className="text-[11px] flex items-center gap-2 truncate"><Mail className="w-3.5 h-3.5" style={{ color: activeTheme.secondary }} /> {personalInfo.email || "email@example.com"}</div>
            {personalInfo.github && (
              <div className="text-[11px] flex items-center gap-2 truncate">
                <Github className="w-3.5 h-3.5" style={{ color: activeTheme.secondary }} />
                <span>{personalInfo.github}</span>
              </div>
            )}
            {personalInfo.linkedin && (
              <div className="text-[11px] flex items-center gap-2 truncate">
                <Linkedin className="w-3.5 h-3.5" style={{ color: activeTheme.secondary }} />
                <span>{personalInfo.linkedin}</span>
              </div>
            )}
          </div>

          {/* Personal details */}
          {Object.keys(personalDetails).some(k => personalDetails[k]) && (
            <div className="flex flex-col gap-2">
              <div className="text-[11px] font-extrabold uppercase tracking-wider pb-1 border-b border-white/20" style={{ color: activeTheme.secondary }}>
                Personal Details
              </div>
              {personalDetails.dateOfBirth && <div className="text-[10px]"><strong style={{ color: activeTheme.secondary }}>DOB:</strong> {personalDetails.dateOfBirth}</div>}
              {personalDetails.nationality && <div className="text-[10px]"><strong style={{ color: activeTheme.secondary }}>Nationality:</strong> {personalDetails.nationality}</div>}
              {personalDetails.maritalStatus && <div className="text-[10px]"><strong style={{ color: activeTheme.secondary }}>Marital:</strong> {personalDetails.maritalStatus}</div>}
              {personalDetails.residence && <div className="text-[10px]"><strong style={{ color: activeTheme.secondary }}>Residence:</strong> {personalDetails.residence}</div>}
              {personalDetails.kenyaStatus && <div className="text-[10px]"><strong style={{ color: activeTheme.secondary }}>Kenya Permit:</strong> {personalDetails.kenyaStatus}</div>}
              {personalDetails.nairobiRes && <div className="text-[10px]"><strong style={{ color: activeTheme.secondary }}>Nairobi Res:</strong> {personalDetails.nairobiRes}</div>}
              {personalDetails.drivingExperience && <div className="text-[10px]"><strong style={{ color: activeTheme.secondary }}>Driving:</strong> {personalDetails.drivingExperience}</div>}
            </div>
          )}

          {/* Skills */}
          <div className="flex flex-col gap-4">
            <div className="text-[11px] font-extrabold uppercase tracking-wider pb-1 border-b border-white/20" style={{ color: activeTheme.secondary }}>
              Core Competencies
            </div>
            {skills.map((skill: any, idx: number) => (
              <div key={idx} className="flex flex-col gap-1">
                <div className="text-[10px] font-extrabold underline decoration-white/20 underline-offset-4">{skill.category}</div>
                <div className="text-[9.5px] opacity-90 leading-relaxed">
                  {Array.isArray(skill.items) ? skill.items.join(", ") : skill.items || ""}
                </div>
              </div>
            ))}
          </div>

          {/* Languages */}
          {languages.length > 0 && (
            <div className="flex flex-col gap-2 mt-auto pt-6">
              <div className="text-[11px] font-extrabold uppercase tracking-wider pb-1 border-b border-white/20" style={{ color: activeTheme.secondary }}>
                Languages
              </div>
              <div className="text-[10px] flex flex-col gap-1 opacity-90">
                {languages.map((l: string, i: number) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Main Content */}
        <main className="p-8 flex flex-col gap-6">
          {/* Header */}
          <div className="pb-4 border-b-4 flex flex-col gap-1" style={{ borderColor: activeTheme.primary }}>
            <h1 className="text-3xl font-extrabold tracking-tight uppercase" style={{ color: activeTheme.primary }}>
              {personalInfo.fullName || "Your Name"}
            </h1>
            <p className="text-sm font-bold uppercase tracking-wider" style={{ color: activeTheme.secondary }}>
              {personalInfo.title || "Professional Title"}
            </p>
          </div>

          {/* Profile summary */}
          {summary && (
            <div className="flex flex-col gap-2">
              <div className="text-[11px] font-extrabold uppercase py-1.5 px-3 border-l-4" style={{ backgroundColor: `${activeTheme.secondary}15`, borderColor: activeTheme.secondary, color: activeTheme.primary }}>
                Professional Profile
              </div>
              <p className="text-[11.5px] leading-relaxed text-justify text-slate-600">
                {summary}
              </p>
            </div>
          )}

          {/* Experience */}
          {experience.length > 0 && (
            <div className="flex flex-col gap-4">
              <div className="text-[11px] font-extrabold uppercase py-1.5 px-3 border-l-4" style={{ backgroundColor: `${activeTheme.secondary}15`, borderColor: activeTheme.secondary, color: activeTheme.primary }}>
                Professional Experience
              </div>
              <div className="flex flex-col gap-4">
                {experience.map((exp: any, idx: number) => (
                  <div key={idx} className="flex flex-col gap-1">
                    <div className="flex justify-between items-center text-xs font-bold text-slate-800">
                      <span>{exp.company} <span className="text-[10px] font-normal text-slate-500">({exp.location})</span></span>
                      <span className="text-[10px]">{exp.startDate} – {exp.endDate}</span>
                    </div>
                    <div className="text-[11px] font-semibold" style={{ color: activeTheme.secondary }}>{exp.role}</div>
                    {exp.companyDesc && <div className="text-[9.5px] text-slate-500 italic leading-snug">{exp.companyDesc}</div>}
                    <ul className="list-disc pl-4 text-[10.5px] text-slate-600 leading-relaxed mt-1 flex flex-col gap-0.5">
                      {Array.isArray(exp.responsibilities) && exp.responsibilities.map((resp: string, rIdx: number) => (
                        <li key={rIdx}>{resp}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Internships */}
          {internships && internships.length > 0 && (
            <div className="flex flex-col gap-4">
              <div className="text-[11px] font-extrabold uppercase py-1.5 px-3 border-l-4" style={{ backgroundColor: `${activeTheme.secondary}15`, borderColor: activeTheme.secondary, color: activeTheme.primary }}>
                Internship
              </div>
              <div className="flex flex-col gap-4">
                {internships.map((intern: any, idx: number) => (
                  <div key={idx} className="flex flex-col gap-1">
                    <div className="flex justify-between items-center text-xs font-bold text-slate-800">
                      <span>{intern.company} <span className="text-[10px] font-normal text-slate-500">({intern.location})</span></span>
                      <span className="text-[10px]">{intern.startDate} – {intern.endDate}</span>
                    </div>
                    <div className="text-[11px] font-semibold" style={{ color: activeTheme.secondary }}>{intern.role}</div>
                    {intern.companyDesc && <div className="text-[9.5px] text-slate-500 italic leading-snug">{intern.companyDesc}</div>}
                    <ul className="list-disc pl-4 text-[10.5px] text-slate-600 leading-relaxed mt-1 flex flex-col gap-0.5">
                      {Array.isArray(intern.responsibilities) && intern.responsibilities.map((resp: string, rIdx: number) => (
                        <li key={rIdx}>{resp}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Projects */}
          {projects.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="text-[11px] font-extrabold uppercase py-1.5 px-3 border-l-4" style={{ backgroundColor: `${activeTheme.secondary}15`, borderColor: activeTheme.secondary, color: activeTheme.primary }}>
                Key Projects
              </div>
              <div className="grid grid-cols-2 gap-3">
                {projects.map((proj: any, idx: number) => (
                  <div key={idx} className="p-2.5 border border-slate-100 rounded-lg bg-slate-50/50">
                    <div className="text-[11px] font-bold text-slate-800 flex justify-between">
                      <span>{proj.title}</span>
                      {proj.year && <span className="text-[9px] text-slate-400 font-normal">{proj.year}</span>}
                    </div>
                    <p className="text-[9.5px] text-slate-600 leading-relaxed mt-1">{proj.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Education */}
          {education.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="text-[11px] font-extrabold uppercase py-1.5 px-3 border-l-4" style={{ backgroundColor: `${activeTheme.secondary}15`, borderColor: activeTheme.secondary, color: activeTheme.primary }}>
                Education & Certifications
              </div>
              <div className="flex flex-col gap-2">
                {education.map((edu: any, idx: number) => (
                  <div key={idx} className="text-[11px] text-slate-600">
                    <strong className="text-slate-850">{edu.degree}</strong> – {edu.institution} <span className="text-slate-400">({edu.year})</span>
                    {edu.details && <p className="text-[9.5px] text-slate-400 mt-0.5">{edu.details}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* References */}
          {references.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="text-[11px] font-extrabold uppercase py-1.5 px-3 border-l-4" style={{ backgroundColor: `${activeTheme.secondary}15`, borderColor: activeTheme.secondary, color: activeTheme.primary }}>
                References
              </div>
              <div className="flex flex-col gap-3">
                {references.map((ref: any, idx: number) => (
                  <div key={idx} className="text-[10px] text-slate-600 leading-snug">
                    <strong className="text-slate-850 text-[10.5px]">{ref.name}</strong> <br />
                    {ref.title} | {ref.company} <br />
                    {ref.address && <span>{ref.address} <br /></span>}
                    <span style={{ color: activeTheme.secondary }}>{ref.contact}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Declaration */}
          {declaration && (
            <div className="pt-4 border-t border-slate-100 flex flex-col gap-2 mt-auto">
              <p className="text-[9.5px] italic text-slate-500 leading-relaxed">
                DECLARATION: {declaration}
              </p>
              {verifiedBadge && (
                <div className="self-start text-[8.5px] font-extrabold text-white uppercase py-1 px-3.5 rounded flex items-center gap-1.5" style={{ backgroundColor: "#10b981" }}>
                  <CheckCircle2 className="w-3.5 h-3.5 fill-white text-[#10b981]" /> CV Verified & Up-to-date
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    );
  };

  const renderModernLayout = () => {
    const { personalInfo = {}, personalDetails = {}, summary = "", skills = [], languages = [], experience = [], internships = [], projects = [], education = [], references = [], declaration = "", verifiedBadge = true } = cvData;

    return (
      <div 
        id="cv-preview-page"
        className="w-[210mm] min-h-[297mm] bg-white text-slate-800 text-left p-8 flex flex-col gap-6 shadow-2xl relative"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        {/* Full-width elegant header with active theme colors */}
        <header className="p-6 rounded-xl text-white flex justify-between items-center" style={{ backgroundColor: activeTheme.primary }}>
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-black tracking-tight uppercase">{personalInfo.fullName || "Your Name"}</h1>
            <p className="text-sm font-bold uppercase tracking-widest" style={{ color: activeTheme.secondary }}>
              {personalInfo.title || "Professional Title"}
            </p>
          </div>
          <div className="text-[10px] text-slate-300 flex flex-col gap-1 items-end font-medium">
            <div>{personalInfo.location}</div>
            <div>{personalInfo.phone}</div>
            <div>{personalInfo.email}</div>
            {personalInfo.linkedin && <div>{personalInfo.linkedin}</div>}
            {personalInfo.github && <div>{personalInfo.github}</div>}
          </div>
        </header>

        {/* Dynamic 2-column details below header */}
        <div className="grid grid-cols-[1fr_260px] gap-6">
          {/* Left Column: Summary, Experience, Internships, Projects */}
          <div className="flex flex-col gap-6">
            {/* Summary */}
            {summary && (
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-black uppercase tracking-wider border-b-2 pb-1" style={{ borderColor: activeTheme.secondary, color: activeTheme.primary }}>
                  Professional Profile
                </h3>
                <p className="text-[11px] leading-relaxed text-justify text-slate-650">{summary}</p>
              </div>
            )}

            {/* Experience */}
            {experience.length > 0 && (
              <div className="flex flex-col gap-4">
                <h3 className="text-xs font-black uppercase tracking-wider border-b-2 pb-1" style={{ borderColor: activeTheme.secondary, color: activeTheme.primary }}>
                  Professional Experience
                </h3>
                <div className="flex flex-col gap-4">
                  {experience.map((exp: any, idx: number) => (
                    <div key={idx} className="flex flex-col gap-1">
                      <div className="flex justify-between items-center text-xs font-bold">
                        <span className="text-slate-800">{exp.company}</span>
                        <span className="text-[9.5px] text-slate-500 font-medium">{exp.startDate} – {exp.endDate}</span>
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: activeTheme.secondary }}>
                        {exp.role} <span className="text-[9px] font-normal text-slate-400 lowercase italic">({exp.location})</span>
                      </div>
                      {exp.companyDesc && <div className="text-[9px] text-slate-500 leading-snug">{exp.companyDesc}</div>}
                      <ul className="list-disc pl-4 text-[10px] text-slate-600 leading-relaxed mt-1 flex flex-col gap-0.5">
                        {Array.isArray(exp.responsibilities) && exp.responsibilities.map((resp: string, rIdx: number) => (
                          <li key={rIdx}>{resp}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Internships */}
            {internships && internships.length > 0 && (
              <div className="flex flex-col gap-4">
                <h3 className="text-xs font-black uppercase tracking-wider border-b-2 pb-1" style={{ borderColor: activeTheme.secondary, color: activeTheme.primary }}>
                  Internships
                </h3>
                <div className="flex flex-col gap-4">
                  {internships.map((intern: any, idx: number) => (
                    <div key={idx} className="flex flex-col gap-1">
                      <div className="flex justify-between items-center text-xs font-bold">
                        <span className="text-slate-800">{intern.company}</span>
                        <span className="text-[9.5px] text-slate-500 font-medium">{intern.startDate} – {intern.endDate}</span>
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: activeTheme.secondary }}>
                        {intern.role} <span className="text-[9px] font-normal text-slate-400 lowercase italic">({intern.location})</span>
                      </div>
                      {intern.companyDesc && <div className="text-[9px] text-slate-500 leading-snug">{intern.companyDesc}</div>}
                      <ul className="list-disc pl-4 text-[10px] text-slate-600 leading-relaxed mt-1 flex flex-col gap-0.5">
                        {Array.isArray(intern.responsibilities) && intern.responsibilities.map((resp: string, rIdx: number) => (
                          <li key={rIdx}>{resp}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Personal details, Competencies, Projects, Education, References */}
          <div className="flex flex-col gap-6">
            {/* Personal Details */}
            {Object.keys(personalDetails).some(k => personalDetails[k]) && (
              <div className="p-4 rounded-lg bg-slate-50 flex flex-col gap-2">
                <h4 className="text-[10px] font-black uppercase tracking-wider pb-1 border-b" style={{ color: activeTheme.primary, borderColor: `${activeTheme.primary}20` }}>
                  Personal Information
                </h4>
                {personalDetails.dateOfBirth && <div className="text-[9.5px]"><strong className="text-slate-550">DOB:</strong> {personalDetails.dateOfBirth}</div>}
                {personalDetails.nationality && <div className="text-[9.5px]"><strong className="text-slate-550">Nationality:</strong> {personalDetails.nationality}</div>}
                {personalDetails.maritalStatus && <div className="text-[9.5px]"><strong className="text-slate-550">Marital:</strong> {personalDetails.maritalStatus}</div>}
                {personalDetails.residence && <div className="text-[9.5px]"><strong className="text-slate-550">Residence:</strong> {personalDetails.residence}</div>}
                {personalDetails.kenyaStatus && <div className="text-[9.5px]"><strong className="text-slate-550">Kenya Permit:</strong> {personalDetails.kenyaStatus}</div>}
                {personalDetails.nairobiRes && <div className="text-[9.5px]"><strong className="text-slate-550">Nairobi Res:</strong> {personalDetails.nairobiRes}</div>}
              </div>
            )}

            {/* Skills */}
            <div className="flex flex-col gap-3">
              <h4 className="text-[10px] font-black uppercase tracking-wider pb-1 border-b" style={{ color: activeTheme.primary, borderColor: `${activeTheme.primary}20` }}>
                Competencies
              </h4>
              {skills.map((skill: any, idx: number) => (
                <div key={idx} className="flex flex-col gap-0.5">
                  <div className="text-[9px] font-bold text-slate-800">{skill.category}</div>
                  <div className="text-[9px] text-slate-550 leading-tight">
                    {Array.isArray(skill.items) ? skill.items.join(", ") : skill.items || ""}
                  </div>
                </div>
              ))}
            </div>

            {/* Projects */}
            {projects.length > 0 && (
              <div className="flex flex-col gap-3">
                <h4 className="text-[10px] font-black uppercase tracking-wider pb-1 border-b" style={{ color: activeTheme.primary, borderColor: `${activeTheme.primary}20` }}>
                  Key Projects
                </h4>
                {projects.map((proj: any, idx: number) => (
                  <div key={idx} className="text-[9.5px]">
                    <strong className="text-slate-850 font-bold block">{proj.title} {proj.year && `(${proj.year})`}</strong>
                    <span className="text-slate-550 leading-relaxed">{proj.description}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Education */}
            {education.length > 0 && (
              <div className="flex flex-col gap-2">
                <h4 className="text-[10px] font-black uppercase tracking-wider pb-1 border-b" style={{ color: activeTheme.primary, borderColor: `${activeTheme.primary}20` }}>
                  Education
                </h4>
                {education.map((edu: any, idx: number) => (
                  <div key={idx} className="text-[9.5px] leading-relaxed">
                    <strong className="text-slate-800 block">{edu.degree}</strong>
                    <span className="text-slate-550">{edu.institution} ({edu.year})</span>
                  </div>
                ))}
              </div>
            )}

            {/* References */}
            {references.length > 0 && (
              <div className="flex flex-col gap-2">
                <h4 className="text-[10px] font-black uppercase tracking-wider pb-1 border-b" style={{ color: activeTheme.primary, borderColor: `${activeTheme.primary}20` }}>
                  References
                </h4>
                {references.map((ref: any, idx: number) => (
                  <div key={idx} className="text-[9px] text-slate-550 leading-tight">
                    <strong className="text-slate-800 block">{ref.name}</strong>
                    {ref.title} • {ref.company} <br />
                    <span style={{ color: activeTheme.secondary }}>{ref.contact}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Declaration footer */}
        {declaration && (
          <div className="mt-auto pt-6 border-t border-slate-100 flex flex-col gap-2">
            <p className="text-[9px] italic text-slate-500 leading-relaxed">
              {declaration}
            </p>
            {verifiedBadge && (
              <div className="self-start text-[8px] font-extrabold text-white uppercase py-1 px-3 rounded flex items-center gap-1 bg-[#10b981]">
                <CheckCircle2 className="w-3.5 h-3.5 fill-white text-[#10b981]" /> Verified Professional CV
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderMinimalistLayout = () => {
    const { personalInfo = {}, personalDetails = {}, summary = "", skills = [], languages = [], experience = [], internships = [], projects = [], education = [], references = [], declaration = "", verifiedBadge = true } = cvData;

    return (
      <div 
        id="cv-preview-page"
        className="w-[210mm] min-h-[297mm] bg-white text-stone-800 text-left p-12 flex flex-col gap-8 shadow-2xl relative"
        style={{ fontFamily: "Georgia, serif" }}
      >
        {/* Sleek Centered Header */}
        <header className="text-center flex flex-col gap-2 pb-6 border-b border-stone-200">
          <h1 className="text-3xl font-light tracking-wide uppercase text-stone-900">{personalInfo.fullName || "Your Name"}</h1>
          <p className="text-xs uppercase tracking-widest font-bold" style={{ color: activeTheme.secondary }}>
            {personalInfo.title || "Professional Title"}
          </p>
          <div className="text-[10px] text-stone-500 flex justify-center gap-4 flex-wrap mt-2 font-sans font-medium">
            <span>{personalInfo.location}</span>
            <span>•</span>
            <span>{personalInfo.phone}</span>
            <span>•</span>
            <span>{personalInfo.email}</span>
            {personalInfo.linkedin && (
              <>
                <span>•</span>
                <span>{personalInfo.linkedin}</span>
              </>
            )}
            {personalInfo.github && (
              <>
                <span>•</span>
                <span>{personalInfo.github}</span>
              </>
            )}
          </div>
        </header>

        {/* Professional Summary */}
        {summary && (
          <div className="flex flex-col gap-2">
            <h3 className="text-xs uppercase tracking-wider font-bold text-stone-900 font-sans">
              Summary
            </h3>
            <p className="text-[11.5px] leading-relaxed text-justify text-stone-600">{summary}</p>
          </div>
        )}

        {/* Experience */}
        {experience.length > 0 && (
          <div className="flex flex-col gap-4">
            <h3 className="text-xs uppercase tracking-wider font-bold text-stone-900 font-sans">
              Experience
            </h3>
            <div className="flex flex-col gap-4">
              {experience.map((exp: any, idx: number) => (
                <div key={idx} className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-baseline text-xs">
                    <span className="font-bold text-stone-900">{exp.company} <span className="font-normal italic text-stone-400">({exp.location})</span></span>
                    <span className="text-[10px] text-stone-500 font-sans">{exp.startDate} – {exp.endDate}</span>
                  </div>
                  <div className="text-[10.5px] italic text-stone-600 font-sans" style={{ color: activeTheme.secondary }}>{exp.role}</div>
                  {exp.companyDesc && <div className="text-[9.5px] text-stone-400 italic leading-snug">{exp.companyDesc}</div>}
                  <ul className="list-disc pl-4 text-[10.5px] text-stone-600 leading-relaxed flex flex-col gap-0.5">
                    {Array.isArray(exp.responsibilities) && exp.responsibilities.map((resp: string, rIdx: number) => (
                      <li key={rIdx}>{resp}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Skills */}
        {skills.length > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="text-xs uppercase tracking-wider font-bold text-stone-900 font-sans">
              Skills & Expertise
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {skills.map((skill: any, idx: number) => (
                <div key={idx} className="text-[10px] leading-tight">
                  <strong className="text-stone-800 font-sans">{skill.category}: </strong>
                  <span className="text-stone-600">
                    {Array.isArray(skill.items) ? skill.items.join(", ") : skill.items || ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Education & Projects Grid */}
        <div className="grid grid-cols-2 gap-8">
          {education.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="text-xs uppercase tracking-wider font-bold text-stone-900 font-sans">
                Education
              </h3>
              <div className="flex flex-col gap-2">
                {education.map((edu: any, idx: number) => (
                  <div key={idx} className="text-[10.5px] leading-relaxed text-stone-650">
                    <strong className="text-stone-850 block">{edu.degree}</strong>
                    <span>{edu.institution} ({edu.year})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {projects.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="text-xs uppercase tracking-wider font-bold text-stone-900 font-sans">
                Projects
              </h3>
              <div className="flex flex-col gap-2">
                {projects.map((proj: any, idx: number) => (
                  <div key={idx} className="text-[10px] leading-relaxed text-stone-650">
                    <strong className="text-stone-800 block">{proj.title} {proj.year && `(${proj.year})`}</strong>
                    <span>{proj.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* References */}
        {references.length > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="text-xs uppercase tracking-wider font-bold text-stone-900 font-sans">
              References
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {references.map((ref: any, idx: number) => (
                <div key={idx} className="text-[9.5px] text-stone-500 leading-snug">
                  <strong className="text-stone-800 text-[10px]">{ref.name}</strong> • {ref.title} | {ref.company} <br />
                  <span>{ref.contact}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Declaration */}
        {declaration && (
          <div className="mt-auto pt-4 border-t border-stone-100 text-center flex flex-col items-center gap-2">
            <p className="text-[9.5px] italic text-stone-400 font-sans">
              {declaration}
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderCreativeLayout = () => {
    const { personalInfo = {}, personalDetails = {}, summary = "", skills = [], languages = [], experience = [], internships = [], projects = [], education = [], references = [], declaration = "", verifiedBadge = true } = cvData;

    return (
      <div 
        id="cv-preview-page"
        className="w-[210mm] min-h-[297mm] bg-white text-slate-800 text-left p-10 flex flex-col gap-6 shadow-2xl relative overflow-hidden"
        style={{ fontFamily: "'Outfit', 'Inter', sans-serif" }}
      >
        {/* Creative Top Accent Strip */}
        <div className="absolute top-0 left-0 right-0 h-3 bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-500" />

        {/* Profile Header */}
        <header className="flex justify-between items-start pt-4 pb-6 border-b border-slate-100">
          <div className="flex flex-col gap-1">
            <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-750 to-blue-750 bg-clip-text text-transparent">
              {personalInfo.fullName || "Your Name"}
            </h1>
            <p className="text-base font-semibold text-indigo-600 tracking-wide uppercase">
              {personalInfo.title || "Professional Title"}
            </p>
            <p className="text-[11px] text-slate-500 max-w-lg mt-2 leading-relaxed italic">{summary.substring(0, 180)}...</p>
          </div>

          <div className="flex flex-col gap-2 items-end text-[10px] text-slate-650 bg-slate-50 p-4 rounded-xl border border-slate-100/50">
            <div className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-indigo-600" /> {personalInfo.location}</div>
            <div className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-indigo-600" /> {personalInfo.phone}</div>
            <div className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-indigo-600" /> {personalInfo.email}</div>
            {personalInfo.linkedin && <div className="flex items-center gap-1.5"><Linkedin className="w-3.5 h-3.5 text-indigo-600" /> {personalInfo.linkedin}</div>}
          </div>
        </header>

        {/* Experience Timeline */}
        {experience.length > 0 && (
          <div className="flex flex-col gap-4">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-indigo-750 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center"><Briefcase className="w-3.5 h-3.5 text-indigo-600" /></span>
              Professional Career
            </h3>
            <div className="border-l-2 border-slate-100 pl-4 ml-3 flex flex-col gap-4">
              {experience.map((exp: any, idx: number) => (
                <div key={idx} className="relative flex flex-col gap-1">
                  <div className="absolute -left-[23px] top-[4px] w-2.5 h-2.5 rounded-full border-2 border-indigo-600 bg-white" />
                  <div className="flex justify-between items-center text-xs font-bold text-slate-800">
                    <span>{exp.company} <span className="text-[10px] font-normal text-slate-400">({exp.location})</span></span>
                    <span className="text-[9.5px] px-2 py-0.5 rounded-full bg-slate-50 font-medium text-slate-500">{exp.startDate} – {exp.endDate}</span>
                  </div>
                  <div className="text-[10px] font-semibold text-indigo-600">{exp.role}</div>
                  <ul className="list-disc pl-4 text-[10px] text-slate-550 leading-relaxed mt-1">
                    {Array.isArray(exp.responsibilities) && exp.responsibilities.map((resp: string, rIdx: number) => (
                      <li key={rIdx} className="mb-0.5">{resp}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Creative Competency Bubble Grid */}
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-indigo-750 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center"><Wrench className="w-3.5 h-3.5 text-indigo-600" /></span>
            Skills Matrix
          </h3>
          <div className="flex flex-col gap-2 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
            {skills.map((skill: any, idx: number) => (
              <div key={idx} className="flex flex-col md:flex-row md:items-center gap-1.5 md:gap-4 py-1 border-b border-slate-100 last:border-0">
                <span className="text-[10px] font-extrabold text-slate-700 md:w-44 shrink-0">{skill.category}</span>
                <div className="flex flex-wrap gap-1">
                  {(Array.isArray(skill.items) ? skill.items : [skill.items]).map((item: string, iIndex: number) => (
                    <span key={iIndex} className="text-[9px] font-medium bg-white text-indigo-600 border border-slate-100 rounded-md px-2 py-0.5">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Education, Personal Info, References Grid */}
        <div className="grid grid-cols-2 gap-6">
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-indigo-750 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center"><GraduationCap className="w-3.5 h-3.5 text-indigo-600" /></span>
              Academics & Training
            </h3>
            <div className="flex flex-col gap-3">
              {education.map((edu: any, idx: number) => (
                <div key={idx} className="text-[10px] leading-relaxed border-l-2 border-indigo-100 pl-3">
                  <strong className="text-slate-800 block">{edu.degree}</strong>
                  <span className="text-slate-500">{edu.institution} ({edu.year})</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-indigo-750 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center"><FolderGit2 className="w-3.5 h-3.5 text-indigo-600" /></span>
              Featured Projects
            </h3>
            <div className="flex flex-col gap-2">
              {projects.map((proj: any, idx: number) => (
                <div key={idx} className="text-[10px] leading-relaxed">
                  <strong className="text-slate-800 block font-bold">{proj.title}</strong>
                  <span className="text-slate-500">{proj.description}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Declaration footer */}
        {declaration && (
          <div className="mt-auto pt-4 border-t border-slate-100 flex flex-col gap-2">
            <p className="text-[9px] italic text-slate-500 leading-relaxed">
              {declaration}
            </p>
            {verifiedBadge && (
              <div className="self-start text-[8px] font-bold text-white uppercase py-1 px-3 rounded bg-gradient-to-r from-violet-600 to-indigo-600">
                Verified Up-to-date CV 
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderActivePreview = () => {
    switch (activeLayout) {
      case "modern":
        return renderModernLayout();
      case "minimalist":
        return renderMinimalistLayout();
      case "creative":
        return renderCreativeLayout();
      case "traditional":
      default:
        return renderTraditionalLayout();
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6 min-h-screen bg-slate-50/50">
      {/* Header Info */}
      <div className="flex justify-between items-center pb-4 border-b border-slate-200">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-800">CV Generator Engine</h1>
          <p className="text-slate-500 text-sm">Create, refine, customize, and export professional CVs instantly</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => fileInputRef.current?.click()}
            disabled={isExtracting}
            className="border-blue-200 text-blue-700 hover:bg-blue-50/50 flex gap-2 font-bold"
          >
            <Upload className="w-4 h-4" />
            Upload & Extract Existing CV
          </Button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept=".pdf,.png,.jpg,.jpeg" 
            className="hidden" 
          />
        </div>
      </div>

      {/* Message Alerts */}
      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-semibold">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="p-4 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm font-semibold">
          {successMsg}
        </div>
      )}

      {/* Extraction Progress overlay */}
      {isExtracting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm">
          <Card className="w-96 shadow-2xl border-blue-200 p-6 flex flex-col items-center gap-4 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent" />
            <h3 className="font-extrabold text-slate-800 text-lg">AI Document Extraction</h3>
            <p className="text-sm text-slate-500">{extractionProgress}</p>
          </Card>
        </div>
      )}

      {/* Main Working Grid: Left (Editor Form), Right (Preview) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6 items-start">
        {/* LEFT COLUMN: EDITOR FORM */}
        <Card className="shadow-lg border-slate-200 bg-white">
          <CardHeader className="border-b bg-slate-50/50 py-4">
            <CardTitle className="text-base font-extrabold text-slate-700 flex items-center gap-2">
              <Settings className="w-4 h-4 text-slate-500" />
              CV Editor Sections
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <TabsList className="grid grid-cols-4 bg-slate-100 rounded-xl h-fit p-1 gap-1">
                <TabsTrigger value="personal" className="text-[10px] py-1.5 font-bold">Details</TabsTrigger>
                <TabsTrigger value="summary" className="text-[10px] py-1.5 font-bold">Profile</TabsTrigger>
                <TabsTrigger value="skills" className="text-[10px] py-1.5 font-bold">Skills</TabsTrigger>
                <TabsTrigger value="experience" className="text-[10px] py-1.5 font-bold">Jobs</TabsTrigger>
                <TabsTrigger value="education" className="text-[10px] py-1.5 font-bold">Edu</TabsTrigger>
                <TabsTrigger value="projects" className="text-[10px] py-1.5 font-bold">Projects</TabsTrigger>
                <TabsTrigger value="references" className="text-[10px] py-1.5 font-bold">Refs</TabsTrigger>
                <TabsTrigger value="declaration" className="text-[10px] py-1.5 font-bold">Decl</TabsTrigger>
              </TabsList>

              {/* PERSONAL & DETAILS TAB */}
              <TabsContent value="personal" className="space-y-4">
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Contact Info</h3>
                  <div>
                    <Label className="text-xs text-slate-500">Full Name</Label>
                    <Input 
                      value={cvData.personalInfo.fullName} 
                      onChange={(e) => handlePersonalInfoChange("fullName", e.target.value)} 
                      placeholder="e.g. Ajay Yadav" 
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Professional Title</Label>
                    <Input 
                      value={cvData.personalInfo.title} 
                      onChange={(e) => handlePersonalInfoChange("title", e.target.value)} 
                      placeholder="e.g. Software Engineer" 
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-slate-500">Email Address</Label>
                      <Input 
                        value={cvData.personalInfo.email} 
                        onChange={(e) => handlePersonalInfoChange("email", e.target.value)} 
                        placeholder="email@example.com" 
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Phone Number</Label>
                      <Input 
                        value={cvData.personalInfo.phone} 
                        onChange={(e) => handlePersonalInfoChange("phone", e.target.value)} 
                        placeholder="+91-8949544021" 
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Location (City, Country)</Label>
                    <Input 
                      value={cvData.personalInfo.location} 
                      onChange={(e) => handlePersonalInfoChange("location", e.target.value)} 
                      placeholder="e.g. Jaipur, India" 
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-slate-500">GitHub Profile</Label>
                      <Input 
                        value={cvData.personalInfo.github} 
                        onChange={(e) => handlePersonalInfoChange("github", e.target.value)} 
                        placeholder="github.com/username" 
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">LinkedIn Profile</Label>
                      <Input 
                        value={cvData.personalInfo.linkedin} 
                        onChange={(e) => handlePersonalInfoChange("linkedin", e.target.value)} 
                        placeholder="linkedin.com/in/username" 
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Personal details</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-slate-500">Date of Birth</Label>
                      <Input 
                        value={cvData.personalDetails.dateOfBirth} 
                        onChange={(e) => handlePersonalDetailsChange("dateOfBirth", e.target.value)} 
                        placeholder="e.g. 25/05/1998" 
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Nationality</Label>
                      <Input 
                        value={cvData.personalDetails.nationality} 
                        onChange={(e) => handlePersonalDetailsChange("nationality", e.target.value)} 
                        placeholder="Indian" 
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-slate-500">Marital Status</Label>
                      <Input 
                        value={cvData.personalDetails.maritalStatus} 
                        onChange={(e) => handlePersonalDetailsChange("maritalStatus", e.target.value)} 
                        placeholder="Married / Single" 
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Residence</Label>
                      <Input 
                        value={cvData.personalDetails.residence} 
                        onChange={(e) => handlePersonalDetailsChange("residence", e.target.value)} 
                        placeholder="Jaipur, India" 
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Kenyan Workpermit Status</Label>
                    <Input 
                      value={cvData.personalDetails.kenyaStatus} 
                      onChange={(e) => handlePersonalDetailsChange("kenyaStatus", e.target.value)} 
                      placeholder="Willing to bear permit expenses" 
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Nairobi Residence</Label>
                    <Input 
                      value={cvData.personalDetails.nairobiRes} 
                      onChange={(e) => handlePersonalDetailsChange("nairobiRes", e.target.value)} 
                      placeholder="Kileleshwa, Nairobi" 
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Driving Experience</Label>
                    <Input 
                      value={cvData.personalDetails.drivingExperience} 
                      onChange={(e) => handlePersonalDetailsChange("drivingExperience", e.target.value)} 
                      placeholder="e.g. 9 Years Experience" 
                    />
                  </div>
                </div>
              </TabsContent>

              {/* SUMMARY TAB */}
              <TabsContent value="summary" className="space-y-4">
                <div>
                  <Label className="text-xs text-slate-500">Professional Summary</Label>
                  <Textarea 
                    value={cvData.summary} 
                    onChange={(e) => setCvData((prev: any) => ({ ...prev, summary: e.target.value }))} 
                    placeholder="Enter professional bio..." 
                    className="min-h-[250px]"
                  />
                </div>
              </TabsContent>

              {/* SKILLS & LANGUAGES TAB */}
              <TabsContent value="skills" className="space-y-4">
                <div className="flex justify-between items-center border-b pb-2">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Skill Categories</h3>
                  <Button size="sm" onClick={addSkillGroup} className="bg-blue-600 hover:bg-blue-700 h-7 text-[10px] font-bold"><Plus className="w-3.5 h-3.5 mr-1" /> Add Category</Button>
                </div>

                <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                  {cvData.skills.map((skill: any, idx: number) => (
                    <div key={idx} className="p-3 border rounded-xl bg-slate-50/50 flex flex-col gap-2 relative">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        onClick={() => removeSkillGroup(idx)}
                        className="absolute right-1 top-1 h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <div>
                        <Label className="text-[10px] text-slate-400 uppercase">Category Name</Label>
                        <Input 
                          value={skill.category} 
                          onChange={(e) => handleSkillCategoryChange(idx, e.target.value)} 
                          placeholder="e.g. Software & Programming" 
                          className="h-8 text-xs font-bold"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-slate-400 uppercase">Items (Comma-separated)</Label>
                        <Textarea 
                          value={Array.isArray(skill.items) ? skill.items.join(", ") : skill.items || ""} 
                          onChange={(e) => handleSkillItemsChange(idx, e.target.value)} 
                          placeholder="e.g. Python, SQL, JavaScript" 
                          className="text-xs min-h-[60px]"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t">
                  <Label className="text-xs text-slate-500">Languages (Comma-separated)</Label>
                  <Input 
                    value={cvData.languages.join(", ")} 
                    onChange={(e) => handleLanguagesChange(e.target.value)} 
                    placeholder="English (Professional), Hindi (Native)" 
                  />
                </div>
              </TabsContent>

              {/* EXPERIENCE TAB */}
              <TabsContent value="experience" className="space-y-4">
                <div className="flex justify-between items-center border-b pb-2">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Experience List</h3>
                  <Button size="sm" onClick={addExperience} className="bg-blue-600 hover:bg-blue-700 h-7 text-[10px] font-bold"><Plus className="w-3.5 h-3.5 mr-1" /> Add Job</Button>
                </div>

                <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
                  {cvData.experience.map((exp: any, idx: number) => (
                    <div key={idx} className="p-3 border rounded-xl bg-slate-50/50 flex flex-col gap-2 relative">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        onClick={() => removeExperience(idx)}
                        className="absolute right-1 top-1 h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] text-slate-400 uppercase">Company</Label>
                          <Input 
                            value={exp.company} 
                            onChange={(e) => handleExperienceChange(idx, "company", e.target.value)} 
                            placeholder="Velvet Furniture" 
                            className="h-8 text-xs font-bold"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] text-slate-400 uppercase">Location</Label>
                          <Input 
                            value={exp.location} 
                            onChange={(e) => handleExperienceChange(idx, "location", e.target.value)} 
                            placeholder="Nairobi, Kenya" 
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <div className="col-span-2">
                          <Label className="text-[10px] text-slate-400 uppercase">Role</Label>
                          <Input 
                            value={exp.role} 
                            onChange={(e) => handleExperienceChange(idx, "role", e.target.value)} 
                            placeholder="Operations Manager" 
                            className="h-8 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] text-slate-400 uppercase">Dates</Label>
                          <Input 
                            value={`${exp.startDate} - ${exp.endDate}`} 
                            onChange={(e) => {
                              const parts = e.target.value.split("-");
                              handleExperienceChange(idx, "startDate", parts[0]?.trim() || "");
                              handleExperienceChange(idx, "endDate", parts[1]?.trim() || "");
                            }} 
                            placeholder="Sept 2023 - Present" 
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-[10px] text-slate-400 uppercase">Company Description</Label>
                        <Input 
                          value={exp.companyDesc} 
                          onChange={(e) => handleExperienceChange(idx, "companyDesc", e.target.value)} 
                          placeholder="Brief description..." 
                          className="h-8 text-xs"
                        />
                      </div>
                      
                      {/* Responsibilities list */}
                      <div className="space-y-1.5 mt-1">
                        <div className="flex justify-between items-center">
                          <Label className="text-[10px] text-slate-500 font-bold uppercase">Responsibilities</Label>
                          <Button size="sm" variant="ghost" onClick={() => addResp(idx)} className="h-5 px-1.5 text-[9px] text-blue-600 font-bold"><Plus className="w-3 h-3 mr-0.5" /> Add</Button>
                        </div>
                        {Array.isArray(exp.responsibilities) && exp.responsibilities.map((resp: string, rIdx: number) => (
                          <div key={rIdx} className="flex gap-1 items-center">
                            <Input 
                              value={resp} 
                              onChange={(e) => handleRespChange(idx, rIdx, e.target.value)} 
                              placeholder="Describe your achievement..." 
                              className="h-7 text-[10.5px] flex-1"
                            />
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              onClick={() => removeResp(idx, rIdx)}
                              className="h-6 w-6 text-red-400 hover:text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Internships toggle */}
                <div className="pt-2 border-t mt-4 flex justify-between items-center">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Internships</h3>
                  <Button size="sm" onClick={addInternship} className="bg-blue-600 hover:bg-blue-700 h-7 text-[10px] font-bold"><Plus className="w-3.5 h-3.5 mr-1" /> Add Internship</Button>
                </div>
                <div className="space-y-4 max-h-[220px] overflow-y-auto pr-1">
                  {(cvData.internships || []).map((intern: any, idx: number) => (
                    <div key={idx} className="p-3 border rounded-xl bg-slate-50/50 flex flex-col gap-2 relative">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        onClick={() => removeInternship(idx)}
                        className="absolute right-1 top-1 h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] text-slate-400 uppercase">Company</Label>
                          <Input 
                            value={intern.company} 
                            onChange={(e) => handleInternshipChange(idx, "company", e.target.value)} 
                            className="h-8 text-xs font-bold"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] text-slate-400 uppercase">Location</Label>
                          <Input 
                            value={intern.location} 
                            onChange={(e) => handleInternshipChange(idx, "location", e.target.value)} 
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] text-slate-400 uppercase">Role</Label>
                          <Input 
                            value={intern.role} 
                            onChange={(e) => handleInternshipChange(idx, "role", e.target.value)} 
                            className="h-8 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] text-slate-400 uppercase">Dates</Label>
                          <Input 
                            value={`${intern.startDate || ""} - ${intern.endDate || ""}`} 
                            onChange={(e) => {
                              const parts = e.target.value.split("-");
                              handleInternshipChange(idx, "startDate", parts[0]?.trim() || "");
                              handleInternshipChange(idx, "endDate", parts[1]?.trim() || "");
                            }} 
                            placeholder="e.g. Aug 2018 - Jan 2019"
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              {/* PROJECTS TAB */}
              <TabsContent value="projects" className="space-y-4">
                <div className="flex justify-between items-center border-b pb-2">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Project Portfolio</h3>
                  <Button size="sm" onClick={addProject} className="bg-blue-600 hover:bg-blue-700 h-7 text-[10px] font-bold"><Plus className="w-3.5 h-3.5 mr-1" /> Add Project</Button>
                </div>

                <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
                  {cvData.projects.map((proj: any, idx: number) => (
                    <div key={idx} className="p-3 border rounded-xl bg-slate-50/50 flex flex-col gap-2 relative">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        onClick={() => removeProject(idx)}
                        className="absolute right-1 top-1 h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <div className="grid grid-cols-[1fr_80px] gap-2">
                        <div>
                          <Label className="text-[10px] text-slate-400 uppercase">Project Title</Label>
                          <Input 
                            value={proj.title} 
                            onChange={(e) => handleProjectChange(idx, "title", e.target.value)} 
                            placeholder="Indeed Job Crawler" 
                            className="h-8 text-xs font-bold"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] text-slate-400 uppercase">Year</Label>
                          <Input 
                            value={proj.year} 
                            onChange={(e) => handleProjectChange(idx, "year", e.target.value)} 
                            placeholder="2025" 
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-[10px] text-slate-400 uppercase">Description</Label>
                        <Textarea 
                          value={proj.description} 
                          onChange={(e) => handleProjectChange(idx, "description", e.target.value)} 
                          placeholder="Brief summary of details, tech stack used, results..." 
                          className="text-xs min-h-[60px]"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              {/* EDUCATION TAB */}
              <TabsContent value="education" className="space-y-4">
                <div className="flex justify-between items-center border-b pb-2">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Education Details</h3>
                  <Button size="sm" onClick={addEducation} className="bg-blue-600 hover:bg-blue-700 h-7 text-[10px] font-bold"><Plus className="w-3.5 h-3.5 mr-1" /> Add Education</Button>
                </div>

                <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
                  {cvData.education.map((edu: any, idx: number) => (
                    <div key={idx} className="p-3 border rounded-xl bg-slate-50/50 flex flex-col gap-2 relative">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        onClick={() => removeEducation(idx)}
                        className="absolute right-1 top-1 h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <div>
                        <Label className="text-[10px] text-slate-400 uppercase">Degree/Qualification</Label>
                        <Input 
                          value={edu.degree} 
                          onChange={(e) => handleEducationChange(idx, "degree", e.target.value)} 
                          placeholder="Bachelor of Computer Applications" 
                          className="h-8 text-xs font-bold"
                        />
                      </div>
                      <div className="grid grid-cols-[1fr_80px] gap-2">
                        <div>
                          <Label className="text-[10px] text-slate-400 uppercase">Institution</Label>
                          <Input 
                            value={edu.institution} 
                            onChange={(e) => handleEducationChange(idx, "institution", e.target.value)} 
                            placeholder="S.S Jain Subodh PG College" 
                            className="h-8 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] text-slate-400 uppercase">Year</Label>
                          <Input 
                            value={edu.year} 
                            onChange={(e) => handleEducationChange(idx, "year", e.target.value)} 
                            placeholder="2019" 
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-[10px] text-slate-400 uppercase">Details/Accreditation</Label>
                        <Input 
                          value={edu.details} 
                          onChange={(e) => handleEducationChange(idx, "details", e.target.value)} 
                          placeholder="e.g. GPA or additional cert info" 
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              {/* REFERENCES TAB */}
              <TabsContent value="references" className="space-y-4">
                <div className="flex justify-between items-center border-b pb-2">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">References</h3>
                  <Button size="sm" onClick={addReference} className="bg-blue-600 hover:bg-blue-700 h-7 text-[10px] font-bold"><Plus className="w-3.5 h-3.5 mr-1" /> Add Reference</Button>
                </div>

                <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
                  {cvData.references.map((ref: any, idx: number) => (
                    <div key={idx} className="p-3 border rounded-xl bg-slate-50/50 flex flex-col gap-2 relative">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        onClick={() => removeReference(idx)}
                        className="absolute right-1 top-1 h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] text-slate-400 uppercase">Reference Name</Label>
                          <Input 
                            value={ref.name} 
                            onChange={(e) => handleReferenceChange(idx, "name", e.target.value)} 
                            placeholder="Sandip Patel" 
                            className="h-8 text-xs font-bold"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] text-slate-400 uppercase">Title/Role</Label>
                          <Input 
                            value={ref.title} 
                            onChange={(e) => handleReferenceChange(idx, "title", e.target.value)} 
                            placeholder="Director" 
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] text-slate-400 uppercase">Company</Label>
                          <Input 
                            value={ref.company} 
                            onChange={(e) => handleReferenceChange(idx, "company", e.target.value)} 
                            placeholder="BookSmart Consultancy" 
                            className="h-8 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] text-slate-400 uppercase">Location/Address</Label>
                          <Input 
                            value={ref.address} 
                            onChange={(e) => handleReferenceChange(idx, "address", e.target.value)} 
                            placeholder="Nairobi, Kenya" 
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-[10px] text-slate-400 uppercase">Contact Information</Label>
                        <Input 
                          value={ref.contact} 
                          onChange={(e) => handleReferenceChange(idx, "contact", e.target.value)} 
                          placeholder="Phone / Email details" 
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              {/* DECLARATION TAB */}
              <TabsContent value="declaration" className="space-y-4">
                <div>
                  <Label className="text-xs text-slate-500 font-bold uppercase">Declaration Text</Label>
                  <Textarea 
                    value={cvData.declaration} 
                    onChange={(e) => setCvData((prev: any) => ({ ...prev, declaration: e.target.value }))} 
                    placeholder="DECLARATION: I hereby declare that..." 
                    className="min-h-[120px] text-xs"
                  />
                </div>
                <div className="flex items-center gap-2 pt-2 border-t">
                  <input 
                    type="checkbox" 
                    id="verifiedBadgeCheckbox"
                    checked={cvData.verifiedBadge} 
                    onChange={(e) => setCvData((prev: any) => ({ ...prev, verifiedBadge: e.target.checked }))} 
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <Label htmlFor="verifiedBadgeCheckbox" className="text-xs text-slate-650 cursor-pointer font-bold select-none">
                    Show "CV Verified & Up-to-date" Badge in preview
                  </Label>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* RIGHT COLUMN: PREVIEW PANEL */}
        <div className="flex flex-col gap-4">
          {/* CONTROL BOX */}
          <Card className="shadow-lg border-slate-200 bg-white">
            <CardHeader className="border-b py-3 px-4 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <span className="font-extrabold text-slate-800 text-sm">CV Template & Design Settings</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button 
                  id="btn-pdf-download"
                  onClick={handleDownloadPdf}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold h-9 px-3 flex gap-1.5 shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" /> PDF
                </Button>
                <Button 
                  onClick={handleDownloadDocx}
                  className="bg-slate-700 hover:bg-slate-800 text-white text-xs font-extrabold h-9 px-3 flex gap-1.5 shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" /> Word (.docx)
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 flex flex-col md:flex-row gap-6">
              {/* Layout design selector */}
              <div className="flex-1 space-y-2">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Layout Template</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    { id: "traditional", name: "Traditional Sidebar" },
                    { id: "modern", name: "Modern Elite" },
                    { id: "minimalist", name: "Elegant Minimal" },
                    { id: "creative", name: "Creative Tech" },
                  ].map((lay) => (
                    <button
                      key={lay.id}
                      onClick={() => setActiveLayout(lay.id)}
                      className={`py-2 px-3 text-xs font-black rounded-lg border text-center transition-all ${
                        activeLayout === lay.id 
                          ? "bg-blue-600 border-blue-600 text-white shadow-md" 
                          : "bg-slate-50 border-slate-200 text-slate-650 hover:bg-slate-100"
                      }`}
                    >
                      {lay.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Theme color presets */}
              <div className="md:w-64 space-y-2">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Color Palette</Label>
                <div className="flex gap-2.5 flex-wrap">
                  {THEME_PRESETS.map((theme, index) => (
                    <button
                      key={index}
                      onClick={() => setActiveTheme(theme)}
                      title={theme.name}
                      className={`h-7 w-7 rounded-full border-2 flex items-center justify-center p-0.5 transition-all ${
                        activeTheme.name === theme.name ? "border-slate-800 scale-110" : "border-transparent hover:scale-105"
                      }`}
                    >
                      <span className="h-full w-full rounded-full flex overflow-hidden">
                        <span className="w-1/2 h-full" style={{ backgroundColor: theme.primary }} />
                        <span className="w-1/2 h-full" style={{ backgroundColor: theme.secondary }} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* PAGE PREVIEW WRAPPER */}
          <div className="w-full overflow-x-auto p-4 bg-slate-200 rounded-2xl flex justify-center border shadow-inner">
            <div className="scale-90 md:scale-100 origin-top">
              {renderActivePreview()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
