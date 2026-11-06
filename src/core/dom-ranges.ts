import type { SearchMatch } from './search';
/** Search never changes the selection or inserts nodes into the annotation DOM. */
export function leafRange(leaf: HTMLElement, match: SearchMatch): Range | null {
  const start = Number(leaf.dataset.start),
    end = Number(leaf.dataset.end);
  if (end <= match.start || start >= match.end) return null;
  const range = document.createRange();
  range.selectNodeContents(leaf);
  if (leaf.dataset.atomic !== 'true' && leaf.firstChild?.nodeType === Node.TEXT_NODE) {
    const length = leaf.firstChild.textContent?.length ?? 0;
    range.setStart(leaf.firstChild, Math.min(length, Math.max(0, match.start - start)));
    range.setEnd(leaf.firstChild, Math.min(length, Math.max(0, Math.min(end, match.end) - start)));
  }
  return range;
}
