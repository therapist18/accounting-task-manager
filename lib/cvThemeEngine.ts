// CV Generator → Word (.doc) theme engine, mirroring the Employment
// Contracts module's architecture (utils/themeEngine.ts) so preview, PDF and
// Word all render ONE source of truth.
//
// Word's HTML import filter does NOT reliably apply CSS reached through
// class-based descendant selectors (`.cv-theme-corporate .cv-name`) - confirmed
// empirically. Therefore, every content element is a real tag, and THEME_STYLES
// below only ever targets `<rootClass> <tag>`. Structural CONTAINERS carry
// box-model properties only, and the most vital colors (sidebar background, 
// name/heading color) are additionally inlined directly on the element as a 
// second line of defense via `headingVisual()`.

import { imageUrlToDataUrl } from "@/lib/documentExport";
import { toWordSafeFontStack, makeCssWordSafe } from "@/lib/documentTheme";

// ---------------------------------------------------------------------------
// Types - Unified & Curated Layouts
// ---------------------------------------------------------------------------

export type CvLayout = 'corporate' | 'legal' | 'modern' | 'minimal' | 'letterhead' | 'editorial';

export const CV_LAYOUTS: CvLayout[] = ['corporate', 'legal', 'modern', 'minimal', 'letterhead', 'editorial'];

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
// Per-theme Layout Configurations
// ---------------------------------------------------------------------------
const LAYOUT_SPECS: Record<CvLayout, LayoutSpec> = {
  corporate: {
    // Professional, structured, Fortune 500 split-layout.
    hasPhoto: true,
    nameInMain: true,
    bodyPadding: "0",
    mainPadding: "24px 24px 24px 16px", // Reduced padding between sidebar & main
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
      widthPx: 260,
      padding: "24px 16px",
      dark: true,
      blocks: [
        { kind: "contact", title: "Contact" },
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
    // Traditional, strict execution copy style. Single column, nested centered header.
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
    // Sleek, tech-forward. Banner header, soft muted sidebar right.
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
  minimal: {
    // Ultra-clean, whitespace heavy, thin lines. Open side-split.
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
    // Subtle classic stationery style. Centered elegant header.
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
  editorial: {
    // Magazine style, text-heavy, beautiful serifs.
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
// Small helpers
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

const CONTACT_DEFS: [string, string, string][] = [
  ["location", "⌖", "Location"],
  ["phone", "☏", "Phone"],
  ["email", "✉", "Email"],
  ["linkedin", "in", "LinkedIn"],
  ["github", "gh", "GitHub"],
];

// ---------------------------------------------------------------------------
// Shared content-block builders
// ---------------------------------------------------------------------------

function photoFrame(photoSrc: string | null, settings: any, size: number, borderColor: string): string {
  const radius = settings.photoShape === "circle" ? "50%" : settings.photoShape === "rounded" ? "12px" : "0";
  const style = `width:${size}px;height:${size}px;border:3px solid ${borderColor};border-radius:${radius};display:block;overflow:hidden;background:#ffffff;`;
  const img = photoSrc
    ? `<img src="${photoSrc}" alt="Profile" width="${size}" height="${size}" style="width:${size}px;height:${size}px;object-fit:${settings.photoFit || "cover"};" />`
    : "";
  return `<div class="cv-photo" style="${style}">${img}</div>`;
}

function contactBlock(personalInfo: any, accent: string): string {
  const lines = CONTACT_DEFS.map(([key, glyph, placeholder]) => {
    const value = personalInfo?.[key];
    return value ? `${glyph}&nbsp;${esc(value)}` : `<em>${glyph}&nbsp;${esc(placeholder)}</em>`;
  }).filter((_, idx) => personalInfo?.[CONTACT_DEFS[idx][0]]);
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
  
  return categories
    .map((grp: any) => {
      const items = splitItems(grp.items);
      // Renders large skill lists gracefully as inline bullet-separated text to prevent massive vertical overflow.
      const list = items.length ? `<p style="line-height:1.6; margin-bottom:12px;">${items.map(i => esc(i)).join(" &bull; ")}</p>` : "";
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

function expEntry(exp: any): string {
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

  return `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td><strong>${company}</strong> — ${role}${loc}</td><td align="right"><em>${dates}</em></td></tr></table>${companyDesc}${ul}`;
}

function expSection(entries: any[], emptyText: string): string {
  if (!entries.length) return `<p><em>${esc(emptyText)}</em></p>`;
  return entries.map((e: any) => expEntry(e)).join("");
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

function projectsBlock(projects: any[]): string {
  if (!projects.length) return "<p><em>No projects added yet.</em></p>";
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

function declarationHtml(cvData: any, accent: string): string {
  const declaration = cvData.declaration || "";
  if (!cvData.includeDeclaration || !declaration) return "";
  const badge = cvData.verifiedBadge
    ? `<p style="color:${accent};"><strong>✓ CV Verified &amp; Up-to-date ${verifiedDateLabel()}</strong></p>`
    : "";
  return `<p><em>${esc(declaration)}</em></p>${badge}`;
}

// ---------------------------------------------------------------------------
// Word-Safe inline visual mappers (The "Second Line of Defense")
// ---------------------------------------------------------------------------

const H1_UPPERCASE: Record<CvLayout, boolean> = {
  corporate: true,
  legal: true,
  modern: false,
  minimal: false,
  letterhead: true,
  editorial: false,
};

function headingVisual(layout: CvLayout, level: "h2" | "h3" | "h4", pri: string, acc: string): { style: string; uppercase: boolean } {
  switch (layout) {
    case "corporate":
      if (level === "h2") return { style: `color:${pri};border-bottom:2px solid #e2e8f0;padding-bottom:6px;`, uppercase: false };
      if (level === "h3") return { style: `color:${acc};`, uppercase: true };
      return { style: "", uppercase: false };
    case "legal":
      if (level === "h2") return { style: `color:${pri};text-align:center;`, uppercase: true };
      if (level === "h3") return { style: `text-decoration:underline;color:#000;`, uppercase: false };
      return { style: "", uppercase: false };
    case "modern":
      if (level === "h2") return { style: `color:${pri};`, uppercase: false };
      // Word hack: mimic the pill badge using solid background and padding
      if (level === "h3") return { style: `color:${acc};background:${acc}15;padding:4px 12px;display:inline-block;border-radius:20px;`, uppercase: false };
      return { style: `color:#1e293b;`, uppercase: false };
    case "minimal":
      if (level === "h2") return { style: `color:${pri};border-bottom:1px solid #f4f4f5;padding-bottom:8px;`, uppercase: false };
      if (level === "h3") return { style: `color:${acc};`, uppercase: true };
      return { style: "", uppercase: false };
    case "letterhead":
      // Solid block banner/ribbon for H2
      if (level === "h2") return { style: `color:#ffffff;background:${pri};padding:4px 16px;`, uppercase: true };
      if (level === "h3") return { style: `color:${acc};`, uppercase: false };
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
    .map(([key, glyph]) => `${glyph}&nbsp;${esc(personalInfo[key])}`);
  const contactHtml = contactItems.length
    ? `<p style="color:${header.variant === "banner" ? "#e5e7eb" : "#666666"}; margin-top:8px;">${contactItems.join("&nbsp;&nbsp;|&nbsp;&nbsp;")}</p>`
    : "";

  const nameBlock = `${nameHtml}${titleHtml}${contactHtml}`;

  let extraStyle = "";
  if (header.variant === "banner") {
    // Ensures text stays visible on a sleek block background
    extraStyle = `background:${pri}; padding:${header.padding}; margin-bottom:16px; border-radius: 4px;`;
  }

  if (!header.photo) {
    return `<div class="cv-header"${extraStyle ? ` style="${extraStyle}"` : ""}>${nameBlock}</div>`;
  }

  const photoTd = `<td width="100" style="width:100px;">${photoFrame(photoSrc, settings, 90, "#ffffff")}</td>`;
  return `<div class="cv-header"${extraStyle ? ` style="${extraStyle}"` : ""}><table cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr>${photoTd}<td style="padding-left: 20px;">${nameBlock}</td></tr></table></div>`;
}

// ---------------------------------------------------------------------------
// Main / sidebar content assemblers
// ---------------------------------------------------------------------------

function buildBlock(block: BlockSpec, cvData: any, settings: any, layout: CvLayout, pri: string, acc: string): string {
  const { personalInfo = {}, personalDetails = {}, skills = [], languages = [], additionalInfo = [], certifications = [], achievements = [], education = [], references = [] } = cvData;
  switch (block.kind) {
    case "summary":
      return cvData.summary ? `<p>${esc(cvData.summary)}</p>` : "<p><em>No profile summary added yet.</em></p>";
    case "experience":
      return expSection(cvData.experience || [], "No work experience added yet.");
    case "internships":
      return expSection(cvData.internships || [], "No internships added yet.");
    case "education":
      return eduEntries(education);
    case "projects":
      return projectsBlock(cvData.projects || []);
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
      return contactBlock(personalInfo, toCssColor(settings?.accentColor, "#3498db"));
    case "details":
      return detailsBlock(personalDetails);
    default:
      return "";
  }
}

const SECTION_ICONS: Record<BlockKind, string> = {
  summary: "📝",
  experience: "💼",
  internships: "🎯",
  projects: "📁",
  education: "🎓",
  certifications: "📜",
  achievements: "🏆",
  additional: "🗂️",
  references: "🤝",
  skills: "🛠️",
  languages: "🌐",
  contact: "📇",
  details: "🪪",
};

function withHeading(level: "h2" | "h3", block: BlockSpec, body: string, layout: CvLayout, pri: string, acc: string): string {
  if (!body) return "";
  const { style, uppercase } = headingVisual(layout, level, pri, acc);
  const styleAttr = style ? ` style="${style}"` : "";
  const title = uppercase ? block.title.toUpperCase() : block.title;
  const icon = SECTION_ICONS[block.kind];
  return `<${level}${styleAttr}>${icon ? `${icon}&nbsp;` : ""}${esc(title)}</${level}>${body}`;
}

function assembleLayout(spec: LayoutSpec, cvData: any, settings: any, photoSrc: string | null, layout: CvLayout): string {
  const pri = toCssColor(settings?.primaryColor);
  const acc = toCssColor(settings?.accentColor, "#3498db");

  const headerHtml = buildHeader(spec, cvData, settings, photoSrc, pri, acc, layout);

  const mainParts: string[] = [];
  if (spec.nameInMain) {
    const { personalInfo = {} } = cvData;
    const nameText = personalInfo.fullName || "Your Name";
    mainParts.push(`<h1 style="color:${pri};">${esc(H1_UPPERCASE[layout] ? nameText.toUpperCase() : nameText)}</h1>`);
    mainParts.push(`<p style="color:${acc};"><strong>${esc((personalInfo.title || "Professional Title").toUpperCase())}</strong></p>`);
  }
  
  for (const block of spec.mainSections) {
    mainParts.push(withHeading("h2", block, buildBlock(block, cvData, settings, layout, pri, acc), layout, pri, acc));
  }
  if (spec.declarationIn === "main") {
    const decl = declarationHtml(cvData, acc);
    if (decl) mainParts.push(`<div class="cv-declaration">${decl}</div>`);
  }
  const mainHtml = mainParts.join("");

  const sideParts: string[] = [];
  if (spec.side) {
    if (spec.hasPhoto && !spec.header?.photo) {
      sideParts.push(`<div class="cv-photo-wrap" style="margin-bottom: 20px;">${photoFrame(photoSrc, settings, Number(settings?.photoSize) || 140, acc)}</div>`);
    }
    for (const block of spec.side.blocks) {
      sideParts.push(withHeading("h3", block, buildBlock(block, cvData, settings, layout, pri, acc), layout, pri, acc));
    }
    if (spec.declarationIn === "side") {
      const decl = declarationHtml(cvData, acc);
      if (decl) sideParts.push(`<div class="cv-declaration">${decl}</div>`);
    }
  }

  let bodyTable: string;
  if (spec.side) {
    const sideBg = spec.side.dark ? pri : "#f8fafc";
    const innerStyle = `padding:${spec.side.padding};${spec.side.dark ? "color:#e2e8f0;" : ""}`;
    const widthAttr = spec.side.widthPx
      ? ` width="${spec.side.widthPx}" style="width:${spec.side.widthPx}px;"`
      : spec.side.widthPct
        ? ` width="${spec.side.widthPct}%"`
        : "";
    // Nested table to prevent Word from rendering div backgrounds as tight text highlights
    const sideTd = `<td class="cv-sidebar" bgcolor="${sideBg}"${widthAttr} valign="top" style="padding:0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td bgcolor="${sideBg}" valign="top" style="${innerStyle}">${sideParts.join("")}</td></tr>
      </table>
    </td>`;
    const mainTd = `<td class="cv-main" valign="top" style="padding:${spec.mainPadding};">${mainHtml}</td>`;
    const row = spec.sideFirst ? `${sideTd}${mainTd}` : `${mainTd}${sideTd}`;
    bodyTable = `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr>${row}</tr></table>`;
  } else {
    bodyTable = `<div class="cv-main" style="padding:${spec.mainPadding};">${mainHtml}</div>`;
  }

  const footer = spec.declarationIn === "footer" ? (() => {
    const decl = declarationHtml(cvData, acc);
    return decl ? `<div class="cv-declaration" style="padding:${spec.footerPadding};">${decl}</div>` : "";
  })() : "";

  return `<div class="cv-body" style="padding:${spec.bodyPadding};">${headerHtml}${bodyTable}</div>${footer}`;
}

// ---------------------------------------------------------------------------
// Theme CSS 
// ---------------------------------------------------------------------------

const BASE_CV_STYLES = `
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; }
  p { margin: 0 0 10px; }
  ul { margin: 0 0 10px 20px; padding: 0; }
  li { margin-bottom: 3px; }
  h1, h2, h3, h4 { page-break-after: avoid; }
  h1 { margin: 0 0 4px; }
  h2 { margin: 20px 0 8px; }
  h3 { margin: 16px 0 6px; }
  h4 { margin: 10px 0 2px; }
`;

const THEME_STYLES: Record<CvLayout, (a: CssCtx) => string> = {
  corporate: ({ pri, acc, fam, S }) => `
    font-family: ${fam}; color: #334155; font-size: ${S(11.5)}; line-height: 1.7;
    h1 { color: ${pri}; font-weight: 800; font-size: ${S(24)}; text-transform: uppercase; letter-spacing: 0.05em; background: linear-gradient(90deg, #f8fafc 0%, transparent 100%); border-left: 6px solid ${acc}; padding: 12px 16px; margin-bottom: 24px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); text-align: left; }
    h2 { color: ${pri}; font-weight: 700; font-size: ${S(12.5)}; margin-top: 36px; margin-bottom: 14px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; }
    h3 { color: ${acc}; font-weight: 700; font-size: ${S(11)}; margin-top: 24px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
    h4 { font-size: ${S(10.5)}; font-weight: 700; color: #64748b; }
    p { margin-bottom: 16px; text-align: justify; }
    table td { font-size: ${S(11.5)}; }
  `,
  legal: ({ pri, fam, S }) => `
    font-family: ${fam}; color: #000000; font-size: ${S(11)}; line-height: 2.0; text-align: justify;
    .cv-header { text-align: center; border-top: 2px double ${pri}; border-bottom: 2px double ${pri}; padding: 12px 0; margin-bottom: 20px; }
    .cv-header h1 { line-height: 1.2; }
    .cv-header p { line-height: 1.4; margin-bottom: 4px; }
    h1 { font-size: ${S(22)}; font-weight: bold; color: ${pri}; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 8px 0; padding: 0; }
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
    h1 { font-weight: 700; font-size: ${S(26)}; text-transform: uppercase; letter-spacing: 0.1em; color: ${pri}; margin: 0 0 8px 0; }
    h2 { color: #ffffff; background: ${pri}; font-weight: 700; font-size: ${S(12)}; padding: 6px 12px; margin: 32px 0 16px; letter-spacing: 0.05em; text-transform: uppercase; }
    h3 { font-weight: 700; font-size: ${S(11.5)}; color: ${acc}; margin-top: 24px; margin-bottom: 12px; }
    h4 { font-size: ${S(11)}; font-weight: 700; color: ${pri}; }
    p { margin-bottom: 18px; }
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
// Word-safe transform + flat CSS
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
// Document builder
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

// Enforces a strict, singular typography mapping ensuring no mixed font families
const STRICT_FONT_MAP: Record<CvLayout, string> = {
  corporate: "Arial, Helvetica, sans-serif",
  legal: '"Times New Roman", Times, serif',
  modern: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  minimal: "system-ui, -apple-system, sans-serif",
  letterhead: "Calibri, Arial, sans-serif",
  editorial: 'Georgia, "Times New Roman", serif',
};

// Builds the single source-of-truth themed CV document. The returned
// bodyHtml/styleHtml render the live preview (CvPreviewPanel), and the same
// bodyHtml/css feed buildWordDocBlob for the .doc download — identical markup
// and CSS in both, so Word preserves the on-screen theme styling.
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

  // Strictly bind a single font family to entirely standardize the document's aesthetic
  const baseFontFamily = cvSettings?.fontFamily || STRICT_FONT_MAP[layout];
  
  const fontFamily = options?.wordSafe ? toWordSafeFontStack(baseFontFamily) : baseFontFamily;
  const fontScale = Number(cvSettings?.fontScale) || 1;

  const photoUrl = cvData?.personalInfo?.photoUrl;
  const photoSrc = cvSettings?.showPhoto !== false && photoUrl ? await cachedImageUrlToDataUrl(photoUrl) : null;

  const body = assembleLayout(spec, cvData, cvSettings, photoSrc, layout);
  const bodyHtml = `<div class="cv-theme cv-theme-${layout}">${body}</div>`;

  const cssCtx = getCssCtx(primaryColor, accentColor, fontFamily, fontScale);
  let css = flattenNestedCss(".cv-theme", BASE_CV_STYLES) + "\n" + flattenNestedCss(`.cv-theme-${layout}`, THEME_STYLES[layout](cssCtx));

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
    pageMargin: options?.wordSafe ? "0in" : "0.4in",
    fileName: `${applicantName.replace(/\s+/g, "_")}_CV.doc`,
    layout,
    fontFamily,
  };
}