
export function printHtmlAsPdf(html: string, options?: { pageMargin?: string }): Promise<void> {
  const pageMargin = options?.pageMargin ?? '0.5in';
  return new Promise((resolve) => {
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      .lh-print-export { display: none; }
      @media print {
        @page { size: A4; margin: ${pageMargin}; }
        html, body { margin: 0; height: auto !important; overflow: visible !important; }
        /* display:none (not visibility:hidden) so hidden siblings are
           removed from layout entirely - a page whose own root is a fixed
           full-viewport-height shell (h-screen overflow-hidden, e.g.
           letters/page.tsx) would otherwise still occupy that full height
           invisibly, pushing the actual printed content's page count up
           with mostly-blank pages. Once siblings are gone, .lh-print-export
           no longer needs position:absolute to "float above" them - normal
           flow lets the browser's own pagination measure its real height. */
        body > *:not(.lh-print-export) { display: none !important; }
        .lh-print-export {
          display: block !important;
          width: 100% !important;
          margin: 0;
          overflow: visible !important;
        }
      }
    `;
    const container = document.createElement('div');
    container.className = 'lh-print-export';
    container.innerHTML = html;

    document.head.appendChild(styleEl);
    document.body.appendChild(container);

    const cleanup = () => {
      styleEl.remove();
      container.remove();
      window.removeEventListener('afterprint', cleanup);
      resolve();
    };
    window.addEventListener('afterprint', cleanup);

    requestAnimationFrame(() => window.print());
  });
}
