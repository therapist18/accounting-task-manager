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
  return fontFamily
    .replace(/['"]?\bInter\b['"]?/gi, "'Arial'")
    .replace(/['"]?\bOutfit\b['"]?/gi, "'Arial'")
    .replace(/['"]?\bRoboto\b['"]?/gi, "'Arial'")
    .replace(/['"]?\bPoppins\b['"]?/gi, "'Arial'")
    .replace(/['"]?\bLato\b['"]?/gi, "'Arial'")
    .replace(/['"]?\bMerriweather\b['"]?/gi, "'Georgia'")
    .replace(/['"]?\bEB Garamond\b['"]?/gi, "'Georgia'");
}
