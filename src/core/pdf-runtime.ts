import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc = workerUrl;
export function loadPdf(bytes: Uint8Array) {
  const base = new URL(`${import.meta.env.BASE_URL}pdfjs/`, location.origin).href;
  const task = getDocument({
    data: bytes.slice(), cMapUrl: `${base}cmaps/`, cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`, wasmUrl: `${base}wasm/`,
    iccUrl: `${base}iccs/`, enableXfa: false, stopAtErrors: true,
    maxImageSize: 24_000_000, canvasMaxAreaInBytes: 96_000_000,
  });
  task.onPassword = () => { void task.destroy(); };
  return task;
}
export function pdfBytes(data: string) {
  return Uint8Array.from(atob(data), c => c.charCodeAt(0));
}
