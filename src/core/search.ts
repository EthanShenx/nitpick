export interface SearchMatch {
  start: number;
  end: number;
}
/** Literal Unicode search in the immutable display text. Whitespace can span lines. */
export function findMatches(text: string, query: string, matchCase = false): SearchMatch[] {
  const words = query.trim().split(/\s+/u);
  if (!words[0]) return [];
  const pattern = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  const regex = new RegExp(pattern, matchCase ? 'gu' : 'giu');
  return [...text.matchAll(regex)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}
export function nextMatch(index: number, count: number, direction: number) {
  return count ? (((index + direction) % count) + count) % count : 0;
}

export function findDocumentMatches(doc: import('./types').Doc, query: string, matchCase = false) {
  const results = findMatches(doc.text, query, matchCase);
  if (!doc.pdf) return results;
  const items = doc.pdf.pages.flatMap((page) => page.items).filter((item) => item.end > item.start);
  let cursor = 0;
  return results.filter((match) => {
    while (cursor < items.length && items[cursor].end <= match.start) cursor++;
    return cursor < items.length && items[cursor].start < match.end;
  });
}
