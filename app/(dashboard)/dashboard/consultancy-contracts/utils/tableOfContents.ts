// tableOfContents.ts

// Regex-based (not DOMParser) so this runs identically during SSR and in
// the browser - the template's <h2> sections are typed freeform by the
// admin (no fixed CONTRACT_SECTIONS list to drive a ToC off, unlike
// Employment Contracts' assembleContractHtml), so the ToC is derived
// directly from whatever <h2> headings the rendered document happens to
// contain, numbered in document order.
function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

// Where to splice the generated <nav class="cs-toc"> in: right after the
// document's own title block, which is either the newer structured cover
// (<div class="cc-cover">...</div>, see themeEngine.ts's .cc-cover rules -
// gives each theme a properly designed title/subtitle/parties treatment
// instead of one plain <h1>) or, for templates not yet migrated to it, the
// older plain <h1>. Walks nested <div> depth from the cover's opening tag so
// this finds THAT div's own matching close, not just the first </div>
// anywhere in the document (which could belong to a nested child instead).
function findTitleBlockEnd(html: string): number | null {
  const coverOpen = /<div\b[^>]*\bclass="[^"]*\bcc-cover\b[^"]*"[^>]*>/i.exec(html);
  if (coverOpen) {
    const divTagRe = /<div\b[^>]*>|<\/div>/gi;
    divTagRe.lastIndex = coverOpen.index;
    let depth = 0;
    let m: RegExpExecArray | null;
    while ((m = divTagRe.exec(html))) {
      if (m[0].toLowerCase() === '</div>') {
        depth -= 1;
        if (depth === 0) return m.index + m[0].length;
      } else {
        depth += 1;
      }
    }
    return null;
  }
  const h1Close = /<\/h1>/i.exec(html);
  return h1Close ? h1Close.index + h1Close[0].length : null;
}

// Assigns id="section-N" to every <h2> (overwriting any id already there, so
// re-running this after a content edit doesn't drift out of sync with the
// ToC's own links) and inserts a generated <nav class="cs-toc"> right after
// the document's title block - see findTitleBlockEnd above.
export function withTableOfContents(html: string): string {
  if (!html) return html;

  let index = 0;
  const items: string[] = [];
  const withIds = html.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/gi, (_match, attrs, inner) => {
    index += 1;
    const id = `section-${index}`;
    const title = stripTags(inner);
    
    // <div>, not <li> - see the module comment: an <ol>/<li> ToC list
    // doubles up in the exported .doc because Word generates its own list
    // numbering for <ol> regardless of the `list-style: none` that
    // suppresses it in a browser, stacking on top of this cs-toc-num span.
    items.push(
        `<div class="cs-toc-item">
            <a class="cs-toc-link" href="#${id}">
                <span class="cs-toc-num">${index}.</span> 
                <span class="cs-toc-text">${title}</span>
            </a>
        </div>`
    );
    const attrsWithoutId = String(attrs).replace(/\s+id="[^"]*"/i, '');
    return `<h2${attrsWithoutId} id="${id}">${inner}</h2>`;
  });

  if (items.length === 0) return html;

  const toc = `
    <nav class="cs-toc">
        <div class="cs-toc-heading">Table of Contents</div>
        <div class="cs-toc-list">${items.join('')}</div>
    </nav>`;
    
  const insertAt = findTitleBlockEnd(withIds);
  return insertAt != null ? withIds.slice(0, insertAt) + toc + withIds.slice(insertAt) : toc + withIds;
}