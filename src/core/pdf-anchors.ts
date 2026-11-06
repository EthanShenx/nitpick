import type { Anchor, Doc, PdfPage, PdfRect } from './types';
export function pdfRangeRects(doc: Doc, start: number, end: number): PdfRect[] {
  return doc.pdf?.pages.flatMap(page => page.items.flatMap(item => {
    const from = Math.max(start, item.start), to = Math.min(end, item.end);
    if (to <= from || item.end === item.start) return [];
    const fraction = (to - from) / (item.end - item.start);
    return [{ ...item.rect, x: item.rect.x + item.rect.width * (from - item.start) / (item.end - item.start), width: item.rect.width * fraction }];
  })) ?? [];
}
export function validPdfRects(doc: Doc, anchor: Anchor): boolean {
  if (!doc.pdf) return anchor.pdfRects === undefined && anchor.region === undefined;
  if (anchor.region !== undefined && anchor.region !== true) return false;
  if (anchor.region && (anchor.start !== anchor.end || !anchor.pdfRects?.length)) return false;
  if (anchor.pdfRects === undefined) return !anchor.region;
  if (!Array.isArray(anchor.pdfRects) || anchor.pdfRects.length > 100_000) return false;
  return anchor.pdfRects.every(r => {
    const p = doc.pdf!.pages[r.page - 1];
    return Number.isInteger(r.page) && p &&
      [r.x, r.y, r.width, r.height].every(Number.isFinite) &&
      r.x >= -.1 && r.y >= -.1 && r.width > 0 && r.height > 0 &&
      r.x + r.width <= p.width + .5 && r.y + r.height <= p.height + .5 &&
      (anchor.region ? anchor.start === p.start : anchor.start < p.end && anchor.end > p.start);
  });
}
export function pdfPoint(page: PdfPage, x: number, y: number): [number, number] {
  const [a,b,c,d,e,f] = page.transform, determinant = a*d-b*c;
  return [(d*(x-e)-c*(y-f))/determinant, (-b*(x-e)+a*(y-f))/determinant];
}
export function pdfAreaLabel(anchor: Anchor) {
  const r = anchor.pdfRects?.[0];
  return r ? `Selected area (${Math.round(r.x)}, ${Math.round(r.y)}, ${Math.round(r.width)} × ${Math.round(r.height)} pt)` : 'Selected area';
}
