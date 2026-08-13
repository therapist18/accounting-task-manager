// Two fixed print themes for the Consultancy Agreement - deliberately not
// EC's 8-theme/branding-strategy engine (utils/themeEngine.ts there), since
// this module has one standard document, not a per-company clause-driven
// layout. Persisted on cc_templates.theme_settings so the choice is
// platform-wide, matching "one standard format" - not a per-company setting.
export type CcThemeName = 'classic' | 'modern';
export const DEFAULT_CC_THEME: CcThemeName = 'classic';

export const CC_THEMES: { value: CcThemeName; label: string }[] = [
  { value: 'classic', label: 'Classic' },
  { value: 'modern', label: 'Modern' },
];

const BASE_CSS = `
  .cc-doc table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  .cc-doc table td, .cc-doc table th { padding: 6px 8px; font-size: 11px; }
  .cc-doc ul, .cc-doc ol { margin: 0 0 0.8em; padding-left: 1.4em; }
  .cc-toc { margin: 1.5em 0 2em; padding: 1em 1.4em; border: 1px solid #e2e8f0; border-radius: 4px; page-break-inside: avoid; }
  .cc-toc-heading { font-weight: 700; margin-bottom: 0.6em; }
  .cc-toc-list { list-style: none; margin: 0; padding: 0; }
  .cc-toc-item { margin: 0.3em 0; }
  .cc-toc-link { text-decoration: none; }
  @media print { @page { size: 8.5in 11.7in; margin: 0.5in; } }
`;

const THEME_CSS: Record<CcThemeName, string> = {
  classic: `
    .cc-doc { font-family: 'Times New Roman', Georgia, serif; font-size: 12px; line-height: 1.6; color: #1a1a1a; }
    .cc-doc h1, .cc-doc h2, .cc-doc h3 { font-weight: 700; margin: 1.2em 0 0.5em; }
    .cc-doc h1 { font-size: 18px; text-align: center; }
    .cc-doc h2 { font-size: 14px; border-bottom: 1px solid #ccc; padding-bottom: 2px; }
    .cc-doc p { margin: 0 0 0.8em; text-align: justify; }
    .cc-doc table td, .cc-doc table th { border: 1px solid #999; }
    .cc-doc table th { background: #f3f4f6; font-weight: 700; }
    .cc-toc-link { color: #1a1a1a; }
    .cc-toc-link:hover { text-decoration: underline; }
  `,
  modern: `
    .cc-doc { font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.7; color: #1e293b; }
    .cc-doc h1, .cc-doc h2, .cc-doc h3 { font-weight: 700; margin: 1.4em 0 0.6em; color: #0f172a; }
    .cc-doc h1 { font-size: 20px; text-align: left; letter-spacing: -0.01em; }
    .cc-doc h2 { font-size: 14px; color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 4px; display: inline-block; }
    .cc-doc p { margin: 0 0 0.9em; text-align: left; }
    .cc-doc table td, .cc-doc table th { border: 1px solid #cbd5e1; }
    .cc-doc table th { background: #eff6ff; color: #1e40af; font-weight: 700; }
    .cc-toc { border-color: #bfdbfe; background: #f8fafc; }
    .cc-toc-link { color: #2563eb; font-weight: 500; }
    .cc-toc-link:hover { text-decoration: underline; }
  `,
};

export function getThemeCss(theme: CcThemeName): string {
  return BASE_CSS + (THEME_CSS[theme] || THEME_CSS[DEFAULT_CC_THEME]);
}
