import { getDocument, GlobalWorkerOptions, AnnotationMode } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc = workerUrl;

/** Rasterize only an included figure. The essay and its text never use PDF rendering. */
export async function renderPdfFigure(bytes: Uint8Array): Promise<string> {
  const base = new URL(`${import.meta.env.BASE_URL}pdfjs/`, location.origin).href;
  const task = getDocument({
    data: bytes.slice(),
    cMapUrl: `${base}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`,
    wasmUrl: `${base}wasm/`,
    iccUrl: `${base}iccs/`,
    enableXfa: false,
    stopAtErrors: true,
    maxImageSize: 24_000_000,
    canvasMaxAreaInBytes: 96_000_000,
  });
  // Password-protected figures stay explicit placeholders instead of blocking import.
  task.onPassword = () => {
    void task.destroy();
  };
  let canvas: HTMLCanvasElement | undefined;
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 24) throw new Error('The figure exceeds the 24-page preview limit.');
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) pages.push(await pdf.getPage(i));
    const sizes = pages.map((p) => p.getViewport({ scale: 1 }));
    const width = Math.max(...sizes.map((s) => s.width));
    const height = sizes.reduce((sum, s) => sum + s.height, 0);
    const scale = Math.min(
      2,
      2000 / width,
      15000 / height,
      Math.sqrt(20_000_000 / (width * height)),
    );
    if (!(scale > 0) || !Number.isFinite(scale)) throw new Error('Invalid PDF figure dimensions.');
    canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * scale);
    canvas.height =
      sizes.reduce((sum, size) => sum + Math.ceil(size.height * scale), 0) +
      (pages.length - 1) * 12;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot create a figure preview.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let top = 0;
    for (let i = 0; i < pages.length; i++) {
      const viewport = pages[i].getViewport({ scale });
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = Math.ceil(viewport.width);
      pageCanvas.height = Math.ceil(viewport.height);
      try {
        await pages[i].render({
          canvas: pageCanvas,
          viewport,
          background: '#fff',
          annotationMode: AnnotationMode.DISABLE,
        }).promise;
        ctx.drawImage(pageCanvas, (canvas.width - pageCanvas.width) / 2, top);
        top += pageCanvas.height + 12;
      } finally {
        pageCanvas.width = 0;
        pageCanvas.height = 0;
      }
      pages[i].cleanup();
    }
    return canvas.toDataURL('image/png');
  } finally {
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    await task.destroy();
  }
}
