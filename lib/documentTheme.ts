// Shared document-theme constants and helpers used by both the CV Generator
// and Employment Contracts modules so the two apply themes and export Word/PDF
// output the same way — one system, not two foreign-looking ones.

// Color presets offered by both modules' theme/design panels (identical set in
// employment-contracts/utils/themeEngine.ts and the CV design panel).
export const COLOR_PRESETS: { name: string; primary: string; accent: string }[] = [
  { name: 'Ocean Blue', primary: '#2c3e50', accent: '#3498db' },
  { name: 'Forest', primary: '#1a3d2e', accent: '#27ae60' },
  { name: 'Royal Purple', primary: '#2c1654', accent: '#9b59b6' },
  { name: 'Crimson', primary: '#4a1515', accent: '#e74c3c' },
  { name: 'Slate', primary: '#2d3748', accent: '#64748b' },
  { name: 'Teal', primary: '#164e4e', accent: '#0d9488' },
  { name: 'Midnight', primary: '#0f172a', accent: '#6366f1' },
  { name: 'Copper', primary: '#3d1f10', accent: '#d97706' },
];

// Localized, stable "CV Verified & Up-to-date" badge date shared by the CV
// themes' declaration block.
export function getVerifiedDateLabel(): string {
  return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// Word's HTML import filter can't pull webfonts down the way a browser can — a
// family that isn't installed on the machine opening the file silently falls
// back to Word's default (typically Arial), which reads as "the theme font got
// reset". Both modules' font pickers offer web-only faces (Inter, Outfit,
// Merriweather, EB Garamond, Roboto, Poppins, Lato), so remap those to their
// closest installed-system equivalent for Word output; fonts that ship with
// Windows/Office (Georgia, Times New Roman, Arial, Calibri, ...) pass through
// untouched.
export function toWordSafeFontStack(fontFamily: string): string {
  // Word's HTML import often fails to parse CSS comma-separated font stacks
  // (e.g., 'Calibri', sans-serif) and falls back to Times New Roman.
  // We need to return a single, unquoted font name (e.g., Calibri).
  const primary = fontFamily.split(',')[0].replace(/['"]/g, '').trim();
  
  if (/^(Inter|Outfit|Roboto|Poppins|Lato|Arial)$/i.test(primary)) {
    return 'Calibri';
  }
  if (/^(Merriweather|EB Garamond)$/i.test(primary)) {
    return 'Georgia';
  }
  
  return primary || 'Calibri';
}

// Word's HTML filter only reads block-element spacing through its own mso-*
// directives - plain CSS `padding`/`margin` on a block element is ignored.
// Restate every px padding/margin as the matching mso directive in points (0.75pt
// per px).
export function addMsoSpatialAlt(css: string): string {
  const toPt = (v: string): string | null => {
    if (v === '0') return '0pt';
    const m = /^(-?\d*\.?\d+)px$/.exec(v);
    return m ? `${(parseFloat(m[1]) * 0.75).toFixed(1)}pt` : null;
  };

  let out = css.replace(/padding:\s*([^;]+);/g, (full, rawValue: string) => {
    const tokens = rawValue.trim().split(/\s+/);
    if (tokens.length < 1 || tokens.length > 4) return full;
    const pts = tokens.map(toPt);
    if (pts.some((p) => p === null)) return full;
    const [a, b, c, d] = pts as string[];
    const top = a, right = b ?? a, bottom = c ?? a, left = d ?? b ?? a;
    return `${full} mso-padding-alt: ${top} ${right} ${bottom} ${left};`;
  });

  out = out.replace(
    /(margin|padding)-(top|right|bottom|left):\s*(-?\d*\.?\d+)px\s*;/g,
    (_full, prop: string, side: string, px: string) => {
      const pt = (parseFloat(px) * 0.75).toFixed(1);
      return `${_full} mso-${prop}-${side}-alt: ${pt}pt;`;
    }
  );

  return out;
}

// Applies all word-safe transformations (font override, table fixes, headings).
// Designed to be reusable by Employment Contracts, Consultancy Contracts, and CVs.
export function makeCssWordSafe(css: string, rootSelector: string, fontFamily: string): string {
  const wordSafeFont = toWordSafeFontStack(fontFamily);
  const withHeadingFix = css
    .replace(/(\.signature-block\s*\{[^}]*?)display:\s*flex;?/g, '$1display: table; width: 100%;')
    .replace(/(\.signature-column\s*\{[^}]*?)flex:\s*1;?/g, '$1display: table-cell; width: 50%; vertical-align: top;')
    .replace(/\bh([1-6])\b/g, '.mso-h$1');

  const withPadding = addMsoSpatialAlt(withHeadingFix);

  const fontOverride = `${rootSelector} .mso-h1, ${rootSelector} .mso-h2, ${rootSelector} .mso-h3, ${rootSelector} .mso-h4, ${rootSelector} .mso-h5, ${rootSelector} .mso-h6, ${rootSelector} p, ${rootSelector} li, ${rootSelector} td, ${rootSelector} th, ${rootSelector} div, ${rootSelector} span, ${rootSelector} a { font-family: ${wordSafeFont}; }`;

  const tableFix = `${rootSelector} table { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }\n${rootSelector} table td, ${rootSelector} table th { padding-top: 2pt; padding-bottom: 2pt; margin: 0; mso-line-height-rule: exactly; line-height: 1.2; }\n${rootSelector} table p { margin: 0; mso-line-height-rule: exactly; line-height: 1.2; }`;

  return `${withPadding}\n${fontOverride}\n${tableFix}`;
}
