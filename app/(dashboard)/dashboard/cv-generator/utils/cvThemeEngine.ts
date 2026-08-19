import { imageUrlToDataUrl } from "@/lib/documentExport";
import { toWordSafeFontStack, makeCssWordSafe } from "@/lib/documentTheme";

// ---------------------------------------------------------------------------
// Types - Unified & Curated Layouts
// ---------------------------------------------------------------------------

export type CvLayout = 'corporate' | 'legal' | 'modern' | 'executive' | 'minimal' | 'letterhead' | 'bold' | 'editorial';

export const CV_LAYOUTS: CvLayout[] = ['corporate', 'legal', 'modern', 'executive', 'minimal', 'letterhead', 'bold', 'editorial'];

export interface CvDocument {
  bodyHtml: string;
  styleHtml: string;
  css: string;
  title: string;
  pageSize: string;
  pageMargin: string;
  fileName: string;
  layout: CvLayout;
  fontFamily: string;
}

interface CssCtx {
  pri: string;
  acc: string;
  fam: string;
  S: (px: number) => string;
}

type BlockKind =
  | "summary" | "experience" | "internships" | "projects"
  | "education" | "certifications" | "achievements" | "additional"
  | "references" | "skills" | "languages" | "contact" | "details";

interface BlockSpec {
  kind: BlockKind;
  title: string;
}

interface HeaderSpec {
  variant: "banner" | "centered";
  photo?: boolean;
  padding: string;
}

interface SideSpec {
  widthPx?: number;
  widthPct?: number;
  padding: string;
  dark: boolean;
  blocks: BlockSpec[];
}

interface LayoutSpec {
  header?: HeaderSpec;
  hasPhoto: boolean;
  mainPadding: string;
  bodyPadding: string;
  mainSections: BlockSpec[];
  side?: SideSpec;
  sideFirst?: boolean;
  declarationIn: "main" | "side" | "footer";
  footerPadding: string;
  nameInMain: boolean; 
}

// ---------------------------------------------------------------------------
// Per-theme Layout Configurations (Aligned with the 8 document themes)
// ---------------------------------------------------------------------------
const LAYOUT_SPECS: Record<CvLayout, LayoutSpec> = {
  corporate: {
    hasPhoto: true,
    nameInMain: true,
    bodyPadding: "0",
    mainPadding: "24px 24px 24px 16px",
    mainSections: [
      { kind: "summary", title: "Professional Profile" },
      { kind: "experience", title: "Professional Experience" },
      { kind: "internships", title: "Internships" },
      { kind: "projects", title: "Key Projects" },
      { kind: "education", title: "Education" },
      { kind: "certifications", title: "Certifications" },
      { kind: "achievements", title: "Achievements" },
      { kind: "references", title: "References" },
      { kind: "additional", title: "Additional Information" },
    ],
    side: {
      widthPx: 280,
      padding: "24px 16px",
      dark: true,
      blocks: [
        { kind: "contact", title: "Contact Information" },
        { kind: "details", title: "Personal Details" },
        { kind: "skills", title: "Core Competencies" },
        { kind: "languages", title: "Languages" },
      ],
    },
    sideFirst: true,
    declarationIn: "main",
    footerPadding: "0",
  },
  legal: {
    header: { variant: "centered", padding: "0" },
    hasPhoto: false,
    nameInMain: false,
    bodyPadding: "40px 60px",
    mainPadding: "0",
    mainSections: [
      { kind: "summary", title: "Professional Profile" },
      { kind: "experience", title: "Professional Experience" },
      { kind: "internships", title: "Internships" },
      { kind: "projects", title: "Key Projects" },
      { kind: "education", title: "Education" },
      { kind: "skills", title: "Technical Skills" },
      { kind: "languages", title: "Languages" },
      { kind: "certifications", title: "Certifications" },
      { kind: "achievements", title: "Achievements" },
      { kind: "references", title: "References" },
      { kind: "additional", title: "Additional Information" },
      { kind: "details", title: "Personal Details" },
    ],
    declarationIn: "footer",
    footerPadding: "20px 60px 40px",
  },
  modern: {
    header: { variant: "banner", padding: "32px" },
    hasPhoto: true,
    nameInMain: false,
    bodyPadding: "0",
    mainPadding: "16px 16px 32px 32px",
    mainSections: [
      { kind: "summary", title: "Professional Profile" },
      { kind: "experience", title: "Experience" },
      { kind: "internships", title: "Internships" },
      { kind: "projects", title: "Key Projects" },
      { kind: "achievements", title: "Achievements" },
      { kind: "references", title: "References" },
      { kind: "additional", title: "Additional Information" },
    ],
    side: {
      widthPct: 32,
      padding: "32px 24px",
      dark: false,
      blocks: [
        { kind: "skills", title: "Competencies" },
        { kind: "education", title: "Education" },
        { kind: "languages", title: "Languages" },
        { kind: "certifications", title: "Certifications" },
        { kind: "details", title: "Personal Details" },
      ],
    },
    declarationIn: "footer",
    footerPadding: "24px 32px 24px",
  },
  executive: {
    header: { variant: "centered", padding: "32px 0 16px" },
    hasPhoto: false,
    nameInMain: false,
    bodyPadding: "0",
    mainPadding: "12px 40px 32px",
    mainSections: [
      { kind: "summary", title: "Executive Summary" },
      { kind: "experience", title: "Professional History" },
      { kind: "education", title: "Education" },
      { kind: "skills", title: "Core Competencies" },
      { kind: "languages", title: "Languages" },
      { kind: "certifications", title: "Certifications & Credentials" },
      { kind: "references", title: "Professional References" },
      { kind: "details", title: "Personal Details" },
    ],
    declarationIn: "footer",
    footerPadding: "24px 40px",
  },
  minimal: {
    hasPhoto: true,
    nameInMain: true,
    bodyPadding: "0",
    mainPadding: "24px 40px",
    mainSections: [
      { kind: "summary", title: "Profile" },
      { kind: "experience", title: "Experience" },
      { kind: "internships", title: "Internships" },
      { kind: "education", title: "Education" },
      { kind: "projects", title: "Projects" },
      { kind: "achievements", title: "Achievements" },
      { kind: "references", title: "References" },
      { kind: "additional", title: "Additional Information" },
    ],
    side: {
      widthPx: 220,
      padding: "24px",
      dark: false,
      blocks: [
        { kind: "contact", title: "Contact" },
        { kind: "skills", title: "Skills" },
        { kind: "languages", title: "Languages" },
        { kind: "certifications", title: "Certifications" },
        { kind: "details", title: "Personal Details" },
      ],
    },
    sideFirst: true,
    declarationIn: "main",
    footerPadding: "0",
  },
  letterhead: {
    header: { variant: "centered", padding: "0" },
    hasPhoto: false,
    nameInMain: false,
    bodyPadding: "0",
    mainPadding: "12px 40px 32px",
    mainSections: [
      { kind: "summary", title: "Professional Profile" },
      { kind: "experience", title: "Career History" },
      { kind: "internships", title: "Internships" },
      { kind: "projects", title: "Key Projects" },
      { kind: "education", title: "Education" },
      { kind: "skills", title: "Skills & Expertise" },
      { kind: "languages", title: "Languages" },
      { kind: "certifications", title: "Certifications" },
      { kind: "achievements", title: "Achievements" },
      { kind: "references", title: "References" },
      { kind: "additional", title: "Additional Information" },
      { kind: "details", title: "Personal Details" },
    ],
    declarationIn: "footer",
    footerPadding: "24px 40px",
  },
  bold: {
    hasPhoto: true,
    nameInMain: true,
    bodyPadding: "0",
    mainPadding: "24px",
    mainSections: [
      { kind: "summary", title: "Profile Summary" },
      { kind: "experience", title: "Work Experience" },
      { kind: "projects", title: "Key Projects" },
      { kind: "education", title: "Education Background" },
      { kind: "certifications", title: "Certifications" },
    ],
    side: {
      widthPx: 260,
      padding: "24px",
      dark: false,
      blocks: [
        { kind: "contact", title: "Contact Details" },
        { kind: "skills", title: "Proficiencies" },
        { kind: "languages", title: "Languages" },
        { kind: "details", title: "Personal Info" },
      ],
    },
    sideFirst: false,
    declarationIn: "main",
    footerPadding: "0",
  },
  editorial: {
    header: { variant: "centered", padding: "40px 0 24px" },
    hasPhoto: false,
    nameInMain: false,
    bodyPadding: "24px 56px",
    mainPadding: "0",
    mainSections: [
      { kind: "summary", title: "The Professional Record" },
      { kind: "experience", title: "Career Timeline" },
      { kind: "internships", title: "Internships" },
      { kind: "projects", title: "Notable Projects" },
      { kind: "education", title: "Academic Background" },
      { kind: "skills", title: "Core Proficiencies" },
      { kind: "languages", title: "Languages" },
      { kind: "certifications", title: "Certifications" },
      { kind: "achievements", title: "Achievements" },
      { kind: "references", title: "References" },
      { kind: "additional", title: "Additional Information" },
      { kind: "details", title: "Personal Details" },
    ],
    declarationIn: "footer",
    footerPadding: "24px 0",
  },
};

// ---------------------------------------------------------------------------
// Shared Font Mappings & Helper Options
// ---------------------------------------------------------------------------

export const FONT_OPTIONS = [
  { name: 'Georgia', family: 'Georgia, "Times New Roman", serif', desc: 'Elegant serif' },
  { name: 'Times New Roman', family: '"Times New Roman", Times, serif', desc: 'Classic legal' },
  { name: 'Garamond', family: 'Garamond, "EB Garamond", serif', desc: 'Formal serif' },
  { name: 'Merriweather', family: 'Merriweather, serif', desc: 'Readable serif' },
  { name: 'Inter', family: 'Inter, sans-serif', desc: 'Clean modern' },
  { name: 'Arial', family: 'Arial, Helvetica, sans-serif', desc: 'Plain sans' },
];

const STRICT_FONT_MAP: Record<CvLayout, string> = {
  corporate: "Arial, Helvetica, sans-serif",
  legal: '"Times New Roman", Times, serif',
  modern: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  executive: "Georgia, serif",
  minimal: "system-ui, -apple-system, sans-serif",
  letterhead: "Calibri, Arial, sans-serif",
  bold: "Arial, Helvetica, sans-serif",
  editorial: 'Georgia, "Times New Roman", serif',
};

// ---------------------------------------------------------------------------
// Component Assembly Helpers
// ---------------------------------------------------------------------------

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toCssColor(hex?: string, fallback = "#2c3e50"): string {
  return hex && /^#[0-9a-fA-F]{3,6}$/.test(hex) ? hex : fallback;
}

function splitItems(items: unknown): string[] {
  return String(items || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function verifiedDateLabel(): string {
  return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const DETAIL_FIELDS: [string, string][] = [
  ["Date of Birth", "dateOfBirth"],
  ["Nationality", "nationality"],
  ["Marital Status", "maritalStatus"],
  ["Residence", "residence"],
  ["Kenya Status", "kenyaStatus"],
  ["Nairobi Res", "nairobiRes"],
  ["Driving", "drivingExperience"],
];

const CONTACT_DEFS: [string, string][] = [
  ["location", "Location"],
  ["phone", "Phone"],
  ["email", "Email"],
  ["linkedin", "LinkedIn"],
  ["github", "GitHub"],
];

const CONTACT_ICONS: Record<string, string> = {
  location: `<svg viewBox="0 0 20 20" width="11" height="11" fill="currentColor" style="vertical-align:-1px;"><path d="M10 20s6-5.686 6-10a6 6 0 10-12 0c0 4.314 6 10 6 10zm0-7a3 3 0 110-6 3 3 0 010 6z"/></svg>`,
  phone: `<svg viewBox="0 0 20 20" width="11" height="11" fill="currentColor" style="vertical-align:-1px;"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/></svg>`,
  email: `<svg viewBox="0 0 20 20" width="11" height="11" fill="currentColor" style="vertical-align:-1px;"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg>`,
  linkedin: `<svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" style="vertical-align:-1px;"><path d="M14.82 0H1.18C.53 0 0 .53 0 1.18v13.64C0 15.47.53 16 1.18 16h13.64c.65 0 1.18-.53 1.18-1.18V1.18C16 .53 15.47 0 14.82 0zM4.75 13.5H2.4V6h2.35v7.5zM3.58 5.03c-.75 0-1.36-.61-1.36-1.36 0-.75.61-1.36 1.36-1.36.75 0 1.36.61 1.36 1.36 0 .75-.61 1.36-1.36 1.36zM13.5 13.5h-2.35V9.9c0-.86-.02-1.97-1.2-1.97-1.2 0-1.39.94-1.39 1.9v3.67H6.2V6h2.26v1.03h.03c.32-.6 1.09-1.24 2.25-1.24 2.4 0 2.84 1.58 2.84 3.64v3.57z"/></svg>`,
  github: `<svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" style="vertical-align:-1px;"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`,
};

const CHECK_CIRCLE_SVG = `<svg viewBox="0 0 20 20" width="11" height="11" fill="currentColor" style="vertical-align:-1px;"><path fill-rule="evenodd" clip-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"/></svg>`;

function photoFrame(photoSrc: string | null, settings: any, size: number, borderColor: string): string {
  const radius = settings.photoShape === "circle" ? "50%" : settings.photoShape === "rounded" ? "12px" : "0";
  const style = `width:${size}px;height:${size}px;border:3px solid ${borderColor};border-radius:${radius};display:block;overflow:hidden;background:#ffffff;`;
  const img = photoSrc
    ? `<img src="${photoSrc}" alt="Profile" width="${size}" height="${size}" style="width:${size}px;height:${size}px;object-fit:${settings.photoFit || "cover"};" />`
    : `&nbsp;`;
  return `<div class="cv-photo" style="${style}">${img}</div>`;
}

function contactBlock(personalInfo: any, accent: string, layout: CvLayout): string {
  if (layout === "corporate" || layout === "bold") {
    const lines = CONTACT_DEFS
      .filter(([key]) => personalInfo?.[key])
      .map(([key]) => `<div class="cv-contact-item" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><span style="color:${accent};display:inline-flex;">${CONTACT_ICONS[key] || ""}</span><span>${esc(personalInfo[key])}</span></div>`);
    if (!lines.length) return "";
    return lines.join("");
  }
  const lines = CONTACT_DEFS
    .filter(([key]) => personalInfo?.[key])
    .map(([key]) => esc(personalInfo[key]));
  if (!lines.length) return "";
  return `<p style="color:${accent};">${lines.join("<br/>")}</p>`;
}

function detailsBlock(personalDetails: any): string {
  const lines = DETAIL_FIELDS
    .filter(([, key]) => personalDetails?.[key])
    .map(([label, key]) => `<strong>${esc(label)}:</strong> ${esc(personalDetails[key])}`);
  if (!lines.length) return "";
  return `<p>${lines.join("<br/>")}</p>`;
}

function additionalBlock(additionalInfo: any[]): string {
  const lines = (additionalInfo || [])
    .filter((i: any) => i?.label || i?.value)
    .map((i: any) => `<strong>${esc(i.label || "")}:</strong> ${esc(i.value || "")}`);
  if (!lines.length) return "";
  return `<p>${lines.join("<br/>")}</p>`;
}

function skillsBlock(categories: any[], layout: CvLayout, pri: string, acc: string): string {
  if (!categories.length) return "<p><em>No skills added yet.</em></p>";
  const { style, uppercase } = headingVisual(layout, "h4", pri, acc);
  const styleAttr = style ? ` style="${style}"` : "";
  
  const separator = layout === "corporate" ? ", " : " &bull; ";
  return categories
    .map((grp: any) => {
      const items = splitItems(grp.items);
      const list = items.length ? `<p style="line-height:1.6; margin-bottom:12px;">${items.map(i => esc(i)).join(separator)}</p>` : "";
      const title = String(grp.category || "");
      return `<h4${styleAttr}>${esc(uppercase ? title.toUpperCase() : title)}</h4>${list}`;
    })
    .join("");
}

function languagesBlock(languages: any[]): string {
  if (!languages.length) return "<p><em>No languages added yet.</em></p>";
  const lines = languages.map((l: any) => `${esc(l.language || "")}${l.proficiency ? ` — ${esc(l.proficiency)}` : ""}`);
  return `<p>${lines.join("<br/>")}</p>`;
}

function expEntry(exp: any, layout: CvLayout): string {
  const company = esc(exp.company || "Company");
  const role = esc(exp.role || "Role");
  const loc = exp.location ? ` <em>| ${esc(exp.location)}</em>` : "";
  const dates = esc([exp.startDate, exp.endDate].filter(Boolean).join(" – "));
  const companyDesc = exp.companyDesc ? `<p><em>${esc(exp.companyDesc)}</em></p>` : "";
  const respList = ((Array.isArray(exp.responsibilities) ? exp.responsibilities : [exp.responsibilities]) || [])
    .filter(Boolean)
    .map((r: string) => `<li>${esc(r)}</li>`)
    .join("");
  const ul = respList ? `<ul>${respList}</ul>` : "";

  if (layout === "corporate" || layout === "bold") {
    const head = `<table class="cv-exp-head" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td><strong>${company}</strong>${loc}</td><td align="right"><em>${dates}</em></td></tr></table>`;
    const roleLine = `<p class="cv-exp-role">${role}</p>`;
    return `${head}${roleLine}${companyDesc}${ul}`;
  }

  return `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td><strong>${company}</strong> — ${role}${loc}</td><td align="right"><em>${dates}</em></td></tr></table>${companyDesc}${ul}`;
}

function expSection(entries: any[], emptyText: string, layout: CvLayout): string {
  if (!entries.length) return `<p><em>${esc(emptyText)}</em></p>`;
  return entries.map((e: any) => expEntry(e, layout)).join("");
}

function eduEntries(entries: any[]): string {
  if (!entries.length) return "<p><em>No education added yet.</em></p>";
  return entries
    .map((edu: any) => {
      const details = edu.details ? `<br/><em>${esc(edu.details)}</em>` : "";
      return `<p><strong>${esc(edu.degree || "Degree")}</strong> — ${esc(edu.institution || "Institution")} <em>(${esc(edu.year || "")})</em>${details}</p>`;
    })
    .join("");
}

function projectsBlock(projects: any[], layout: CvLayout): string {
  if (!projects.length) return "<p><em>No projects added yet.</em></p>";

  if (layout === "corporate" || layout === "bold") {
    const card = (p: any) => `<td class="cv-project-card" valign="top" width="50%" style="border:1px solid #eeeeee;padding:12px;">
      <strong>${esc(p.title || "Project Title")}${p.year ? ` (${esc(p.year)})` : ""}</strong>
      ${p.description ? `<p>${esc(p.description)}</p>` : ""}
    </td>`;
    const rows: string[] = [];
    for (let i = 0; i < projects.length; i += 2) {
      const left = card(projects[i]);
      const right = projects[i + 1] ? card(projects[i + 1]) : `<td width="50%" style="border:none;"></td>`;
      rows.push(`<tr>${left}${right}</tr>`);
    }
    return `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tbody>${rows.join("")}</tbody></table>`;
  }

  return projects
    .map(
      (p: any) =>
        `<p><strong>${esc(p.title || "Project Title")}</strong>${p.year ? ` <em>(${esc(p.year)})</em>` : ""}${p.description ? ` — ${esc(p.description)}` : ""}</p>`
    )
    .join("");
}

function refsBlock(references: any[]): string {
  if (!references.length) return "<p><em>No references added yet.</em></p>";
  return references
    .map((r: any) => {
      const meta = `${esc(r.title || "")}${r.company ? ` | ${esc(r.company)}` : ""}`;
      const parts = [`<strong>${esc(r.name || "Reference Name")}</strong>`];
      if (meta.trim()) parts.push(`<em>${meta}</em>`);
      if (r.address) parts.push(esc(r.address));
      if (r.contact) parts.push(esc(r.contact));
      return `<p>${parts.join("<br/>")}</p>`;
    })
    .join("");
}

function certsBlock(certifications: any[]): string {
  return certifications
    .map(
      (cert: any) =>
        `<p><strong>${esc(cert.name || "Certification")}</strong>${cert.issuer ? ` – ${esc(cert.issuer)}` : ""}${cert.date ? ` (${esc(cert.date)})` : ""}</p>`
    )
    .join("");
}

function achievementsBlock(achievements: any[]): string {
  return achievements
    .map(
      (ach: any) =>
        `<p><strong>${esc(ach.title || "Achievement")}</strong>${ach.date ? ` (${esc(ach.date)})` : ""}${ach.description ? ` — ${esc(ach.description)}` : ""}</p>`
    )
    .join("");
}

function declarationHtml(cvData: any, accent: string, layout: CvLayout): string {
  const declaration = cvData.declaration || "";
  if (!cvData.includeDeclaration || !declaration) return "";
  let badge = "";
  if (cvData.verifiedBadge) {
    badge = layout === "corporate" || layout === "bold"
      ? `<p><span class="cv-verified-badge">${CHECK_CIRCLE_SVG} &nbsp;CV Verified &amp; Up-to-date ${verifiedDateLabel()}</span></p>`
      : `<p style="color:${accent};"><strong>✓ CV Verified &amp; Up-to-date ${verifiedDateLabel()}</strong></p>`;
  }
  return `<p><em>${esc(declaration)}</em></p>${badge}`;
}

// ---------------------------------------------------------------------------
// Word-Safe inline visual mappers (The "Second Line of Defense")
// ---------------------------------------------------------------------------

const H1_UPPERCASE: Record<CvLayout, boolean> = {
  corporate: true,
  legal: true,
  modern: false,
  executive: false,
  minimal: false,
  letterhead: true,
  bold: true,
  editorial: false,
};

function headingVisual(layout: CvLayout, level: "h2" | "h3" | "h4", pri: string, acc: string): { style: string; uppercase: boolean } {
  switch (layout) {
    case "corporate":
      if (level === "h2") return { style: `color:${pri};background:#e8f4fd;border-left:5px solid ${acc};padding:8px 15px;`, uppercase: true };
      if (level === "h3") return { style: `color:${acc};border-bottom:1px solid ${acc};padding-bottom:5px;`, uppercase: true };
      return { style: "", uppercase: false };
    case "legal":
      if (level === "h2") return { style: `color:${pri};text-align:center;`, uppercase: true };
      if (level === "h3") return { style: `text-decoration:underline;color:#000;`, uppercase: false };
      return { style: "", uppercase: false };
    case "modern":
      if (level === "h2") return { style: `color:${pri};`, uppercase: false };
      if (level === "h3") return { style: `color:${acc};background:${acc}15;padding:4px 12px;display:inline-block;border-radius:20px;`, uppercase: false };
      return { style: `color:#1e293b;`, uppercase: false };
    case "executive":
      if (level === "h2") return { style: `color:${pri};text-transform:uppercase;letter-spacing:0.15em;`, uppercase: true };
      if (level === "h3") return { style: `color:${acc};font-style:italic;`, uppercase: false };
      return { style: "", uppercase: false };
    case "minimal":
      if (level === "h2") return { style: `color:${pri};border-bottom:1px solid #f4f4f5;padding-bottom:8px;`, uppercase: false };
      if (level === "h3") return { style: `color:${acc};`, uppercase: true };
      return { style: "", uppercase: false };
    case "letterhead":
      if (level === "h2") return { style: `color:#ffffff;background:${pri};padding:4px 16px;`, uppercase: true };
      if (level === "h3") return { style: `color:${acc};`, uppercase: false };
      return { style: "", uppercase: false };
    case "bold":
      if (level === "h2") return { style: `color:#000000;border:2px solid #000000;padding:4px 12px;box-shadow:3px 3px 0px ${acc};background:#ffffff;`, uppercase: true };
      if (level === "h3") return { style: `color:${pri};`, uppercase: true };
      return { style: "", uppercase: false };
    case "editorial":
      if (level === "h2") return { style: `color:${pri};text-align:center;letter-spacing:0.2em;`, uppercase: true };
      if (level === "h3") return { style: `color:${acc};font-style:italic;border-left:3px solid ${acc};padding-left:12px;`, uppercase: false };
      return { style: "", uppercase: false };
    default:
      return { style: "", uppercase: false };
  }
}

// ---------------------------------------------------------------------------
// Header builder
// ---------------------------------------------------------------------------

function buildHeader(spec: LayoutSpec, cvData: any, settings: any, photoSrc: string | null, pri: string, acc: string, layout: CvLayout): string {
  const header = spec.header;
  if (!header) return "";
  const { personalInfo = {} } = cvData;

  const nameText = personalInfo.fullName || "Your Name";
  const nameHtml = `<h1 style="color:${header.variant === "banner" ? "#ffffff" : pri};">${esc(H1_UPPERCASE[layout] ? nameText.toUpperCase() : nameText)}</h1>`;
  
  const titleColor = header.variant === "banner" ? "#ffffff" : acc;
  const titleHtml = `<p style="color:${titleColor};"><strong>${esc((personalInfo.title || "Professional Title").toUpperCase())}</strong></p>`;

  const contactItems = CONTACT_DEFS
    .filter(([key]) => personalInfo[key])
    .map(([key]) => esc(personalInfo[key]));
  const contactHtml = contactItems.length
    ? `<p style="color:${header.variant === "banner" ? "#e5e7eb" : "#666666"}; margin-top:8px;">${contactItems.join("&nbsp;&nbsp;|&nbsp;&nbsp;")}</p>`
    : "";

  const nameBlock = `${nameHtml}${titleHtml}${contactHtml}`;

  let extraStyle = "";
  if (header.variant === "banner") {
    extraStyle = `background:${pri}; margin-bottom:16px; border-radius: 4px;`;
    return `<div id="cv-header-banner" class="cv-header cv-header-banner"${extraStyle ? ` style="${extraStyle}"` : ""}>${nameBlock}</div>`;
  }

  if (!header.photo) {
    return `<div class="cv-header"${extraStyle ? ` style="${extraStyle}"` : ""}>${nameBlock}</div>`;
  }

  const photoTd = `<td width="100" style="width:100px;">${photoFrame(photoSrc, settings, 90, "#ffffff")}</td>`;
  return `<div class="cv-header"${extraStyle ? ` style="${extraStyle}"` : ""}><table cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr>${photoTd}<td id="cv-header-text" class="cv-header-text">${nameBlock}</td></tr></table></div>`;
}

// ---------------------------------------------------------------------------
// Main / Sidebar content assemblers
// ---------------------------------------------------------------------------

function buildBlock(block: BlockSpec, cvData: any, settings: any, layout: CvLayout, pri: string, acc: string): string {
  const { personalInfo = {}, personalDetails = {}, skills = [], languages = [], additionalInfo = [], certifications = [], achievements = [], education = [], references = [] } = cvData;
  switch (block.kind) {
    case "summary":
      return cvData.summary ? `<p>${esc(cvData.summary)}</p>` : "<p><em>No profile summary added yet.</em></p>";
    case "experience":
      return expSection(cvData.experience || [], "No work experience added yet.", layout);
    case "internships":
      return expSection(cvData.internships || [], "No internships added yet.", layout);
    case "education":
      return eduEntries(education);
    case "projects":
      return projectsBlock(cvData.projects || [], layout);
    case "skills":
      return skillsBlock(skills, layout, pri, acc);
    case "languages":
      return languagesBlock(languages);
    case "references":
      return refsBlock(references);
    case "certifications":
      return certifications.length ? certsBlock(certifications) : "";
    case "achievements":
      return achievements.length ? achievementsBlock(achievements) : "";
    case "additional":
      return additionalBlock(additionalInfo);
    case "contact":
      return contactBlock(personalInfo, toCssColor(settings?.accentColor, "#3498db"), layout);
    case "details":
      return detailsBlock(personalDetails);
    default:
      return "";
  }
}

function withHeading(level: "h2" | "h3", block: BlockSpec, body: string, layout: CvLayout, pri: string, acc: string): string {
  if (!body) return "";
  const { style, uppercase } = headingVisual(layout, level, pri, acc);
  const styleAttr = style ? ` style="${style}"` : "";
  const title = uppercase ? block.title.toUpperCase() : block.title;
  return `<${level}${styleAttr}>${esc(title)}</${level}>${body}`;
}

function assembleLayout(spec: LayoutSpec, cvData: any, settings: any, photoSrc: string | null, layout: CvLayout, wordSafe: boolean): string {
  const pri = toCssColor(settings?.primaryColor);
  const acc = toCssColor(settings?.accentColor, "#3498db");

  const headerHtml = buildHeader(spec, cvData, settings, photoSrc, pri, acc, layout);

  const mainParts: string[] = [];
  if (spec.nameInMain) {
    const { personalInfo = {} } = cvData;
    const nameText = personalInfo.fullName || "Your Name";
    const nameH1 = `<h1 style="color:${pri};">${esc(H1_UPPERCASE[layout] ? nameText.toUpperCase() : nameText)}</h1>`;
    const titleP = `<p class="cv-title" style="color:${acc};"><strong>${esc((personalInfo.title || "Professional Title").toUpperCase())}</strong></p>`;
    mainParts.push(layout === "corporate" || layout === "bold" ? `<div class="cv-header-box">${nameH1}${titleP}</div>` : `${nameH1}${titleP}`);
  }

  for (const block of spec.mainSections) {
    mainParts.push(withHeading("h2", block, buildBlock(block, cvData, settings, layout, pri, acc), layout, pri, acc));
  }
  if (spec.declarationIn === "main") {
    const decl = declarationHtml(cvData, acc, layout);
    if (decl) mainParts.push(`<div class="cv-declaration">${decl}</div>`);
  }
  const mainHtml = mainParts.join("");

  const sideParts: string[] = [];
  if (spec.side) {
    if (spec.hasPhoto && !spec.header?.photo) {
      sideParts.push(`<div class="cv-photo-wrap" style="margin-bottom: 20px;">${photoFrame(photoSrc, settings, parseInt(String(settings?.photoSize || '140'), 10) || 140, acc)}</div>`);
    }
    for (const block of spec.side.blocks) {
      sideParts.push(withHeading("h3", block, buildBlock(block, cvData, settings, layout, pri, acc), layout, pri, acc));
    }
    if (spec.declarationIn === "side") {
      const decl = declarationHtml(cvData, acc, layout);
      if (decl) sideParts.push(`<div class="cv-declaration">${decl}</div>`);
    }
    if (wordSafe && spec.side.dark) {
      // Word paints a <td> bgcolor only behind that cell's own flowed content,
      // not the full row height, so once the (usually shorter) sidebar column
      // runs out of text, the dark background stops even though the main
      // column keeps going for another page or two - leaving a blank gap on
      // multi-page exports. Reserve extra invisible height, scaled to how
      // much main content there is, so the sidebar's own content stays tall
      // enough for the background to keep pace across the same pages.
      const mainWeight =
        (cvData?.experience?.length || 0) * 2 +
        (cvData?.internships?.length || 0) +
        (cvData?.projects?.length || 0) +
        (cvData?.education?.length || 0) +
        (cvData?.certifications?.length || 0) +
        (cvData?.achievements?.length || 0) +
        (cvData?.references?.length || 0) +
        (cvData?.additionalInfo?.length || 0) +
        (cvData?.summary ? cvData.summary.length / 300 : 0);
      const fillerPx = Math.max(0, Math.min(Math.round((mainWeight - 3) * 250), 3000));
      if (fillerPx > 0) {
        // A plain <div style="height:...px"> collapses to zero in Word's HTML
        // import (its layout engine sizes blocks from actual line-box content,
        // not CSS height) - a table row's legacy `height` attribute is the one
        // sizing mechanism Word's importer honors reliably, same as the
        // cellpadding/cellspacing/width attributes used everywhere else in
        // this file's Word output.
        sideParts.push(
          `<table cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td height="${fillerPx}" bgcolor="${pri}" style="height:${fillerPx}px;font-size:1px;line-height:1px;">&nbsp;</td></tr></table>`
        );
      }
    }
  }

  let bodyTable: string;
  if (spec.side) {
    const sideBg = spec.side.dark ? pri : "#f8fafc";
    const innerStyle = spec.side.dark ? "color:#e2e8f0;" : "";
    const widthStyle = spec.side.widthPx
      ? `width:${spec.side.widthPx}px;`
      : spec.side.widthPct
        ? `width:${spec.side.widthPct}%;`
        : "";
    const sideTd = `<td class="cv-sidebar" bgcolor="${sideBg}"${spec.side.widthPx ? ` width="${spec.side.widthPx}"` : spec.side.widthPct ? ` width="${spec.side.widthPct}%"` : ""} valign="top" style="${widthStyle}padding:0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td id="cv-sidebar-inner" class="cv-sidebar-inner" bgcolor="${sideBg}" valign="top" style="${innerStyle}">${sideParts.join("")}</td></tr>
      </table>
    </td>`;
    const mainTd = `<td id="cv-main" class="cv-main" valign="top">${mainHtml}</td>`;
    const row = spec.sideFirst ? `${sideTd}${mainTd}` : `${mainTd}${sideTd}`;
    bodyTable = `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr>${row}</tr></table>`;
  } else {
    bodyTable = `<div id="cv-main" class="cv-main">${mainHtml}</div>`;
  }

  const footer = spec.declarationIn === "footer" ? (() => {
    const decl = declarationHtml(cvData, acc, layout);
    return decl ? `<div id="cv-footer-decl" class="cv-declaration cv-footer-decl">${decl}</div>` : "";
  })() : "";

  return `<div id="cv-body" class="cv-body">${headerHtml}${bodyTable}</div>${footer}`;
}

// ---------------------------------------------------------------------------
// Flat nested CSS flattener
// ---------------------------------------------------------------------------

function flattenNestedCss(rootSelector: string, css: string): string {
  const blockPattern = /([^{}]+)\{([^{}]*)\}/g;
  const rules: string[] = [];
  let baseDecls = "";
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(css)) !== null) {
    const preText = match[1];
    const body = match[2].trim();
    const lastSemi = preText.lastIndexOf(";");
    const selectorPart = (lastSemi === -1 ? preText : preText.slice(lastSemi + 1)).trim();
    baseDecls += lastSemi === -1 ? "" : preText.slice(0, lastSemi + 1);
    if (!selectorPart || !body) continue;
    const fullSelector = selectorPart
      .split(",")
      .map((s) => `${rootSelector} ${s.trim()}`)
      .join(", ");
    rules.push(`${fullSelector} { ${body} }`);
  }

  return [`${rootSelector} { ${baseDecls.trim()} }`, ...rules].join("\n");
}

// ---------------------------------------------------------------------------
// Base Common Styles & Dynamic Themes CSS definitions
// ---------------------------------------------------------------------------

const BASE_CV_STYLES = `
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; }
  p { margin-top: 0; margin-bottom: 10px; }
  ul { margin-top: 0; margin-bottom: 10px; padding-left: 20px; }
  li { margin-bottom: 3px; }
  h1, h2, h3, h4 { page-break-after: avoid; }
  h1 { margin-bottom: 4px; }
  h2 { margin-top: 20px; margin-bottom: 8px; }
  h3 { margin-top: 16px; margin-bottom: 6px; }
  h4 { margin-top: 10px; margin-bottom: 2px; }
`;

const THEME_STYLES: Record<CvLayout, (a: CssCtx) => string> = {
  corporate: ({ pri, acc, fam, S }) => `
    font-family: ${fam}; color: #334155; font-size: ${S(11.5)}; line-height: 1.7;
    .cv-header-box { border-bottom: 4px solid ${pri}; padding-bottom: 20px; margin-bottom: 25px; }
    h1 { color: ${pri}; font-weight: 900; font-size: ${S(30)}; text-transform: uppercase; letter-spacing: -0.02em; margin: 0; }
    .cv-title { font-size: ${S(14)}; font-weight: 700; margin-top: 5px; margin-bottom: 0; }
    h2 { color: ${pri}; font-weight: 800; font-size: ${S(12.5)}; text-transform: uppercase; letter-spacing: 0.02em; background: #e8f4fd; border-left: 5px solid ${acc}; padding: 8px 15px; margin-top: 28px; margin-bottom: 15px; }
    h3 { color: ${acc}; font-weight: 800; font-size: ${S(11)}; margin-top: 24px; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid ${acc}; padding-bottom: 5px; }
    h4 { font-size: ${S(10)}; font-weight: 800; color: #ffffff; text-decoration: underline; text-underline-offset: 3px; margin-bottom: 5px; }
    p { margin-bottom: 16px; text-align: justify; }
    table td { font-size: ${S(11.5)}; }
    .cv-exp-head strong { color: #000000; font-weight: 800; font-size: ${S(12.5)}; }
    .cv-exp-role { color: ${acc}; font-weight: 700; font-size: ${S(11.5)}; margin-top: 2px; margin-bottom: 6px; }
    .cv-project-card strong { color: ${pri}; font-size: ${S(12)}; }
    .cv-project-card p { color: #555555; font-size: ${S(10.5)}; line-height: 1.4; margin-top: 4px; }
    .cv-sidebar p strong { color: ${acc}; }
    .cv-verified-badge { display: inline-block; background: #27ae60; color: #ffffff; padding: 4px 12px; border-radius: 4px; font-weight: 800; font-size: ${S(10)}; text-transform: uppercase; }
  `,
  legal: ({ pri, fam, S }) => `
    font-family: ${fam}; color: #000000; font-size: ${S(11)}; line-height: 2.0; text-align: justify;
    .cv-header { text-align: center; border-top: 2px double ${pri}; border-bottom: 2px double ${pri}; padding: 12px 0; margin-bottom: 20px; }
    .cv-header h1 { line-height: 1.2; }
    .cv-header p { line-height: 1.4; margin-bottom: 4px; }
    h1 { font-size: ${S(22)}; font-weight: bold; color: ${pri}; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; padding: 0; }
    h2 { text-transform: uppercase; font-size: ${S(12)}; font-weight: bold; color: ${pri}; margin-top: 40px; margin-bottom: 16px; text-align: center; }
    h3 { font-size: ${S(11)}; font-weight: bold; text-decoration: underline; margin-top: 24px; margin-bottom: 12px; }
    h4 { font-size: ${S(11)}; font-weight: bold; }
    p { margin-bottom: 20px; }
    ul { list-style-type: disc; padding-left: 32px; margin-bottom: 20px; }
  `,
  modern: ({ pri, acc, fam, S }) => `
    font-family: ${fam}; color: #4b5563; font-size: ${S(10.5)}; line-height: 1.75;
    h1 { font-size: ${S(28)}; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 8px; }
    h2 { color: ${pri}; font-weight: 700; font-size: ${S(14)}; margin-top: 24px; margin-bottom: 12px; display: flex; align-items: center; }
    h2::before { content: ''; display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: ${acc}; margin-right: 12px; }
    h3 { color: ${acc}; font-weight: 600; font-size: ${S(11.5)}; margin-top: 24px; margin-bottom: 10px; background: ${acc}10; display: inline-block; padding: 4px 12px; border-radius: 20px; }
    h4 { font-size: ${S(10.5)}; font-weight: 700; color: ${pri}; }
    table td { font-size: ${S(10.5)}; }
  `,
  executive: ({ pri, acc, fam, S }) => `
    font-family: ${fam}; color: #1e293b; line-height: 1.8; font-size: ${S(11)};
    h1 { color: ${pri}; font-weight: 400; font-size: ${S(24)}; text-align: center; border-top: 1px solid ${acc}; border-bottom: 1px solid ${acc}; padding: 24px 0; margin-bottom: 32px; letter-spacing: 0.05em; background: rgba(0,0,0,0.02); }
    h2 { color: ${pri}; font-weight: 700; font-size: ${S(12)}; text-transform: uppercase; letter-spacing: 0.15em; margin-top: 48px; margin-bottom: 20px; text-align: center; }
    h2::after { content: ''; display: block; width: 40px; height: 2px; background: ${acc}; margin: 12px auto 0; }
    h3 { color: ${acc}; font-style: italic; font-weight: normal; font-size: ${S(11.5)}; margin-top: 24px; margin-bottom: 12px; }
    p { margin-bottom: 20px; text-align: justify; }
  `,
  minimal: ({ pri, acc, fam, S }) => `
    font-family: ${fam}; color: #27272a; font-size: ${S(10.5)}; line-height: 1.6;
    h1 { font-weight: 300; font-size: ${S(24)}; margin-bottom: 24px; letter-spacing: -0.02em; color: ${pri}; }
    h2 { font-weight: 500; font-size: ${S(12)}; margin-top: 32px; margin-bottom: 16px; color: ${pri}; border-bottom: 1px solid #f4f4f5; padding-bottom: 8px; }
    h3 { font-weight: 400; font-size: ${S(10.5)}; margin-top: 20px; margin-bottom: 8px; color: ${acc}; text-transform: uppercase; letter-spacing: 0.05em; }
    h4 { font-size: ${S(10)}; font-weight: 500; color: #52525b; }
    p { margin-bottom: 16px; color: #3f3f46; font-weight: 300; }
  `,
  letterhead: ({ pri, acc, fam, S }) => `
    font-family: ${fam}; color: #1f2937; font-size: ${S(11)}; line-height: 1.65;
    .cv-header { text-align: center; border-top: 3px solid ${pri}; border-bottom: 2px solid ${acc}; padding: 16px 0 12px; margin-bottom: 12px; }
    .cv-header h1 { line-height: 1.2; }
    .cv-header p { line-height: 1.4; }
    h1 { font-weight: 700; font-size: ${S(26)}; text-transform: uppercase; letter-spacing: 0.1em; color: ${pri}; margin-bottom: 8px; }
    h2 { color: #ffffff; background: ${pri}; font-weight: 700; font-size: ${S(12)}; padding: 6px 12px; margin-top: 32px; margin-bottom: 16px; letter-spacing: 0.05em; text-transform: uppercase; }
    h3 { font-weight: 700; font-size: ${S(11.5)}; color: ${acc}; margin-top: 24px; margin-bottom: 12px; }
    h4 { font-size: ${S(11)}; font-weight: 700; color: ${pri}; }
    p { margin-bottom: 18px; }
  `,
  bold: ({ pri, acc, fam, S }) => `
    font-family: ${fam}; color: #000000; font-size: ${S(10.5)}; line-height: 1.6;
    .cv-header-box { border-bottom: 4px solid ${pri}; padding-bottom: 20px; margin-bottom: 25px; }
    h1 { background: ${pri}; color: #ffffff; font-weight: 900; font-size: ${S(24)}; text-transform: uppercase; letter-spacing: 0.05em; padding: 24px 32px; margin-bottom: 48px; border: 4px solid #000000; box-shadow: 8px 8px 0px ${acc}; }
    h2 { color: #000000; display: inline-block; font-weight: 900; font-size: ${S(14)}; padding: 8px 16px; margin-top: 40px; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 0.05em; border: 3px solid #000000; box-shadow: 4px 4px 0px ${acc}; background: #ffffff; }
    h3 { color: ${pri}; font-weight: 900; font-size: ${S(12)}; margin-top: 24px; margin-bottom: 12px; text-transform: uppercase; border-bottom: 4px solid ${acc}; display: inline-block; }
    h4 { font-size: ${S(10.5)}; font-weight: 700; color: ${pri}; }
    p { margin-bottom: 20px; font-weight: 500; }
    table td { font-size: ${S(10.5)}; }
  `,
  editorial: ({ pri, acc, fam, S }) => `
    font-family: ${fam}; color: #292524; font-size: ${S(11.5)}; line-height: 1.8;
    h1 { font-weight: 400; font-style: italic; font-size: ${S(32)}; color: ${pri}; text-align: center; margin-bottom: 16px; letter-spacing: -0.02em; }
    h1::after { content: ''; display: block; width: 120px; height: 1px; background: ${acc}; margin: 24px auto 32px; }
    h2 { font-weight: 600; font-size: ${S(12)}; color: ${pri}; text-transform: uppercase; letter-spacing: 0.2em; margin-top: 40px; margin-bottom: 20px; text-align: center; }
    h3 { font-weight: 700; font-style: italic; font-size: ${S(12)}; color: ${acc}; margin-top: 24px; margin-bottom: 12px; border-left: 3px solid ${acc}; padding-left: 12px; }
    h4 { font-size: ${S(11)}; font-weight: 600; color: ${pri}; }
    p { margin-bottom: 20px; text-align: justify; }
  `,
};

// ---------------------------------------------------------------------------
// Main Public Export (Re-establishes the `buildCvDocument` signature)
// ---------------------------------------------------------------------------

const dataUrlCache = new Map<string, string>();

async function cachedImageUrlToDataUrl(url: string): Promise<string | null> {
  if (dataUrlCache.has(url)) return dataUrlCache.get(url) ?? null;
  const data = await imageUrlToDataUrl(url);
  if (data) dataUrlCache.set(url, data);
  return data;
}

function getCssCtx(primaryColor: string, accentColor: string, fontFamily: string, fontScale: number): CssCtx {
  return {
    pri: primaryColor,
    acc: accentColor,
    fam: fontFamily,
    S: (px: number) => `${Math.round(px * fontScale)}px`,
  };
}

export async function buildCvDocument(
  cvData: any,
  cvSettings: any,
  selectedLayout?: string,
  options?: { wordSafe?: boolean }
): Promise<CvDocument> {
  const layout: CvLayout = (CV_LAYOUTS as string[]).includes(selectedLayout || "") ? (selectedLayout as CvLayout) : "corporate";
  const spec = LAYOUT_SPECS[layout];

  const primaryColor = toCssColor(cvSettings?.primaryColor);
  const accentColor = toCssColor(cvSettings?.accentColor, "#3498db");

  const baseFontFamily = cvSettings?.fontFamily || STRICT_FONT_MAP[layout];
  const fontFamily = options?.wordSafe ? toWordSafeFontStack(baseFontFamily) : baseFontFamily;
  const fontScale = Number(cvSettings?.fontScale) || 1;

  const photoUrl = cvData?.personalInfo?.photoUrl;
  const photoSrc = cvSettings?.showPhoto !== false && photoUrl ? await cachedImageUrlToDataUrl(photoUrl) : null;

  const body = assembleLayout(spec, cvData, cvSettings, photoSrc, layout, !!options?.wordSafe);
  const bodyHtml = `<div class="cv-theme cv-theme-${layout}">${body}</div>`;

  const cssCtx = getCssCtx(primaryColor, accentColor, fontFamily, fontScale);
  let css = flattenNestedCss(".cv-theme", BASE_CV_STYLES) + "\n" + flattenNestedCss(`.cv-theme-${layout}`, THEME_STYLES[layout](cssCtx));

  let layoutCss = `
#cv-body { padding: ${spec.bodyPadding}; }
#cv-main { padding: ${spec.mainPadding}; }`;
  if (spec.side) {
    layoutCss += `\n#cv-sidebar-inner { padding: ${spec.side.padding}; }`;
  }
  if (spec.header?.padding) {
    layoutCss += `\n#cv-header-banner { padding: ${spec.header.padding}; }`;
    layoutCss += `\n#cv-header-text { padding: 0 0 0 20px; }`;
  }
  if (spec.footerPadding) {
    layoutCss += `\n#cv-footer-decl { padding: ${spec.footerPadding}; }`;
  }
  
  css += "\n" + layoutCss;

  if (options?.wordSafe) {
    css = makeCssWordSafe(css, `.cv-theme-${layout}`, fontFamily);
  }

  const applicantName = cvData?.personalInfo?.fullName || "CV";

  return {
    bodyHtml,
    styleHtml: `<style>${css}</style>`,
    css,
    title: `${applicantName} CV`,
    pageSize: "8.27in 11.69in",
    pageMargin: layout === "corporate" ? "0" : "0.4in",
    fileName: `${applicantName.replace(/\s+/g, "_")}_CV.doc`,
    layout,
    fontFamily,
  };
}