import { anchorAt } from './model';
import type { Doc, PdfRect } from './types';
export function readSelection(root: HTMLElement, doc: Doc) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  // A DOM range may touch the next highlight's boundary without selecting a character in it.
  // Clip to each leaf first, then discard zero-text intersections before snapping atomic units.
  const leaves = [...root.querySelectorAll<HTMLElement>('[data-leaf]')].flatMap((el) => {
    if (!range.intersectsNode(el)) return [];
    const leafRange = document.createRange();
    leafRange.selectNodeContents(el);
    const clipped = range.cloneRange();
    if (clipped.compareBoundaryPoints(Range.START_TO_START, leafRange) < 0) clipped.setStart(el, 0);
    if (clipped.compareBoundaryPoints(Range.END_TO_END, leafRange) > 0)
      clipped.setEnd(el, el.childNodes.length);
    return clipped.collapsed || !clipped.toString().length ? [] : [{ el, range: clipped }];
  });
  if (!leaves.length) return null;
  const first = leaves[0],
    last = leaves.at(-1)!;
  function offset(el: HTMLElement, node: Node, offset: number, isEnd: boolean) {
    const start = Number(el.dataset.start),
      end = Number(el.dataset.end);
    if (el.dataset.atomic === 'true') return isEnd ? end : start;
    const r = document.createRange();
    r.selectNodeContents(el);
    r.setEnd(node, offset);
    return Math.min(end, start + r.toString().length);
  }
  const start = offset(first.el, first.range.startContainer, first.range.startOffset, false),
    end = offset(last.el, last.range.endContainer, last.range.endOffset, true);
  if (end <= start) return null;
  const rect = range.getBoundingClientRect();
  const anchor = anchorAt(doc, start, end);
  if (doc.pdf) {
    const boxes: PdfRect[] = [];
    for (const { el, range: clipped } of leaves) {
      const surface = el.closest<HTMLElement>('[data-pdf-page]');
      if (!surface) continue;
      const p = doc.pdf.pages[Number(surface.dataset.pdfPage) - 1];
      const bounds = surface.getBoundingClientRect();
      for (const r of clipped.getClientRects()) {
        const x = Math.max(0, (r.left - bounds.left) * p.width / bounds.width);
        const y = Math.max(0, (r.top - bounds.top) * p.height / bounds.height);
        const width = Math.min(p.width - x, r.width * p.width / bounds.width);
        const height = Math.min(p.height - y, r.height * p.height / bounds.height);
        if (width > 0 && height > 0) boxes.push({ page: p.number, x, y, width, height });
      }
    }
    anchor.pdfRects = boxes;
  }
  return {
    anchor,
    rect: { x: rect.left + rect.width / 2, y: rect.bottom },
  };
}
