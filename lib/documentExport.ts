// Shared client-side document-export helpers used by the CV Generator and
// Employment Contracts modules (and available to any other document module):
//   - downloadBlob:             one saveAs wrapper
//   - buildWordDocBlob /        .doc download (real Microsoft Office HTML with
//     downloadHtmlAsWord          mso namespaces, so Word honors @page + mso-* CSS)
//   - printElementAsPdf:        browser print pipeline ("Save as PDF") with
//                               font/image waiting, filename via document.title,
//                               optional detach-to-body, and reliable cleanup
//   - serializeElementToInlineHtml: turns a live preview element into a
//                               self-contained HTML string for the .doc above

import { saveAs } from "file-saver";

export function downloadBlob(blob: Blob, fileName: string): void {
  saveAs(blob, fileName);
}

// Strip characters Word/saveAs won't like and collapse whitespace into
// underscores for a tidy default file name.
function toFileNameBase(name: string): string {
  return (name || "document").replace(/[^\w\-\s]/g, "").replace(/\s+/g, "_").trim() || "document";
}

// ---------------------------------------------------------------------------
// Word (.doc) export
// ---------------------------------------------------------------------------

export interface WordDocOptions {
  html: string;
  title: string;
  css?: string;
  pageSize?: string;
  pageMargin?: string;
}

// Builds a Word-HTML .doc blob: MSO namespaces + <!--[if gte mso 9]> block so
// Word's HTML import filter treats it as genuine Office markup (honoring
// mso-* CSS and the named @page region), a UTF-8 BOM so Word detects the
// encoding, and a leading <style> in <head> (Word only reliably reads styles
// that live as direct children of <head>). The @page section name only needs
// to be unique within this one document, so a counter is unnecessary - a fixed
// name keeps it stable for any caller CSS that references it.
const WORD_SECTION = "WordSection1";

export function buildWordDocBlob(opts: WordDocOptions): Blob {
  const { html, title, css = "", pageSize = "8.5in 11.7in", pageMargin = "0.5in" } = opts;
  const htmlDoc = `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${title}</title>
<!--[if gte mso 9]>
<xml>
  <w:WordDocument>
    <w:View>Print</w:View>
    <w:DoNotOptimizeForBrowser/>
  </w:WordDocument>
</xml>
<![endif]-->
<style>
  html, body { margin: 0; padding: 0; }
${css}
  @page ${WORD_SECTION} { size: ${pageSize}; margin: ${pageMargin}; mso-header-margin: 0in; mso-footer-margin: 0in; mso-page-orientation: portrait; }
  div.${WORD_SECTION} { page: ${WORD_SECTION}; }
</style>
</head>
<body>
<div class="${WORD_SECTION}">${html}</div>
</body>
</html>`;
  const bomChar = String.fromCharCode(0xfeff);
  return new Blob([bomChar, htmlDoc], { type: "application/msword" });
}

export function downloadHtmlAsWord(opts: WordDocOptions & { fileName?: string }): void {
  const { fileName, ...rest } = opts;
  downloadBlob(buildWordDocBlob(rest), fileName || `${toFileNameBase(rest.title)}.doc`);
}

// ---------------------------------------------------------------------------
// PDF export via the browser's native print pipeline
// ---------------------------------------------------------------------------

export interface PrintElementAsPdfOptions {
  element: HTMLElement | null;
  // Chrome suggests document.title as the "Save as PDF" file name.
  fileName?: string;
  // Optional class on <body> during print (e.g. "pdf-mode" whose CSS in
  // globals.css hides body siblings and lays the element out normally).
  bodyClassName?: string;
  // Move the element to a direct child of <body> for print, then restore it.
  // Needed when the element is nested inside overflow-hidden/h-screen
  // ancestors (app shell) that clip multi-page content to its first page.
  detach?: boolean;
  onBeforePrint?: () => void | Promise<void>;
  onCleanup?: () => void;
  fallbackTimeoutMs?: number;
}

// Waits for the theme font and any in-DOM images so the printed PDF matches
// the on-screen preview (no fallback font / broken image), calls
// window.print(), then reliably restores the DOM and document.title. Some
// browsers don't fire afterprint for programmatic print(), so a fallback
// timer guarantees cleanup instead of leaving a spinner stuck.
export async function printElementAsPdf(opts: PrintElementAsPdfOptions): Promise<void> {
  const element = opts.element;
  if (!element) throw new Error("No element available to print.");

  const originalTitle = document.title;
  const originalParent = element.parentElement;
  const originalNextSibling = element.nextSibling;

  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

  const cleanup = () => {
    if (opts.bodyClassName) document.body.classList.remove(opts.bodyClassName);
    if (opts.detach && originalParent) originalParent.insertBefore(element, originalNextSibling);
    document.title = originalTitle;
    window.removeEventListener("afterprint", cleanup);
    if (fallbackTimer) clearTimeout(fallbackTimer);
    opts.onCleanup?.();
  };

  try {
    if (typeof document !== "undefined" && (document as any).fonts?.ready) {
      try { await (document as any).fonts.ready; } catch { /* ignore */ }
    }
    await Promise.all(
      Array.from(element.querySelectorAll("img")).map((img) =>
        (img as HTMLImageElement).complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              (img as HTMLImageElement).addEventListener("load", () => resolve(), { once: true });
              (img as HTMLImageElement).addEventListener("error", () => resolve(), { once: true });
            })
      )
    );

    if (opts.fileName) document.title = opts.fileName;
    await opts.onBeforePrint?.();

    if (opts.detach) document.body.appendChild(element);
    if (opts.bodyClassName) document.body.classList.add(opts.bodyClassName);

    window.addEventListener("afterprint", cleanup, { once: true });
    fallbackTimer = setTimeout(cleanup, opts.fallbackTimeoutMs ?? 3 * 60 * 1000);

    // Give the browser a frame to apply layout/style changes before printing.
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 50)));

    window.print();
  } catch (error: any) {
    cleanup();
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Live-preview → self-contained HTML (for the .doc export)
// ---------------------------------------------------------------------------

// Curated computed-style subset that maps cleanly into Word's HTML import.
// Deliberately skips transforms, animations, flex/grid layout and other
// features Word ignores — anything it doesn't understand falls back to normal
// block flow instead of being dropped.
const INLINE_STYLE_PROPS = [
  "display", "position", "float", "clear", "boxSizing",
  "width", "height", "minWidth", "minHeight", "maxWidth", "maxHeight",
  "margin", "marginTop", "marginRight", "marginBottom", "marginLeft",
  "padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "borderTop", "borderRight", "borderBottom", "borderLeft",
  "borderTopWidth", "borderTopStyle", "borderTopColor",
  "borderRightWidth", "borderRightStyle", "borderRightColor",
  "borderBottomWidth", "borderBottomStyle", "borderBottomColor",
  "borderLeftWidth", "borderLeftStyle", "borderLeftColor",
  "borderRadius",
  "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight",
  "letterSpacing", "textTransform", "textDecoration",
  "color", "backgroundColor",
  "textAlign", "verticalAlign",
  "whiteSpace", "listStyleType", "wordBreak",
  "opacity",
] as const;

async function imageUrlToDataUrl(url: string): Promise<string | null> {
  try {
    if (url.startsWith("data:")) return url;
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
export { imageUrlToDataUrl };

// Clones a rendered element and rewrites it into a standalone HTML fragment
// suitable for buildWordDocBlob: computed styles inlined (Word can't resolve
// the app's bundled Tailwind classes), inline SVG icons stripped (Word doesn't
// render them), and images embedded as data URLs so they survive outside the
// app's origin. The fixed 210mm width is preserved (it matches an A4 Word
// page); only the min-height is dropped so Word controls page breaks.
export async function serializeElementToInlineHtml(
  element: HTMLElement,
  opts?: { removeSvg?: boolean; dropContainerMinHeight?: boolean }
): Promise<string> {
  const removeSvg = opts?.removeSvg !== false;
  const dropContainerMinHeight = opts?.dropContainerMinHeight !== false;

  const clone = element.cloneNode(true) as HTMLElement;

  if (dropContainerMinHeight) {
    clone.style.minHeight = "";
  }

  if (removeSvg) {
    clone.querySelectorAll("svg").forEach((svg) => svg.remove());
  }
  clone.querySelectorAll("script, style, link").forEach((el) => el.remove());

  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT);
  const nodes: HTMLElement[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as HTMLElement);

  for (const el of nodes) {
    const cs = window.getComputedStyle(el);
    const parts: string[] = [];
    for (const prop of INLINE_STYLE_PROPS) {
      const value = (cs as any)[prop];
      if (value && value !== "none" && value !== "auto") parts.push(`${camelToKebab(prop)}:${value}`);
    }
    el.setAttribute("style", parts.join(";"));
  }

  const images = Array.from(clone.querySelectorAll("img"));
  await Promise.all(
    images.map(async (img) => {
      const src = img.getAttribute("src");
      if (!src) return;
      const dataUrl = await imageUrlToDataUrl(src);
      if (dataUrl) img.setAttribute("src", dataUrl);
    })
  );

  return clone.outerHTML;
}

function camelToKebab(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}
