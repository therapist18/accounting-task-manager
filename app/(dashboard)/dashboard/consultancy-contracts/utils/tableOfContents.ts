// Regex-based (not DOMParser) so this runs identically during SSR and in
// the browser - the template's <h2> sections are typed freeform by the
// admin (no fixed CONTRACT_SECTIONS list to drive a ToC off, unlike
// Employment Contracts' assembleContractHtml), so the ToC is derived
// directly from whatever <h2> headings the rendered document happens to
// contain, numbered in document order.
function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

// Assigns id="section-N" to every <h2> (overwriting any id already there, so
// re-running this after a content edit doesn't drift out of sync with the
// ToC's own links) and inserts a generated <nav class="cc-toc"> right after
// the document's <h1> title - or at the very top if there's no h1.
export function withTableOfContents(html: string): string {
  if (!html) return html;

  let index = 0;
  const items: string[] = [];
  const withIds = html.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/gi, (_match, attrs, inner) => {
    index += 1;
    const id = `section-${index}`;
    const title = stripTags(inner);
    items.push(`<li class="cc-toc-item"><a class="cc-toc-link" href="#${id}">${title}</a></li>`);
    const attrsWithoutId = String(attrs).replace(/\s+id="[^"]*"/i, '');
    return `<h2${attrsWithoutId} id="${id}">${inner}</h2>`;
  });

  if (items.length === 0) return html;

  const toc = `<nav class="cc-toc"><div class="cc-toc-heading">Table of Contents</div><ol class="cc-toc-list">${items.join('')}</ol></nav>`;
  return /<\/h1>/i.test(withIds) ? withIds.replace(/<\/h1>/i, `</h1>${toc}`) : toc + withIds;
}
