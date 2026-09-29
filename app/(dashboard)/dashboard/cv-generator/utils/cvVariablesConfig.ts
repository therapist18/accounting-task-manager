// Single source of truth for "all the variables on a CV" — the field lists behind
// CvVariablesTable.tsx (the table view), cvExcelExport.ts and cvExcelImport.ts. Keeping this in
// one place means the table view, the exported spreadsheet and the importer can never drift
// apart on what fields exist or what a fresh row looks like.
import { FIELD_LABELS, PROFICIENCY_LEVELS, COMMON_LANGUAGES, SECTION_REQUIRED_FIELDS } from "./cvGeneratorData";

export type ScalarFieldType = "text" | "textarea" | "boolean";

export interface ScalarFieldDef {
  // Dot path into cvData, e.g. "personalInfo.fullName".
  path: string;
  label: string;
  type: ScalarFieldType;
  group: "Contact" | "Personal Details" | "Summary & Declaration";
}

export const SCALAR_FIELD_DEFS: ScalarFieldDef[] = [
  { path: "personalInfo.fullName", label: "Full Name", type: "text", group: "Contact" },
  { path: "personalInfo.title", label: "Professional Title", type: "text", group: "Contact" },
  { path: "personalInfo.email", label: "Email", type: "text", group: "Contact" },
  { path: "personalInfo.phone", label: "Phone", type: "text", group: "Contact" },
  { path: "personalInfo.location", label: "Location", type: "text", group: "Contact" },
  { path: "personalInfo.linkedin", label: "LinkedIn", type: "text", group: "Contact" },
  { path: "personalInfo.github", label: "GitHub", type: "text", group: "Contact" },
  { path: "personalInfo.portfolio", label: "Portfolio URL", type: "text", group: "Contact" },
  { path: "personalDetails.dateOfBirth", label: "Date of Birth", type: "text", group: "Personal Details" },
  { path: "personalDetails.nationality", label: "Nationality", type: "text", group: "Personal Details" },
  { path: "personalDetails.maritalStatus", label: "Marital Status", type: "text", group: "Personal Details" },
  { path: "personalDetails.residence", label: "Residence", type: "text", group: "Personal Details" },
  { path: "personalDetails.kenyaStatus", label: "Kenya Permit Status", type: "text", group: "Personal Details" },
  { path: "personalDetails.nairobiRes", label: "Nairobi Neighborhood", type: "text", group: "Personal Details" },
  { path: "personalDetails.drivingExperience", label: "Driving Experience", type: "text", group: "Personal Details" },
  { path: "summary", label: "Professional Summary", type: "textarea", group: "Summary & Declaration" },
  { path: "declaration", label: "Declaration Text", type: "textarea", group: "Summary & Declaration" },
  { path: "includeDeclaration", label: "Include Declaration", type: "boolean", group: "Summary & Declaration" },
  { path: "verifiedBadge", label: "Show Verified Badge", type: "boolean", group: "Summary & Declaration" },
];

export const getScalarValue = (cvData: any, path: string): any => {
  const [a, b] = path.split(".");
  return b ? cvData?.[a]?.[b] : cvData?.[a];
};

export const setScalarValue = (cvData: any, path: string, value: any): any => {
  const [a, b] = path.split(".");
  if (!b) return { ...cvData, [a]: value };
  return { ...cvData, [a]: { ...(cvData[a] || {}), [b]: value } };
};

export type ArrayFieldType = "text" | "textarea" | "list" | "language" | "proficiency";

export interface ArrayFieldDef {
  key: string;
  label: string;
  type: ArrayFieldType;
}

export interface ArraySectionDef {
  id: string; // cvData key, e.g. "experience"
  label: string;
  fields: ArrayFieldDef[];
  emptyItem: () => Record<string, any>;
}

const EXTRA_LABELS: Record<string, string> = {
  responsibilities: "Responsibilities", companyDesc: "Company Description", details: "Details",
  description: "Description", url: "URL", date: "Date", address: "Address",
};
const labelFor = (key: string) => FIELD_LABELS[key] || EXTRA_LABELS[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

export const ARRAY_SECTION_DEFS: ArraySectionDef[] = [
  {
    id: "experience", label: "Work Experience",
    fields: ["company", "location", "role", "startDate", "endDate", "companyDesc", "responsibilities"].map((key) => ({
      key, label: labelFor(key), type: key === "responsibilities" ? "list" : key === "companyDesc" ? "textarea" : "text",
    })),
    emptyItem: () => ({ company: "", location: "", role: "", startDate: "", endDate: "", companyDesc: "", responsibilities: [] }),
  },
  {
    id: "internships", label: "Internships",
    fields: ["company", "location", "role", "startDate", "endDate", "companyDesc", "responsibilities"].map((key) => ({
      key, label: labelFor(key), type: key === "responsibilities" ? "list" : key === "companyDesc" ? "textarea" : "text",
    })),
    emptyItem: () => ({ company: "", location: "", role: "", startDate: "", endDate: "", companyDesc: "", responsibilities: [] }),
  },
  {
    id: "education", label: "Education",
    fields: ["degree", "institution", "year", "details"].map((key) => ({ key, label: labelFor(key), type: key === "details" ? "textarea" : "text" })),
    emptyItem: () => ({ degree: "", institution: "", year: "", details: "" }),
  },
  {
    id: "skills", label: "Skills",
    fields: ["category", "items"].map((key) => ({ key, label: labelFor(key), type: "text" })),
    emptyItem: () => ({ category: "", items: "" }),
  },
  {
    id: "projects", label: "Projects",
    fields: ["title", "description", "year"].map((key) => ({ key, label: labelFor(key), type: key === "description" ? "textarea" : "text" })),
    emptyItem: () => ({ title: "", description: "", year: "" }),
  },
  {
    id: "references", label: "References",
    fields: ["name", "title", "company", "address", "contact"].map((key) => ({ key, label: labelFor(key), type: "text" })),
    emptyItem: () => ({ name: "", title: "", company: "", address: "", contact: "" }),
  },
  {
    id: "languages", label: "Languages",
    fields: [
      { key: "language", label: "Language", type: "language" },
      { key: "proficiency", label: "Proficiency", type: "proficiency" },
    ],
    emptyItem: () => ({ language: "", proficiency: "" }),
  },
  {
    id: "certifications", label: "Certifications",
    fields: ["name", "issuer", "date", "url"].map((key) => ({ key, label: labelFor(key), type: "text" })),
    emptyItem: () => ({ name: "", issuer: "", date: "", url: "" }),
  },
  {
    id: "achievements", label: "Achievements",
    fields: ["title", "description", "date"].map((key) => ({ key, label: labelFor(key), type: key === "description" ? "textarea" : "text" })),
    emptyItem: () => ({ title: "", description: "", date: "" }),
  },
  {
    id: "additionalInfo", label: "Additional Information",
    fields: ["label", "value"].map((key) => ({ key, label: labelFor(key), type: "text" })),
    emptyItem: () => ({ label: "", value: "" }),
  },
];

export const isFieldRequired = (sectionId: string, fieldKey: string): boolean =>
  (SECTION_REQUIRED_FIELDS[sectionId] || []).includes(fieldKey);

export { PROFICIENCY_LEVELS, COMMON_LANGUAGES };

// Responsibilities are stored as string[] in normal use, but old/imported data can carry a
// single string — always coerce to an array of non-empty lines for display and diffing.
export const responsibilitiesToLines = (value: string[] | string | undefined): string[] => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split("\n").map((l) => l.trim()).filter(Boolean);
  return [];
};
