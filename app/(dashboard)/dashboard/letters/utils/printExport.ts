// Prints arbitrary HTML to PDF via the browser's native print pipeline
// (window.print -> "Save as PDF"), the same technique the employment-contracts
// module uses (see ContractPreview.tsx) instead of rasterizing the DOM with
// html2canvas/html2pdf. Real vector/selectable text, correct A4 margins via
// @page, no image conversion.
export function printHtmlAsPdf(html: string): Promise<void> {
  return new Promise((resolve) => {
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      .lh-print-export { display: none; }
      @media print {
        @page { size: A4; margin: 0.5in; }
        html, body { margin: 0; height: auto !important; overflow: visible !important; }
        body > *:not(.lh-print-export) { visibility: hidden !important; }
        .lh-print-export, .lh-print-export * { visibility: visible !important; }
        .lh-print-export {
          display: block !important;
          position: absolute !important;
          top: 0; left: 0;
          width: 100% !important;
          height: auto !important;
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
