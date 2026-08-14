// CV Generator → Word (.doc) theme engine, mirroring the Employment
// Contracts module's architecture (utils/themeEngine.ts) so preview, PDF and
// Word all render ONE source of truth.
//
// Word's HTML import filter does NOT reliably apply CSS reached through
// class-based descendant selectors (`.cv-theme-theme1 .cv-name`) - confirmed
// empirically: an earlier version of this file styled every piece of content
// with a custom class on a generic <div>, and the resulting .doc opened in
// Word with zero styling applied (no colors, no sidebar, no heading
// hierarchy - plain text top to bottom) even though the exact same HTML/CSS
// rendered correctly in a browser. Contracts' themeEngine.ts never hit this
// because its content is built from REAL semantic tags (h1/h2/h3/p/table)
// styled via selectors like `.contract-theme-corporate h1` - root class +
// bare tag name, which Word's importer resolves the same way it resolves its
// own built-in Heading/Normal styles.
//
// So the rule here is the same: every content element is a real tag
// (h1/h2/h3/h4/p/table/th/td/ul/li/strong/em), and THEME_STYLES below only
// ever targets `<rootClass> <tag>` - never `<rootClass> .customClass` for
// anything that repeats. A handful of structural CONTAINERS (sidebar/main
// cell, section wrapper, photo frame, declaration block) still carry a class
// - exactly like Contract's own `.cs-section`/`.signature-column` - but those
// carry box-model properties only (background/padding/margin/width), never
// text styling, and the two colors that matter most for "does this look
// designed at all" (sidebar background, name/heading color) are additionally
// inlined directly on the element as a second line of defense.

import { imageUrlToDataUrl } from "@/lib/documentExport";
import { toWordSafeFontStack, makeCssWordSafe } from "@/lib/documentTheme";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CvLayout = "theme1" | "theme2" | "theme3" | "theme4" | "theme5" | "theme6" | "theme7" | "cv_corporate" | "cv_legal";

export const CV_LAYOUTS: CvLayout[] = ["theme1", "theme2", "theme3", "theme4", "theme5", "theme6", "theme7", "cv_corporate", "cv_legal"];

export interface CvDocument {
  // Themed body markup (root div + tables + content). Contains no <style>.
  bodyHtml: string;
  // '<style>...</style>' block — prepend to bodyHtml when rendering the
  // on-screen preview so the same CSS drives the live view.
  styleHtml: string;
  // Raw CSS (same contents as styleHtml) for buildWordDocBlob, which hoists
  // it into <head> where Word actually reads it.
  css: string;
  title: string;
  pageSize: string;
  pageMargin: string;
  fileName: string;
}

interface CssCtx {
  pri: string;
  acc: string;
  fam: string;
  // Scales a px design value by the user's font scale.
  S: (px: number) => string;
}

type BlockKind =
  | "summary"
  | "experience"
  | "internships"
  | "projects"
  | "education"
  | "certifications"
  | "achievements"
  | "additional"
  | "references"
  | "skills"
  | "languages"
  | "contact"
  | "details";

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
  dark: boolean; // true = colored background (needs light text), false = pale/neutral background
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
  nameInMain: boolean; // name/title block rendered at the top of the main column (sidebar-family themes with no <header>)
}

// Per-theme layout configuration — the CV equivalent of contracts'
// THEME_STYLES/THEME_HEADERS: which sections live in the main column, which
// live in the sidebar, header shape, paddings. Visual treatment (colors,
// fonts, heading sizes) is entirely in THEME_STYLES below.
const LAYOUT_SPECS: Record<CvLayout, LayoutSpec> = {
  theme1: {
    hasPhoto: true,
    nameInMain: true,
    bodyPadding: "0",
    mainPadding: "32px",
    mainSections: [
      { kind: "summary", title: "Professional Profile" },
      { kind: "experience", title: "Professional Experience" },
      { kind: "internships", title: "Internships" },
      { kind: "projects", title: "Key Projects" },
      { kind: "education", title: "Education" },
      { kind: "certifications", title: "Certifications" },
      { kind: "achievements", title: "Achievements" },
      { kind: "references", title: "References" },
    ],
    side: {
      widthPx: 280,
      padding: "20px 15px",
      dark: true,
      blocks: [
        { kind: "contact", title: "Contact Information" },
        { kind: "details", title: "Personal Details" },
        { kind: "skills", title: "Core Competencies" },
        { kind: "languages", title: "Languages" },
        { kind: "additional", title: "Additional Info" },
      ],
    },
    sideFirst: true,
    declarationIn: "main",
    footerPadding: "0",
  },
  theme2: {
    header: { variant: "banner", padding: "24px 32px" },
    hasPhoto: false,
    nameInMain: false,
    bodyPadding: "0",
    mainPadding: "32px 12px 32px 32px",
    mainSections: [
      { kind: "summary", title: "Professional Profile" },
      { kind: "experience", title: "Professional Experience" },
      { kind: "internships", title: "Internships" },
      { kind: "projects", title: "Key Projects" },
    ],
    side: {
      widthPct: 34,
      padding: "20px 32px 20px 12px",
      dark: false,
      blocks: [
        { kind: "skills", title: "Core Competencies" },
        { kind: "details", title: "Personal Details" },
        { kind: "education", title: "Education" },
        { kind: "certifications", title: "Certifications" },
        { kind: "achievements", title: "Achievements" },
        { kind: "additional", title: "Additional Info" },
        { kind: "languages", title: "Languages" },
        { kind: "references", title: "References" },
      ],
    },
    declarationIn: "footer",
    footerPadding: "24px 32px 24px",
  },
  theme3: {
    header: { variant: "centered", padding: "0 0 20px" },
    hasPhoto: false,
    nameInMain: false,
    bodyPadding: "40px 60px",
    mainPadding: "0",
    mainSections: [
      { kind: "summary", title: "Professional Profile" },
      { kind: "experience", title: "Professional Experience" },
      { kind: "education", title: "Education" },
      { kind: "skills", title: "Technical & Professional Skills" },
      { kind: "languages", title: "Languages" },
      { kind: "certifications", title: "Certifications" },
      { kind: "achievements", title: "Achievements" },
      { kind: "additional", title: "Additional Info" },
      { kind: "references", title: "References" },
    ],
    declarationIn: "footer",
    footerPadding: "20px 60px 40px",
  },
  theme4: {
    header: { variant: "banner", padding: "24px 32px" },
    hasPhoto: true,
    nameInMain: false,
    bodyPadding: "0",
    mainPadding: "32px",
    mainSections: [
      { kind: "summary", title: "Executive Profile" },
      { kind: "experience", title: "Leadership Experience" },
      { kind: "projects", title: "Key Projects & Impact" },
      { kind: "education", title: "Education" },
    ],
    side: {
      widthPx: 280,
      padding: "20px",
      dark: false,
      blocks: [
        { kind: "skills", title: "Core Competencies" },
        { kind: "languages", title: "Languages" },
        { kind: "certifications", title: "Certifications" },
        { kind: "additional", title: "Details" },
        { kind: "references", title: "References" },
      ],
    },
    declarationIn: "side",
    footerPadding: "0",
  },
  theme5: {
    hasPhoto: true,
    nameInMain: true,
    bodyPadding: "0",
    mainPadding: "24px",
    mainSections: [
      { kind: "summary", title: "Profile" },
      { kind: "experience", title: "Experience" },
      { kind: "education", title: "Education" },
      { kind: "certifications", title: "Certifications" },
      { kind: "achievements", title: "Achievements" },
      { kind: "references", title: "References" },
    ],
    side: {
      widthPx: 200,
      padding: "20px",
      dark: true,
      blocks: [
        { kind: "contact", title: "Contact" },
        { kind: "skills", title: "Skills" },
        { kind: "languages", title: "Languages" },
        { kind: "details", title: "Details" },
      ],
    },
    sideFirst: true,
    declarationIn: "footer",
    footerPadding: "16px 24px 24px",
  },
  theme6: {
    header: { variant: "banner", padding: "16px" },
    hasPhoto: false,
    nameInMain: false,
    bodyPadding: "20px",
    mainPadding: "16px",
    mainSections: [
      { kind: "summary", title: "Abstract" },
      { kind: "experience", title: "Academic & Research Experience" },
      { kind: "projects", title: "Publications & Projects" },
      { kind: "education", title: "Education" },
      { kind: "references", title: "Referees" },
    ],
    side: {
      widthPct: 30,
      padding: "16px",
      dark: false,
      blocks: [
        { kind: "contact", title: "Contact" },
        { kind: "languages", title: "Languages" },
        { kind: "skills", title: "Technical Skills" },
        { kind: "certifications", title: "Certifications" },
      ],
    },
    declarationIn: "side",
    footerPadding: "0",
  },
  theme7: {
    header: { variant: "centered", padding: "24px" },
    hasPhoto: false,
    nameInMain: false,
    bodyPadding: "32px",
    mainPadding: "24px",
    mainSections: [
      { kind: "summary", title: "Career Profile" },
      { kind: "experience", title: "Work History" },
      { kind: "education", title: "Education" },
      { kind: "certifications", title: "Certifications" },
      { kind: "skills", title: "Skills" },
      { kind: "projects", title: "Projects" },
    ],
    declarationIn: "footer",
    footerPadding: "24px",
  },
  cv_corporate: {
    header: { variant: "centered", padding: "0 0 20px" },
    hasPhoto: false,
    nameInMain: false,
    bodyPadding: "40px 60px",
    mainPadding: "0",
    mainSections: [
      { kind: "summary", title: "Professional Profile" },
      { kind: "experience", title: "Professional Experience" },
      { kind: "education", title: "Education" },
      { kind: "skills", title: "Technical & Professional Skills" },
      { kind: "languages", title: "Languages" },
      { kind: "certifications", title: "Certifications" },
      { kind: "achievements", title: "Achievements" },
      { kind: "additional", title: "Additional Info" },
      { kind: "references", title: "References" },
    ],
    declarationIn: "footer",
    footerPadding: "20px 60px 40px",
  },
  cv_legal: {
    header: { variant: "centered", padding: "0 0 20px" },
    hasPhoto: false,
    nameInMain: false,
    bodyPadding: "40px 60px",
    mainPadding: "0",
    mainSections: [
      { kind: "summary", title: "Professional Profile" },
      { kind: "experience", title: "Professional Experience" },
      { kind: "education", title: "Education" },
      { kind: "skills", title: "Technical & Professional Skills" },
      { kind: "languages", title: "Languages" },
      { kind: "certifications", title: "Certifications" },
      { kind: "achievements", title: "Achievements" },
      { kind: "additional", title: "Additional Info" },
      { kind: "references", title: "References" },
    ],
    declarationIn: "footer",
    footerPadding: "20px 60px 40px",
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
// Shared content-block builders — every one emits real semantic tags
// (h3/h4/p/ul/li/table) so Word's tag-scoped CSS (THEME_STYLES) actually
// applies. `accent` is an inline color used only for the couple of elements
// where "is this even styled" matters most (see file header comment).
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
      const list = items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "";
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

// Word's HTML import filter does NOT support CSS text-transform at all (on
// any selector, tag- or class-based) - confirmed empirically: a name styled
// via `text-transform: uppercase` renders in original case in the .doc while
// rendering correctly uppercased in the browser preview from the exact same
// stylesheet. So wherever a theme's THEME_STYLES declares an uppercase
// heading, the actual text content is upper-cased here in JS instead of (or
// alongside) the CSS rule, which still keeps the browser preview correct.
const H1_UPPERCASE: Record<CvLayout, boolean> = {
  theme1: true,
  theme2: false,
  theme3: true,
  theme4: false,
  theme5: true,
  theme6: false,
  theme7: false,
  cv_corporate: false,
  cv_legal: false,
};

// Word also auto-maps <h1>-<h6> tags to its own built-in "Heading N" styles,
// which can partially override external stylesheet rules on those same tags
// (font-size/weight come through, but color/border can get lost). So beyond
// the CSS in THEME_STYLES, each heading's color/border is additionally
// inlined directly on the element - mirrors the same belt-and-suspenders
// approach already used for the sidebar background and h1 name/title colors.
function headingVisual(layout: CvLayout, level: "h2" | "h3" | "h4", pri: string, acc: string): { style: string; uppercase: boolean } {
  switch (layout) {
    case "theme1":
      if (level === "h2") return { style: `color:${pri};border-bottom:2px solid ${acc};padding-bottom:4px;`, uppercase: true };
      if (level === "h3") return { style: `color:${acc};border-bottom:1px solid #ffffff40;padding-bottom:4px;`, uppercase: true };
      return { style: "", uppercase: true };
    case "theme2":
      if (level === "h2") return { style: `color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:4px;`, uppercase: true };
      if (level === "h3") return { style: `color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:3px;`, uppercase: true };
      return { style: `color:#1e293b;`, uppercase: false };
    case "theme3":
      if (level === "h2") return { style: `color:${pri};border-bottom:1px solid #e0e4e8;padding-bottom:4px;`, uppercase: true };
      if (level === "h4") return { style: `color:${acc};`, uppercase: true };
      return { style: "", uppercase: false };
    case "theme4":
      if (level === "h2") return { style: `color:${pri};border-bottom:2px solid ${acc};padding-bottom:4px;`, uppercase: true };
      if (level === "h3") return { style: `color:${acc};border-bottom:1px solid ${acc};padding-bottom:3px;`, uppercase: true };
      return { style: "", uppercase: false };
    case "theme5":
      if (level === "h2") return { style: `color:${pri};`, uppercase: true };
      if (level === "h3") return { style: `color:${acc};`, uppercase: true };
      return { style: `color:${acc};`, uppercase: false };
    case "theme6":
      if (level === "h2") return { style: `color:${pri};border-bottom:1px solid #e2e8f0;padding-bottom:3px;`, uppercase: true };
      if (level === "h3") return { style: `color:${acc};border-bottom:1px solid #e2e8f0;padding-bottom:3px;`, uppercase: true };
      return { style: "", uppercase: false };
    case "theme7":
      if (level === "h2") return { style: `color:${pri};`, uppercase: true };
      if (level === "h3") return { style: `color:${acc};border-bottom:1px solid #e2e8f0;padding-bottom:3px;`, uppercase: true };
      return { style: "", uppercase: false };
    default:
      return { style: "", uppercase: false };
  }
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
// Header builder
// ---------------------------------------------------------------------------

function buildHeader(spec: LayoutSpec, cvData: any, settings: any, photoSrc: string | null, pri: string, acc: string, layout: CvLayout): string {
  const header = spec.header;
  if (!header) return "";
  const { personalInfo = {} } = cvData;

  const nameText = personalInfo.fullName || "Your Name";
  const nameHtml = `<h1 style="color:${header.variant === "banner" ? "#ffffff" : pri};">${esc(H1_UPPERCASE[layout] ? nameText.toUpperCase() : nameText)}</h1>`;
  const titleHtml = `<p style="color:${acc};"><strong>${esc((personalInfo.title || "Professional Title").toUpperCase())}</strong></p>`;

  const contactItems = CONTACT_DEFS
    .filter(([key]) => personalInfo[key])
    .map(([key, glyph]) => `${glyph}&nbsp;${esc(personalInfo[key])}`);
  const contactHtml = contactItems.length
    ? `<p style="color:${header.variant === "banner" ? "#e5e7eb" : "#666666"};">${contactItems.join("&nbsp;&nbsp;|&nbsp;&nbsp;")}</p>`
    : "";

  const nameBlock = `${nameHtml}${titleHtml}${contactHtml}`;

  if (!header.photo) {
    return `<div class="cv-header">${nameBlock}</div>`;
  }

  const photoTd = `<td width="100" style="width:100px;">${photoFrame(photoSrc, settings, 90, "#ffffff")}</td>`;
  return `<div class="cv-header"><table cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr>${photoTd}<td>${nameBlock}</td></tr></table></div>`;
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

function withHeading(level: "h2" | "h3", block: BlockSpec, body: string, layout: CvLayout, pri: string, acc: string): string {
  if (!body) return "";
  const { style, uppercase } = headingVisual(layout, level, pri, acc);
  const styleAttr = style ? ` style="${style}"` : "";
  const title = uppercase ? block.title.toUpperCase() : block.title;
  return `<${level}${styleAttr}>${esc(title)}</${level}>${body}`;
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
  if (spec.hasPhoto && spec.side && !spec.header) {
    // Sidebar themes with no banner header render the photo at the top of the sidebar instead.
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
      sideParts.push(`<div class="cv-photo-wrap">${photoFrame(photoSrc, settings, Number(settings?.photoSize) || 140, acc)}</div>`);
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
    // Background/padding/text-color live on an INNER div sized to the
    // sidebar's own content, not on the <td> itself. A table row that spans
    // multiple printed pages forces every cell in it to share the row's full
    // height on each page (Word has no per-cell auto-height across page
    // breaks) - so a background-color set directly on the <td> keeps
    // painting for the entire row height even once the sidebar's real
    // content has run out, producing a solid empty color block on trailing
    // pages once main-column content outlasts the sidebar. Confining the
    // color to a div sized to actual content avoids that: any leftover
    // forced cell height beyond the div is left uncolored instead.
    // Word requires bgcolor on the <td> to actually color the whole column.
    // The previous approach tried to confine color to an inner div to avoid 
    // coloring trailing pages, but Word renders div backgrounds as tight text 
    // highlights instead of block backgrounds.
    const sideBg = spec.side.dark ? pri : "#f8fafc";
    const innerStyle = `padding:${spec.side.padding};${spec.side.dark ? "color:#ffffff;" : ""}`;
    const widthAttr = spec.side.widthPx
      ? ` width="${spec.side.widthPx}" style="width:${spec.side.widthPx}px;"`
      : spec.side.widthPct
        ? ` width="${spec.side.widthPct}%"`
        : "";
    // Use a nested table instead of a div for the inner sidebar container.
    // Word is notorious for converting <div> background/padding into tight text
    // highlighting across page breaks. A nested table forces a block context.
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
// Theme CSS (flat, scoped by root class + bare tag only — the same pattern
// Contracts' THEME_STYLES uses) — the CV equivalent of contracts'
// THEME_STYLES. Every rule is nested (the bare decls at the top become the
// .cv-theme-<layout> root rule via flattenNestedCss).
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
  theme1: ({ pri, acc, fam, S }) => `
    font-family: ${fam};
    color: #333333;
    line-height: 1.5;
    font-size: ${S(11)};
    h1 { font-size: ${S(30)}; font-weight: 800; text-transform: uppercase; letter-spacing: -0.5px; }
    h2 { font-size: ${S(13)}; font-weight: 800; text-transform: uppercase; color: ${pri}; border-bottom: 2px solid ${acc}; padding-bottom: 4px; }
    h3 { font-size: ${S(12)}; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: ${acc}; border-bottom: 1px solid #ffffff40; padding-bottom: 4px; }
    h4 { font-size: ${S(10.5)}; font-weight: 700; text-transform: uppercase; }
    table td { font-size: ${S(11)}; }
  `,
  theme2: ({ pri, acc, fam, S }) => `
    font-family: ${fam};
    color: #1e293b;
    line-height: 1.6;
    font-size: ${S(10.5)};
    h1 { font-size: ${S(30)}; font-weight: 800; letter-spacing: -0.5px; }
    h2 { font-size: ${S(13)}; font-weight: 700; text-transform: uppercase; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; }
    h3 { font-size: ${S(11)}; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; }
    h4 { font-size: ${S(10.5)}; font-weight: 700; color: #1e293b; }
    table td { font-size: ${S(10.5)}; }
  `,
  theme3: ({ pri, acc, fam, S }) => `
    font-family: ${fam};
    color: #333333;
    line-height: 1.6;
    font-size: ${S(10.5)};
    h1 { font-size: ${S(26)}; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: ${pri}; text-align: center; }
    h2 { font-size: ${S(12)}; font-weight: 800; color: ${pri}; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #e0e4e8; padding-bottom: 4px; }
    h4 { font-size: ${S(9.5)}; font-weight: 700; text-transform: uppercase; color: ${acc}; }
    table td { font-size: ${S(10.5)}; }
  `,
  theme4: ({ pri, acc, fam, S }) => `
    font-family: ${fam};
    color: #334155;
    line-height: 1.6;
    font-size: ${S(11)};
    h1 { font-size: ${S(30)}; font-weight: 800; letter-spacing: -0.5px; }
    h2 { font-size: ${S(15)}; font-weight: 800; text-transform: uppercase; color: ${pri}; border-bottom: 2px solid ${acc}; padding-bottom: 4px; }
    h3 { font-size: ${S(11)}; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: ${acc}; border-bottom: 1px solid ${acc}; padding-bottom: 3px; }
    h4 { font-size: ${S(10.5)}; font-weight: 700; }
    table td { font-size: ${S(11)}; }
  `,
  theme5: ({ pri, acc, fam, S }) => `
    font-family: ${fam};
    color: #333333;
    line-height: 1.5;
    font-size: ${S(10.5)};
    h1 { font-size: ${S(24)}; font-weight: 800; text-transform: uppercase; letter-spacing: -0.5px; }
    h2 { font-size: ${S(11)}; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: ${pri}; }
    h3 { font-size: ${S(11)}; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: ${acc}; }
    h4 { font-size: ${S(10)}; font-weight: 700; color: ${acc}; }
    table td { font-size: ${S(10.5)}; }
  `,
  theme6: ({ pri, acc, fam, S }) => `
    font-family: ${fam};
    color: #222222;
    line-height: 1.6;
    font-size: ${S(10.5)};
    h1 { font-size: ${S(24)}; font-weight: 700; color: #ffffff; letter-spacing: -0.5px; }
    h2 { font-size: ${S(13)}; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: ${pri}; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; }
    h3 { font-size: ${S(11)}; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: ${acc}; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; }
    h4 { font-size: ${S(10.5)}; font-weight: 700; }
    table td { font-size: ${S(10.5)}; }
  `,
  theme7: ({ pri, acc, fam, S }) => `
    font-family: ${fam}; color: #333; font-size: ${S(11)}; line-height: 1.5;
    h1 { color: ${pri}; font-size: ${S(22)}; font-weight: 700; border-bottom: 2px solid ${pri}; padding-bottom: 6px; }
    h2 { color: ${pri}; font-size: ${S(16)}; font-weight: 700; margin-top: 24px; position: relative; padding-left: 20px; }
    h2::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: ${acc}; }
    h3 { font-size: ${S(13)}; font-weight: 700; color: #111; }
    h4 { font-size: ${S(11)}; font-weight: 600; color: #444; }
  `,
  cv_corporate: ({ pri, acc, fam, S }) => `
    font-family: ${fam}; color: #334155; font-size: ${S(11.5)}; line-height: 1.7;
    h1 { color: ${pri}; font-weight: 800; font-size: ${S(18)}; text-transform: uppercase; letter-spacing: 0.05em; background: linear-gradient(90deg, #f8fafc 0%, transparent 100%); border-left: 6px solid ${acc}; padding: 12px 16px; margin-bottom: 32px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); text-align: left; }
    h2 { color: ${pri}; font-weight: 700; font-size: ${S(12.5)}; margin-top: 36px; margin-bottom: 14px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; }
    h3 { color: ${acc}; font-weight: 700; font-size: ${S(11)}; margin-top: 24px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
    p { margin-bottom: 16px; text-align: justify; }
    ul, ol { margin-bottom: 16px; padding-left: 24px; }
    li { margin-bottom: 8px; }
  `,
  cv_legal: ({ pri, fam, S }) => `
    font-family: ${fam}; color: #000000; font-size: ${S(11)}; line-height: 2.0; text-align: justify;
    h1 { text-align: center; text-transform: uppercase; font-size: ${S(16)}; font-weight: bold; color: ${pri}; border-top: 4px double ${pri}; border-bottom: 4px double ${pri}; padding: 16px 0; margin: 40px 0; letter-spacing: 0.1em; }
    h2 { text-transform: uppercase; font-size: ${S(12)}; font-weight: bold; color: ${pri}; margin-top: 48px; margin-bottom: 16px; text-align: center; }
    h3 { font-size: ${S(11)}; font-weight: bold; text-decoration: underline; margin-top: 24px; margin-bottom: 12px; }
    p { margin-bottom: 24px; text-indent: 48px; }
    p.no-indent { text-indent: 0; }
    ol { list-style-type: upper-roman; padding-left: 48px; margin-bottom: 24px; }
    ul { list-style-type: disc; padding-left: 48px; margin-bottom: 24px; }
  `,
};

// ---------------------------------------------------------------------------
// Word-safe transform + flat CSS (same machinery contracts' themeEngine uses)
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

// Builds the single source-of-truth themed CV document. The returned
// bodyHtml/styleHtml render the live preview (CvPreviewPanel), and the same
// bodyHtml/css feed buildWordDocBlob for the .doc download — identical markup
// and CSS in both, so Word preserves the on-screen theme styling. Pass
// `{ wordSafe: true }` (mirroring contracts' applyThemeToHtml option) when
// the output is headed for the .doc: the theme font is remapped to an
// installed-system equivalent (toWordSafeFontStack) since Word can't fetch
// webfonts, keeping the .doc close to the on-screen theme instead of silently
// falling back to Word's own default.
export async function buildCvDocument(
  cvData: any,
  cvSettings: any,
  selectedLayout?: string,
  options?: { wordSafe?: boolean }
): Promise<CvDocument> {
  const layout: CvLayout = (CV_LAYOUTS as string[]).includes(selectedLayout || "") ? (selectedLayout as CvLayout) : "theme1";
  const spec = LAYOUT_SPECS[layout];

  const primaryColor = toCssColor(cvSettings?.primaryColor);
  const accentColor = toCssColor(cvSettings?.accentColor, "#3498db");
  // "Inter" is a web font - Word's HTML import filter cannot load @font-face
  // resources, so it silently substitutes its own default (usually Times New
  // Roman) whenever the primary family isn't installed on the machine
  // opening the .doc. Calibri/Arial are near-universally present in Word
  // installs, so listing them before the generic keyword gives Word a much
  // closer visual match than falling through to its own default. For the
  // .doc path the caller passes `{ wordSafe: true }` and toWordSafeFontStack
  // remaps the web-only faces outright (shared with Employment Contracts).
  const baseFontFamily =
    layout === "theme6"
      ? cvSettings?.fontFamily || "Georgia, 'Times New Roman', serif"
      : cvSettings?.fontFamily || "Inter, Calibri, Arial, sans-serif";
  const fontFamily = options?.wordSafe ? toWordSafeFontStack(baseFontFamily) : baseFontFamily;
  const fontScale = Number(cvSettings?.fontScale) || 1;

  const photoUrl = cvData?.personalInfo?.photoUrl;
  const photoSrc = cvSettings?.showPhoto !== false && photoUrl ? await cachedImageUrlToDataUrl(photoUrl) : null;

  const body = assembleLayout(spec, cvData, cvSettings, photoSrc, layout);
  let bodyHtml = `<div class="cv-theme cv-theme-${layout}">${body}</div>`;

  const cssCtx = getCssCtx(primaryColor, accentColor, fontFamily, fontScale);
  let css = flattenNestedCss(".cv-theme", BASE_CV_STYLES) + "\n" + flattenNestedCss(`.cv-theme-${layout}`, THEME_STYLES[layout](cssCtx));

  if (options?.wordSafe) {
    css = makeCssWordSafe(css, `.cv-theme-${layout}`, fontFamily);
    
    if (typeof DOMParser !== 'undefined') {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div>${bodyHtml}</div>`, 'text/html');
      
      const extractCssRule = (cssText: string, selector: string) => {
        const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = cssText.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'));
        return match ? match[1].trim() : '';
      };

      // Word's import applies its own built-in Heading styles to h1-h6 no matter what.
      // Convert them to div.mso-hX and inline their CSS, just like Employment Contracts does.
      doc.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
        const div = doc.createElement('div');
        for (const attr of Array.from(h.attributes)) div.setAttribute(attr.name, attr.value);
        div.className = `mso-${h.tagName.toLowerCase()} ${div.className || ''}`.trim();
        div.style.fontFamily = fontFamily;
        while (h.firstChild) div.appendChild(h.firstChild);
        h.replaceWith(div);
      });

      // Table fixes (Word ignores CSS width for tables, needs attributes)
      doc.querySelectorAll('table').forEach((table) => {
        table.setAttribute('cellpadding', '0');
        table.setAttribute('cellspacing', '0');
        table.setAttribute('width', '100%');
      });

      // Inline the CSS rules onto the headings to guarantee they win over Word's defaults
      doc.querySelectorAll('.mso-h1, .mso-h2, .mso-h3, .mso-h4, .mso-h5, .mso-h6').forEach((h) => {
        const tagMatch = h.className.match(/mso-(h[1-6])/);
        if (!tagMatch) return;
        const tag = tagMatch[1];
        
        const baseDecls = extractCssRule(css, `.cv-theme .mso-${tag}`);
        const themeDecls = extractCssRule(css, `.cv-theme-${layout} .mso-${tag}`);
        const prev = h.getAttribute('style') ? `${h.getAttribute('style')};` : '';
        h.setAttribute('style', `${prev}${baseDecls ? `; ${baseDecls}` : ''}${themeDecls ? `; ${themeDecls}` : ''}`.trim());
      });

      bodyHtml = doc.body.firstElementChild?.innerHTML ?? bodyHtml;
    }
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
  };
}
