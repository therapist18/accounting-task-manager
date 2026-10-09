// Post-processing for assembled contract/letter HTML, after placeholders are
// filled in.
//
// Clauses wrap list placeholders as <ul><li><p>{{key_responsibilities}}</p></li></ul>.
// When the value is empty that leaves a blank bullet; when it is filled
// (<li>..</li><li>..</li> markup) the parser closes the outer <li> early, so
// an empty bullet appears before the real ones. Removing empty <li>s fixes
// both; a list left with no items is removed, and so is a sub-heading
// (h3/h4) whose only content was that list - e.g. "Key Responsibilities"
// when a profile has none, so the export doesn't show an empty section.
//
// Browser-only (uses a <template> to parse); returns the input unchanged on
// the server.

const CONTENT_SELECTOR = 'img, table, input, svg, hr';

function isBlank(el: Element): boolean {
  return !el.textContent?.replace(/ /g, ' ').trim() && !el.querySelector(CONTENT_SELECTOR);
}

export function removeEmptyLists(html: string): string {
  if (!html || typeof document === 'undefined') return html;
  const template = document.createElement('template');
  template.innerHTML = html;
  const root = template.content;

  root.querySelectorAll('li').forEach((li) => {
    if (isBlank(li)) li.remove();
  });
  // Leftover empty <p> the parser hoisted into the list itself.
  root.querySelectorAll('ul > p, ol > p').forEach((p) => {
    if (isBlank(p)) p.remove();
  });

  root.querySelectorAll('ul, ol').forEach((list) => {
    if (list.querySelector('li')) return;
    // A sub-heading directly above the now-empty list introduced only that
    // list, so it goes too. Section headings (h1/h2) are never touched.
    const heading = list.previousElementSibling;
    if (heading && /^H[34]$/.test(heading.tagName)) heading.remove();
    list.remove();
  });

  return template.innerHTML;
}
