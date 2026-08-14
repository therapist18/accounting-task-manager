export type DocumentTheme = 'consulting_standard' | 'modern_agency' | 'classic_legal';
export type BrandingStrategy = 'embedded' | 'company_letterhead' | 'theme_header' | 'none';

export interface ContractThemeSettings {
  theme: DocumentTheme;
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  fontScale: 0.9 | 1 | 1.1;
  brandingStrategy: BrandingStrategy;
}

export const THEME_DEFAULTS: Record<DocumentTheme, { primaryColor: string; accentColor: string; fontFamily: string; label: string; description: string }> = {
  consulting_standard: { 
    primaryColor: '#0a3d7d', // Deep blue from the document text/headers
    accentColor: '#178ac7', // Light blue/cyan from the banner graphic
    fontFamily: "'Arial', 'Helvetica', sans-serif", 
    label: 'Consulting Standard', 
    description: 'Based on the official Consultancy Agreement styling' 
  },
  modern_agency: { 
    primaryColor: '#09090b', 
    accentColor: '#10b981', 
    fontFamily: "'Inter', sans-serif", 
    label: 'Modern Agency', 
    description: 'Clean, minimalist, and highly legible for modern tech/agencies' 
  },
  classic_legal: { 
    primaryColor: '#000000', 
    accentColor: '#333333', 
    fontFamily: '"Times New Roman", Times, serif', 
    label: 'Classic Legal', 
    description: 'Strict, double-spaced formal legal formatting' 
  },
};

export const DEFAULT_CONTRACT_THEME: ContractThemeSettings = {
  theme: 'consulting_standard',
  primaryColor: THEME_DEFAULTS.consulting_standard.primaryColor,
  accentColor: THEME_DEFAULTS.consulting_standard.accentColor,
  fontFamily: THEME_DEFAULTS.consulting_standard.fontFamily,
  fontScale: 1,
  brandingStrategy: 'theme_header',
};

import { COLOR_PRESETS, toWordSafeFontStack } from '@/lib/documentTheme';
export { COLOR_PRESETS, toWordSafeFontStack };

export const FONT_OPTIONS = [
  { name: 'Arial', family: 'Arial, Helvetica, sans-serif', desc: 'Plain sans' },
  { name: 'Times New Roman', family: '"Times New Roman", Times, serif', desc: 'Classic legal' },
  { name: 'Inter', family: 'Inter, sans-serif', desc: 'Clean modern' },
  { name: 'Georgia', family: 'Georgia, "Times New Roman", serif', desc: 'Elegant serif' },
];

type ThemeCssArgs = { primaryColor: string; accentColor: string; fontFamily: string; fontScale: number };

const BASE_SECTION_STYLES = `
  .cs-section, .cs-section * { white-space: normal; }
  .cs-section { margin-bottom: 16px; }
  .cs-section:last-child { margin-bottom: 0; }
  .cs-missing-clause { color: #b91c1c; font-style: italic; border: 1px dashed #b91c1c; padding: 10px 14px; border-radius: 4px; }
  .cs-section p { margin-bottom: 8px; }
  .cs-section ul { list-style-type: disc; margin-bottom: 8px; padding-left: 20px; }
  .cs-section ol { list-style-type: decimal; margin-bottom: 8px; padding-left: 20px; }
  .cs-section li { display: list-item; margin-bottom: 4px; }
  .cs-section h1 { margin-bottom: 16px; }
  .cs-section h2 { margin-top: 4px; margin-bottom: 8px; }
  .cs-section h3 { margin-top: 10px; margin-bottom: 6px; }
  .cs-section .signature-block { margin-top: 28px; }
  [data-section="appendix_job_description"] { page-break-before: always; }
  [data-section="signatures"] { page-break-inside: avoid; }
  .cs-section-heading { margin-top: 20px; margin-bottom: 8px; }
  .ph-entity-company { background: #dbeafe; border-radius: 3px; padding: 0 3px; }
  .ph-entity-employee { background: #dcfce7; border-radius: 3px; padding: 0 3px; }
  .ph-entity-missing { opacity: 0.55; font-style: italic; }
`;

const THEME_STYLES: Record<DocumentTheme, (args: ThemeCssArgs) => string> = {
  // Implements the design from the provided Consultancy Agreement images
  consulting_standard: ({ primaryColor, accentColor, fontFamily, fontScale }) => `
    font-family: ${fontFamily};
    color: #000000;
    line-height: 1.5;
    font-size: ${11 * fontScale}pt;
    h1 { color: ${primaryColor}; font-weight: bold; font-size: ${14 * fontScale}pt; text-transform: uppercase; margin-bottom: 24px; text-align: center; }
    h2 { color: #000000; font-weight: bold; font-size: ${11.5 * fontScale}pt; margin-top: 24px; margin-bottom: 12px; }
    h3 { font-weight: bold; font-size: ${11 * fontScale}pt; margin-top: 16px; margin-bottom: 8px; }
    p { margin-bottom: 16px; text-align: left; }
    table { width: 100%; border-collapse: collapse; margin: 24px 0; border: 1px solid #000000; }
    th, td { border: 1px solid #000000; padding: 8px 12px; text-align: left; vertical-align: top; }
    th { font-weight: bold; font-size: 10pt; text-transform: uppercase; background-color: #f2f2f2; }
    .signature-block { margin-top: 48px; display: flex; flex-direction: column; gap: 32px; }
    .signature-column { flex: 1; margin-bottom: 24px; }
    .signature-line { border-bottom: 1px dashed #000000; height: 30px; margin-bottom: 8px; width: 60%; }
    .signature-label { font-size: 10pt; font-weight: normal; color: #000000; }
  `,
  modern_agency: ({ primaryColor, accentColor, fontFamily, fontScale }) => `
    font-family: ${fontFamily};
    color: #3f3f46;
    line-height: 1.7;
    font-size: ${10.5 * fontScale}pt;
    h1 { color: ${primaryColor}; font-weight: 800; font-size: ${20 * fontScale}pt; margin-bottom: 32px; }
    h2 { color: ${primaryColor}; font-weight: 700; font-size: ${13 * fontScale}pt; margin-top: 32px; margin-bottom: 12px; }
    h3 { color: ${accentColor}; font-weight: 600; font-size: ${11 * fontScale}pt; margin-top: 20px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
    p { margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin: 24px 0; border-radius: 8px; overflow: hidden; border: 1px solid #e4e4e7; }
    th, td { border-bottom: 1px solid #e4e4e7; padding: 12px 16px; text-align: left; }
    th { background-color: #fafafa; color: ${primaryColor}; font-weight: 600; font-size: 9.5pt; text-transform: uppercase; }
    tr:last-child td { border-bottom: none; }
    .signature-block { margin-top: 64px; display: flex; gap: 40px; }
    .signature-column { flex: 1; background: #fafafa; padding: 24px; border-radius: 8px; border: 1px solid #e4e4e7; }
    .signature-line { border-bottom: 1px solid #a1a1aa; height: 40px; margin-bottom: 12px; }
    .signature-label { font-size: 10pt; font-weight: 600; color: ${primaryColor}; }
  `,
  classic_legal: ({ primaryColor, fontFamily, fontScale }) => `
    font-family: ${fontFamily};
    color: #000000;
    line-height: 2.0; /* Double spaced */
    font-size: ${12 * fontScale}pt;
    text-align: justify;
    h1 { text-align: center; text-transform: uppercase; font-size: ${14 * fontScale}pt; font-weight: bold; margin: 40px 0; }
    h2 { text-transform: uppercase; font-size: ${12 * fontScale}pt; font-weight: bold; margin-top: 32px; margin-bottom: 16px; text-align: center; }
    h3 { font-size: ${12 * fontScale}pt; font-weight: bold; text-decoration: underline; margin-top: 24px; margin-bottom: 12px; }
    p { margin-bottom: 24px; text-indent: 48px; }
    p.no-indent { text-indent: 0; }
    table { width: 100%; border-collapse: collapse; margin: 24px 0; }
    th, td { border: 1px solid ${primaryColor}; padding: 10px 14px; vertical-align: top; }
    th { font-weight: bold; text-align: center; }
    .signature-block { margin-top: 80px; display: flex; gap: 40px; }
    .signature-column { flex: 1; }
    .signature-line { border-bottom: 1px solid ${primaryColor}; height: 40px; margin-bottom: 8px; }
    .signature-label { font-weight: bold; font-size: 11pt; }
  `,
};

const THEME_TOC_STYLES: Record<DocumentTheme, (args: ThemeCssArgs) => string> = {
  consulting_standard: ({ primaryColor }) => `
    .cs-toc { margin-bottom: 32px; padding-bottom: 16px; border-bottom: 2px solid ${primaryColor}; }
    .cs-toc-heading { font-size: 12pt; font-weight: bold; padding: 0 0 12px 0; margin: 0; color: #000000; }
    .cs-toc-list { list-style: none; margin: 0; padding: 0; }
    .cs-toc-item { margin: 0; }
    .cs-toc-link { display: flex; text-decoration: none; color: #000000; font-size: 11pt; padding: 4px 0; }
    .cs-toc-num { font-weight: normal; width: 24px; flex-shrink: 0; }
  `,
  modern_agency: ({ primaryColor, accentColor }) => `
    .cs-toc { margin-bottom: 40px; padding: 24px; background: #fafafa; border-radius: 8px; border: 1px solid #e4e4e7; }
    .cs-toc-heading { font-size: 10.5pt; font-weight: 700; color: ${primaryColor}; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 16px 0; }
    .cs-toc-list { list-style: none; margin: 0; padding: 0; }
    .cs-toc-item { margin: 0; border-bottom: 1px solid #f4f4f5; }
    .cs-toc-link { display: block; padding: 8px 0; text-decoration: none; color: #52525b; font-size: 10.5pt; }
    .cs-toc-num { font-weight: 600; color: ${accentColor}; margin-right: 8px; }
  `,
  classic_legal: () => `
    .cs-toc { margin-bottom: 40px; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 20px 0; }
    .cs-toc-heading { font-size: 12pt; font-weight: bold; text-align: center; text-transform: uppercase; margin: 0 0 20px 0; }
    .cs-toc-list { list-style: none; margin: 0; padding: 0 40px; }
    .cs-toc-item { margin: 0; text-align: left; }
    .cs-toc-link { display: block; padding: 4px 0; text-decoration: none; color: #000000; font-size: 12pt; }
    .cs-toc-num { font-weight: normal; margin-right: 12px; }
  `,
};

const THEME_HEADERS: Record<DocumentTheme, (args: ThemeCssArgs) => string> = {
  // Replicates the geometric graphic banner from the 2nd provided image
  consulting_standard: ({ primaryColor, accentColor }) => `
    <div style="margin-bottom: 40px; width: 100%;">
        <div style="display: flex; height: 45px; width: 100%;">
            <div style="background-color: ${accentColor}; width: 70%;"></div>
            <div style="background-color: ${primaryColor}; width: 30%; border-left: 20px solid #ffffff; /* Simulates the angle offset */"></div>
        </div>
        <div style="display: flex; height: 10px; width: 100%; margin-top: 4px;">
            <div style="flex: 1;"></div>
            <div style="background-color: ${primaryColor}; width: 30%; border-left: 20px solid #ffffff;"></div>
        </div>
    </div>`,
  modern_agency: ({ primaryColor, accentColor }) => `
    <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #e4e4e7; padding-bottom: 24px; margin-bottom: 48px;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 24px; height: 24px; background: ${accentColor}; border-radius: 4px;"></div>
        <div style="font-family: 'Inter', sans-serif; font-size: 20px; font-weight: 800; color: ${primaryColor};">{{company_name}}</div>
      </div>
      <div style="font-family: 'Inter', sans-serif; font-size: 12px; color: #71717a; text-transform: uppercase; letter-spacing: 0.1em;">Standard Agreement</div>
    </div>`,
  classic_legal: ({ primaryColor }) => `
    <div style="text-align: center; margin-bottom: 48px; font-family: 'Times New Roman', serif;">
      <h2 style="margin:0; font-size: 22px; text-transform: uppercase; font-weight: bold; color: ${primaryColor};">Legal Instrument</h2>
      <div style="width: 60%; height: 1px; background: ${primaryColor}; margin: 16px auto;"></div>
      <div style="font-size: 12px; color: #333; text-transform: uppercase; letter-spacing: 0.1em;">{{company_name}}</div>
    </div>`,
};

function flattenNestedCss(rootSelector: string, css: string): string {
  const blockPattern = /([^{}]+)\{([^{}]*)\}/g;
  const rules: string[] = [];
  let baseDecls = '';
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(css)) !== null) {
    const preText = match[1];
    const body = match[2].trim();

    const lastSemi = preText.lastIndexOf(';');
    const selectorPart = (lastSemi === -1 ? preText : preText.slice(lastSemi + 1)).trim();
    baseDecls += lastSemi === -1 ? '' : preText.slice(0, lastSemi + 1);

    if (!selectorPart || !body) continue;

    const fullSelector = selectorPart
      .split(',')
      .map((s) => `${rootSelector} ${s.trim()}`)
      .join(', ');
    rules.push(`${fullSelector} { ${body} }`);
  }

  return [`${rootSelector} { ${baseDecls.trim()} }`, ...rules].join('\n');
}

function addMsoPaddingAlt(css: string): string {
  return css.replace(/padding:\s*([^;]+);/g, (full, rawValue: string) => {
    const tokens = rawValue.trim().split(/\s+/);
    if (tokens.length < 1 || tokens.length > 4) return full;
    const toPt = (v: string): string | null => {
      if (v === '0') return '0pt';
      const m = /^(-?\d*\.?\d+)px$/.exec(v);
      return m ? `${(parseFloat(m[1]) * 0.75).toFixed(1)}pt` : null;
    };
    const pts = tokens.map(toPt);
    if (pts.some((p) => p === null)) return full; 
    const [a, b, c, d] = pts as string[];
    const top = a, right = b ?? a, bottom = c ?? a, left = d ?? b ?? a;
    return `${full} mso-padding-alt: ${top} ${right} ${bottom} ${left};`;
  });
}

function makeWordSafe(css: string, rootSelector: string, fontFamily: string): string {
  const wordSafeFont = toWordSafeFontStack(fontFamily);
  const withHeadingFix = css
    .replace(/(\.signature-block\s*\{[^}]*?)display:\s*flex;?/g, '$1display: table; width: 100%;')
    .replace(/(\.signature-column\s*\{[^}]*?)flex:\s*1;?/g, '$1display: table-cell; width: 50%; vertical-align: top;')
    .replace(/\bh([1-3])\b/g, '.mso-h$1');

  const withPadding = addMsoPaddingAlt(withHeadingFix);

  const fontOverride = `${rootSelector} .mso-h1, ${rootSelector} .mso-h2, ${rootSelector} .mso-h3, ${rootSelector} p, ${rootSelector} li, ${rootSelector} td, ${rootSelector} th, ${rootSelector} div, ${rootSelector} span, ${rootSelector} a { font-family: ${wordSafeFont}; }`;

  const tableFix = `${rootSelector} table { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }`;

  return `${withPadding}\n${fontOverride}\n${tableFix}`;
}

export function applyThemeToHtml(content: string, settings: ContractThemeSettings, options?: { wordSafe?: boolean }): string {
  // settings.theme || 'consulting_standard' only guards falsy values - a
  // theme key saved before this engine's DocumentTheme union changed (e.g.
  // stale cc_templates.theme_settings from an earlier iteration) is truthy
  // but absent from THEME_DEFAULTS, which crashed the primaryColor/
  // accentColor/fontFamily lookups below.
  const theme = settings.theme && THEME_DEFAULTS[settings.theme] ? settings.theme : 'consulting_standard';
  const args: ThemeCssArgs = {
    primaryColor: settings.primaryColor || THEME_DEFAULTS[theme].primaryColor,
    accentColor: settings.accentColor || THEME_DEFAULTS[theme].accentColor,
    fontFamily: settings.fontFamily || THEME_DEFAULTS[theme].fontFamily,
    fontScale: settings.fontScale || 1,
  };

  let finalContent = content;

  if (settings.brandingStrategy === 'theme_header') {
    const header = THEME_HEADERS[theme]?.(args) || '';
    finalContent = `${header}\n<div class="document-body">${finalContent}</div>`;
  } else if (settings.brandingStrategy === 'company_letterhead') {
    const companyHeader = `<div style="font-family: sans-serif; padding-bottom: 12px; margin-bottom: 20px; border-bottom: 2px solid ${args.primaryColor}; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px;">
        <div style="font-size: 17px; font-weight: 800; color: ${args.primaryColor};">${settings.theme === 'classic_legal' ? '{{company_name}}'.toUpperCase() : '{{company_name}}'}</div>
        <div style="text-align: right; font-size: 10px; color: #555; line-height: 1.5;">{{company_address}}<br/>{{company_email}}</div>
    </div>`;
    finalContent = `${companyHeader}\n<div class="document-body">${finalContent}</div>`;
  }

  const rawCss = (THEME_STYLES[theme]?.(args) || THEME_STYLES.consulting_standard(args))
    + (THEME_TOC_STYLES[theme]?.(args) || THEME_TOC_STYLES.consulting_standard(args))
    + BASE_SECTION_STYLES;
    
  const rootSelector = `.contract-theme-${theme}`;
  let flatCss = flattenNestedCss(rootSelector, rawCss);
  if (options?.wordSafe) flatCss = makeWordSafe(flatCss, rootSelector, args.fontFamily);

  return `
    <div class="contract-theme-${theme}" style="padding: 48px; max-width: 850px; margin: 0 auto; background: white; box-sizing: border-box;">
      <style>
        ${flatCss}
      </style>
      ${finalContent}
    </div>
  `;
}