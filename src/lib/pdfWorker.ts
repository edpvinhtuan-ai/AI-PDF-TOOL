import * as pdfjsLib from 'pdfjs-dist';
// @ts-expect-error Vite URL import for worker
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  try {
    // Prefer Vite-bundled worker URL, with CDN fallback if needed
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      pdfWorkerUrl || `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  } catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  }
}

export { pdfjsLib };

