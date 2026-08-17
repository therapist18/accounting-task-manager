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

// Pulls one flattened, scoped declaration block out of a word-safe stylesheet
// (the output of makeCssWordSafe above) so its declarations can be copied
// onto a matching element verbatim - Word's HTML import filter is unreliable
// about applying class-scoped <style> rules to certain elements (headings,
// <nav>), so applyWordSafeDomFixes below re-expresses those rules as inline
// styles instead. The leading `\s*` tolerates the indentation the stylesheet
// is rendered with.
function extractCssRule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'));
  return match ? match[1].trim() : '';
}

export interface WordSafeDomFixOptions {
  // The word-safe stylesheet's own content (the <style> block's text, before
  // it's pulled out into <head> by the caller) - source for the declarations
  // extractCssRule pulls out and inlines.
  themeCss: string;
  // The theme's scoping selector, e.g. `.contract-theme-corporate` - matches
  // applyThemeToHtml's own wrapper class.
  rootSelector: string;
  fontFamily: string;
  // Which elements are ToC jump targets and need a Word-recognized <a name>
  // bookmark inserted at their start - Employment Contracts wraps every
  // section in `<section id="...">` (bookmarkSelector: 'section[id]');
  // Consultancy Contracts has no section wrapper, just `id="section-N"` on
  // the heading itself (bookmarkSelector: '[id^="section-"]').
  bookmarkSelector: string;
}

// Turns a parsed export-body document into the specific markup Word's HTML
// import filter actually honors, shared by Employment Contracts' and
// Consultancy Contracts' own ContractPreview.tsx (previously two independent,
// drifting copies of this same logic - see the commit that introduced this
// function). Mutates `doc` in place; callers re-serialize afterwards
// (doc.body.firstElementChild?.innerHTML).
//
//  1. Bookmarks every ToC target with <a name="..."> - Word doesn't treat a
//     plain id="..." as a jump target, only a genuine bookmark, which is
//     exactly what Word itself emits for one via "Save as Web Page".
//  2. Converts <h1>-<h3> into <div class="mso-hN"> - Word forces its own
//     built-in Heading N paragraph style onto real heading tags no matter
//     what CSS says. The theme font is set as a plain string append (not via
//     the `.style.fontFamily =` CSSOM setter, which forces a re-parse/
//     re-serialize of whatever style attribute was just copied from the
//     original heading, rewriting hex colors to rgb(...) that Word's
//     importer can't reliably read and sometimes dropping the attribute
//     entirely - the same fix CV Generator's own Word export needed).
//  3. Strips Word's own default table cell margins via the legacy
//     cellpadding/cellspacing/width HTML attributes, which Word's table
//     rendering honors unconditionally where CSS `padding`/`width` alone is
//     unreliable.
//  4. Swaps `<nav class="cs-toc">` for a `<div>` - Word's HTML filter doesn't
//     recognize <nav> at all and silently unwraps it, stranding the ToC's
//     border/background/padding CSS on a tag Word never renders as a block.
//  5. Re-expresses every .cs-toc* rule as an inline style on the matching
//     element, since Word is unreliable about applying the <style> block's
//     own border/background/padding to them.
//  6. Re-applies .cs-toc-link's text styling inline (Word forces its own blue
//     +underline Hyperlink style onto every <a> and can't resolve
//     `color: inherit`, which every theme's .cs-toc-link relies on, so the
//     theme's actual body color is substituted in). The link's own padding
//     moves onto its parent .cs-toc-item (a block Word treats as a
//     paragraph) rather than staying on the inline <a>, where the importer
//     would drop it.
//  7. Inlines each heading's composed spacing rules - its own .mso-hN rule,
//     then .cs-section-heading, then the .cs-section-scoped .mso-hN rule, in
//     that cascade order - since Word ignored their plain CSS padding/margin
//     entirely when left in the <style> block, rendering every heading
//     compressed regardless of the theme's own spacing design.
//  8. Strips the theme wrapper's inline padding/max-width/margin (from
//     applyThemeToHtml's on-screen/PDF wrapper) - the CSS override meant to
//     zero those for Word ([class^="contract-theme-"] ...) is an attribute
//     selector Word can't parse, so without this it stacks the wrapper's own
//     gutter on top of @page's own margin.
export function applyWordSafeDomFixes(doc: Document, options: WordSafeDomFixOptions): void {
  const { themeCss, rootSelector, fontFamily, bookmarkSelector } = options;
  const wordSafeFont = toWordSafeFontStack(fontFamily);

  doc.querySelectorAll(bookmarkSelector).forEach((el) => {
    const id = el.getAttribute('id');
    if (!id) return;
    const bookmark = doc.createElement('a');
    bookmark.setAttribute('name', id);
    el.insertBefore(bookmark, el.firstChild);
  });

  doc.querySelectorAll('h1, h2, h3').forEach((h) => {
    const div = doc.createElement('div');
    for (const attr of Array.from(h.attributes)) div.setAttribute(attr.name, attr.value);
    div.className = `mso-${h.tagName.toLowerCase()} ${div.className || ''}`.trim();
    const existingStyle = div.getAttribute('style');
    div.setAttribute('style', `${existingStyle ? `${existingStyle};` : ''}font-family: ${wordSafeFont};`);
    while (h.firstChild) div.appendChild(h.firstChild);
    h.replaceWith(div);
  });

  doc.querySelectorAll('table').forEach((table) => {
    table.setAttribute('cellpadding', '0');
    table.setAttribute('cellspacing', '0');
    table.setAttribute('width', '100%');
  });

  doc.querySelectorAll('nav.cs-toc').forEach((nav) => {
    const div = doc.createElement('div');
    for (const attr of Array.from(nav.attributes)) div.setAttribute(attr.name, attr.value);
    while (nav.firstChild) div.appendChild(nav.firstChild);
    nav.replaceWith(div);
  });

  const rootDecls = extractCssRule(themeCss, rootSelector);
  const tocClasses = ['cs-toc', 'cs-toc-heading', 'cs-toc-list', 'cs-toc-item', 'cs-toc-num'];
  for (const cls of tocClasses) {
    const decls = extractCssRule(themeCss, `${rootSelector} .${cls}`);
    if (!decls) continue;
    doc.querySelectorAll(`.${cls}`).forEach((el) => {
      const prev = el.getAttribute('style') ? `${el.getAttribute('style')};` : '';
      el.setAttribute('style', `${prev}${decls}`);
    });
  }

  const linkDecls = extractCssRule(themeCss, `${rootSelector} .cs-toc-link`);
  const linkTextDecls = (linkDecls || '')
    .split(';')
    .map((d) => d.trim())
    .filter((d) => /^(color|text-decoration|font-size|font-weight|font-style|letter-spacing|text-transform)\s*:/.test(d))
    .join('; ');
  const baseColor = rootDecls.match(/color:\s*([^;]+)/)?.[1]?.trim();
  if (linkTextDecls) {
    const finalDecls = baseColor ? linkTextDecls.replace(/color:\s*inherit/g, `color: ${baseColor}`) : linkTextDecls;
    doc.querySelectorAll('.cs-toc-link').forEach((el) => {
      const prev = el.getAttribute('style') ? `${el.getAttribute('style')};` : '';
      el.setAttribute('style', `${prev}${finalDecls}`);
    });
  }
  const linkPadding = linkDecls ? linkDecls.match(/padding:[^;]+;\s*mso-padding-alt:[^;]+;?/)?.[0] ?? '' : '';
  if (linkPadding) {
    doc.querySelectorAll('.cs-toc-item').forEach((item) => {
      const style = item.getAttribute('style') || '';
      if (/\bpadding\b/.test(style)) return;
      item.setAttribute('style', `${style}${style.endsWith(';') ? '' : ';'} ${linkPadding}`.trim());
    });
  }

  doc.querySelectorAll('.mso-h1, .mso-h2, .mso-h3').forEach((h) => {
    const tag = h.classList.contains('mso-h1') ? 'h1' : h.classList.contains('mso-h2') ? 'h2' : 'h3';
    const themeDecls = extractCssRule(themeCss, `${rootSelector} .mso-${tag}`);
    if (!themeDecls) return;
    const headingDecls = h.classList.contains('cs-section-heading')
      ? extractCssRule(themeCss, `${rootSelector} .cs-section-heading`)
      : '';
    const sectionDecls = h.closest('.cs-section')
      ? extractCssRule(themeCss, `${rootSelector} .cs-section .mso-${tag}`)
      : '';
    const prev = h.getAttribute('style') ? `${h.getAttribute('style')};` : '';
    h.setAttribute('style', `${prev}${themeDecls}${headingDecls ? `; ${headingDecls}` : ''}${sectionDecls ? `; ${sectionDecls}` : ''}`);
  });

  doc.querySelectorAll('[class^="contract-theme-"]').forEach((el) => {
    const styleEl = el as HTMLElement;
    styleEl.style.padding = '';
    styleEl.style.maxWidth = '';
    styleEl.style.margin = '';
  });
}
