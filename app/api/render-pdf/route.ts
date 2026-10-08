import { NextRequest, NextResponse } from 'next/server';
import type { Browser } from 'playwright-core';

// Renders a self-contained HTML document (see renderPdfBlob / downloadPdf in
// lib/documentExport.ts - the client helpers every module uses) to PDF with headless Chromium - the same engine as
// Chrome's "Save as PDF", so the output matches the manual print exactly
// (vector text, @page size/margins, page-break rules) instead of the
// re-layout a .doc gets in Word/LibreOffice.
//
// On Vercel the full Playwright download is far too large for a function, so
// it runs playwright-core against @sparticuz/chromium's slimmed build
// (versions pinned together in package.json: playwright-core 1.57 drives
// Chromium 143). Locally it uses Playwright's own Chromium
// (`npm run setup-local`) or, failing that, the installed Chrome.
//
// Protected by middleware.ts like every other non-public /api route.

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_HTML_BYTES = 4 * 1024 * 1024; // Vercel caps request bodies at 4.5MB anyway

// The serverless Chromium ships without Microsoft fonts, so each one the
// themes use (themeEngine.ts THEME_DEFAULTS / FONT_OPTIONS) gets a
// metric-compatible open font slotted in right after it in every font stack.
// Same glyph widths means the same line breaks and pagination as a print from
// a Windows/Mac Chrome that has the original fonts.
const FONT_SUBSTITUTES: Record<string, string> = {
  'georgia': 'Gelasio',
  'times new roman': 'Tinos',
  'times': 'Tinos',
  'garamond': 'EB Garamond',
  'arial': 'Arimo',
  'helvetica': 'Arimo',
  'calibri': 'Carlito',
  'segoe ui': 'Arimo',
  'system-ui': 'Inter',
  '-apple-system': 'Inter',
};

const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?' +
  [
    'Arimo:ital,wght@0,400;0,700;1,400;1,700',
    'Carlito:ital,wght@0,400;0,700;1,400;1,700',
    'EB+Garamond:ital,wght@0,400;0,700;1,400;1,700',
    'Gelasio:ital,wght@0,400;0,700;1,400;1,700',
    'Inter:ital,wght@0,400;0,600;0,700;1,400',
    'Merriweather:ital,wght@0,400;0,700;1,400;1,700',
    'Outfit:wght@400;600;700',
    'Tinos:ital,wght@0,400;0,700;1,400;1,700',
  ].map((f) => `family=${f}`).join('&') +
  '&display=block';

function withSubstituteFonts(stack: string): string {
  const important = /!important\s*$/i.test(stack);
  const entries = stack.replace(/!important\s*$/i, '').split(',').map((s) => s.trim()).filter(Boolean);
  const names = new Set(entries.map((e) => e.replace(/^['"]|['"]$/g, '').toLowerCase()));
  const out: string[] = [];
  for (const entry of entries) {
    out.push(entry);
    const sub = FONT_SUBSTITUTES[entry.replace(/^['"]|['"]$/g, '').toLowerCase()];
    if (sub && !names.has(sub.toLowerCase())) {
      out.push(`'${sub}'`);
      names.add(sub.toLowerCase());
    }
  }
  return out.join(', ') + (important ? ' !important' : '');
}

// Only touches font-family declarations inside <style> blocks and style=""
// attributes - never document text (an address in "Georgia" stays as is).
function applyFontSubstitutes(html: string): string {
  const rewriteDecls = (css: string) =>
    css.replace(/font-family\s*:\s*([^;}]+)/gi, (_m, stack: string) => `font-family: ${withSubstituteFonts(stack)}`);
  return html
    .replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open, css, close) => open + rewriteDecls(css) + close)
    .replace(/style="([^"]*)"/gi, (_m, css: string) => `style="${rewriteDecls(css)}"`);
}

// The HTML comes from our own editors, but it is still rendered by a real
// browser on our server. So: inline data always; passive assets a document
// legitimately needs (images, fonts, stylesheets - e.g. a biodata's texture
// background or photos) from public https hosts only; never scripts, XHR/
// fetch, frames or navigations, and never private/internal addresses.
// Same-origin app images are already inlined as data URLs by the client
// (inlineLocalImages in lib/documentExport.ts).
const PASSIVE_RESOURCE_TYPES = new Set(['image', 'font', 'stylesheet', 'media']);

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true; // any IPv4 literal
  if (h.includes(':')) return true; // any IPv6 literal
  return false;
}

function isAllowedRequest(url: string, resourceType: string): boolean {
  if (url.startsWith('data:') || url.startsWith('blob:') || url === 'about:blank') return true;
  if (!PASSIVE_RESOURCE_TYPES.has(resourceType)) return false;
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' && !isPrivateHost(hostname);
  } catch {
    return false;
  }
}

async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import('playwright-core');
  // Linux check too: `vercel dev` sets VERCEL=1 on a Windows/Mac machine,
  // where the Lambda-built binary can't run - those use local Chrome below.
  if (process.platform === 'linux' && (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)) {
    const serverlessChromium = (await import('@sparticuz/chromium')).default;
    return chromium.launch({
      args: serverlessChromium.args,
      executablePath: await serverlessChromium.executablePath(),
      headless: true,
    });
  }
  try {
    return await chromium.launch({ headless: true });
  } catch {
    return chromium.launch({ headless: true, channel: 'chrome' });
  }
}

export async function POST(request: NextRequest) {
  let html: string;
  let fileName: string;
  try {
    const body = await request.json();
    html = typeof body?.html === 'string' ? body.html : '';
    fileName = typeof body?.fileName === 'string' && body.fileName.trim() ? body.fileName.trim() : 'document';
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!html) return NextResponse.json({ error: 'Missing html' }, { status: 400 });
  if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
    return NextResponse.json({ error: 'Document too large to render' }, { status: 413 });
  }

  const documentHtml = applyFontSubstitutes(html).replace(
    /<head([^>]*)>/i,
    `<head$1><link rel="stylesheet" href="${GOOGLE_FONTS_HREF}">`
  );

  let browser: Browser | null = null;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.route('**/*', (route) =>
      isAllowedRequest(route.request().url(), route.request().resourceType()) ? route.continue() : route.abort()
    );
    await page.setContent(documentHtml, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.evaluate(() => (document as any).fonts?.ready);

    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true, // @page size/margin from the document win
      format: 'A4',
    });

    const safeName = fileName.replace(/[^\w.-]+/g, '_');
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeName}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    console.error('render-pdf failed:', error);
    return NextResponse.json({ error: error?.message || 'Failed to render PDF' }, { status: 500 });
  } finally {
    await browser?.close().catch(() => {});
  }
}
