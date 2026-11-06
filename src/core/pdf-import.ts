import { Util } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { loadPdf } from './pdf-runtime';
import { bytesToBase64 } from './import';
import type { Doc, PdfPage, PdfBookmark } from './types';

/** One immutable text index per original page. Rendering always uses the original PDF. */
export async function importPdf(file: File): Promise<Doc> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!new TextDecoder().decode(bytes.subarray(0,1024)).includes('%PDF-')) throw new Error('Could not open this PDF: the file does not contain a valid PDF header. Your existing work is safe.');
  const task = loadPdf(bytes);
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 500) throw new Error('This PDF exceeds the 500-page import limit.');
    const labels = await pdf.getPageLabels();
    const pages: PdfPage[] = [];
    const blocks: Doc['blocks'] = [];
    let text = '';
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n), viewport = page.getViewport({ scale: 1 });
      if (!(viewport.width > 0 && viewport.height > 0) || viewport.width > 20_000 || viewport.height > 20_000)
        throw new Error(`Page ${n} has unsupported dimensions.`);
      const content = await page.getTextContent();
      if (n > 1) text += '\n\n';
      const start = text.length;
      const items: PdfPage['items'] = [];
      let index = 0;
      let previous: TextItem | undefined;
      for (const entry of content.items) {
        if (!('str' in entry)) continue;
        const item = entry as TextItem;
        if (previous && item.str && !/\s$/.test(text) && !/^\s/.test(item.str)) {
          const lineChange = Math.abs(item.transform[5] - previous.transform[5]) > Math.max(2, item.height * .5);
          // PDF.js includes explicit spaces when supplied; infer only actual gaps between items.
          const gap = item.transform[4] - (previous.transform[4] + previous.width);
          if (previous.hasEOL || lineChange) text += '\n';
          else if (gap > Math.max(.5, item.height * .1)) text += ' ';
        }
        const itemStart = text.length;
        text += item.str;
        const t = Util.transform(viewport.transform, item.transform);
        const height = Math.hypot(t[2], t[3]);
        const style = content.styles[item.fontName];
        const ascent = style?.ascent ?? (style?.descent ? 1 + style.descent : .8);
        // Persist item boxes for whole-page notes and fallback selections. Live selections
        // capture precise DOM Range boxes, including individual characters and line wraps.
        const angle = Math.atan2(t[1],t[0]) + (style?.vertical ? Math.PI/2 : 0);
        const advance = Math.abs(style?.vertical ? item.height : item.width);
        const left = t[4] + Math.sin(angle)*height*ascent;
        const top = t[5] - Math.cos(angle)*height*ascent;
        const corners = [[left,top],[left+Math.cos(angle)*advance,top+Math.sin(angle)*advance],
          [left-Math.sin(angle)*height,top+Math.cos(angle)*height],
          [left+Math.cos(angle)*advance-Math.sin(angle)*height,top+Math.sin(angle)*advance+Math.cos(angle)*height]];
        const x = Math.max(0,Math.min(viewport.width-.1,Math.min(...corners.map(p=>p[0]))));
        const y = Math.max(0,Math.min(viewport.height-.1,Math.min(...corners.map(p=>p[1]))));
        items.push({ index: index++, start: itemStart, end: text.length, rect: {
          page: n, x, y, width: Math.max(.1, Math.min(Math.max(...corners.map(p=>p[0]))-x, viewport.width-x)),
          height: Math.max(.1, Math.min(Math.max(...corners.map(p=>p[1]))-y, viewport.height-y)),
        } });
        previous = item;
      }
      if (text.length === start) text += `[Page ${labels?.[n - 1] ?? n}: no selectable text]`;
      const end = text.length;
      pages.push({ number: n, label: labels?.[n - 1] ?? String(n), width: viewport.width,
        height: viewport.height, rotation: viewport.rotation, transform: [...viewport.transform], start, end, items });
      blocks.push({ id: `pdf-page-${n}`, kind: 'paragraph', start, end, section: 0,
        heading: '', paragraph: n, runs: [{ text: text.slice(start, end), start, end }] });
      page.cleanup();
    }
    async function bookmarks(entries: Awaited<ReturnType<typeof pdf.getOutline>>): Promise<PdfBookmark[]> {
      const result: PdfBookmark[] = [];
      for (const item of entries ?? []) {
        let number: number | undefined;
        try {
          const dest = typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest;
          if (dest?.[0] !== undefined) number = typeof dest[0] === 'number' ? dest[0] + 1 : (await pdf.getPageIndex(dest[0])) + 1;
        } catch { /* Invalid external bookmarks do not prevent reading the original pages. */ }
        const children = await bookmarks(item.items);
        if (number && number <= pdf.numPages) result.push({ title: item.title, page: number, children });
        else result.push(...children);
      }
      return result;
    }
    const outline = await bookmarks(await pdf.getOutline());
    const data = bytesToBase64(bytes);
    const warnings = ['PDF pages retain their original layout. Revision lists use the embedded text and page numbers. Reading order and text extraction depend on the PDF; check quotes for complex layouts. Existing PDF markup is displayed as part of the original and is not editable in Nitpick.'];
    const empty = pages.filter(p => !p.items.some(i => i.end > i.start));
    if (empty.length) warnings.push(`${empty.length} page(s) have no selectable text. Use Select area to annotate scans or figures. Nitpick does not perform OCR.`);
    return { name: file.name, format: 'pdf', main: file.name, files: { [file.name]: data }, assets: {},
      original: { name: file.name, data, encoding: 'base64' }, blocks, text, warnings, pdf: { pages, outline } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not open this PDF. ${/password|destroy|Password/i.test(message) ? 'Password-protected PDFs are not supported. Open an unlocked copy.' : message} Your existing work is safe.`);
  } finally { await task.destroy(); }
}
