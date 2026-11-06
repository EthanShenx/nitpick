import type { Annotation, Anchor } from './types';

/** Half-open ranges: touching words are adjacent, not overlapping. */
export function rangesOverlap(a: Pick<Anchor, 'start' | 'end'>, b: Pick<Anchor, 'start' | 'end'>) {
  const x = a as Anchor, y = b as Anchor;
  if (x.region || y.region) return !!x.pdfRects?.some(r => y.pdfRects?.some(s => r.page === s.page && Math.max(r.x,s.x) < Math.min(r.x+r.width,s.x+s.width) && Math.max(r.y,s.y) < Math.min(r.y+r.height,s.y+s.height)));
  return Math.max(a.start, b.start) < Math.min(a.end, b.end);
}
export function overlappingAnnotations(
  anchor: Anchor,
  annotations: Annotation[],
  excludeId?: string,
) {
  return annotations.filter(
    (a) => a.id !== excludeId && a.scope !== 'document' && rangesOverlap(anchor, a.anchor),
  );
}
export function overlapGroups(annotations: Annotation[]) {
  const groups: { start: number; end: number; annotations: Annotation[] }[] = [];
  for (const a of [...annotations]
    .filter((a) => a.scope !== 'document')
    .sort(
      (a, b) =>
        a.anchor.start - b.anchor.start || b.anchor.end - a.anchor.end || a.createdAt - b.createdAt,
    )) {
    const group = groups.at(-1);
    if (group && a.anchor.start < group.end) {
      group.annotations.push(a);
      group.end = Math.max(group.end, a.anchor.end);
    } else groups.push({ start: a.anchor.start, end: a.anchor.end, annotations: [a] });
  }
  return groups;
}
/** Shared TeX source can overlap even when two input occurrences are far apart on screen. */
export function overlappingIds(annotations: Annotation[], includeSource = false) {
  const result = new Set<string>();
  const edits = annotations.filter((a) => a.scope !== 'document');
  for (let i = 0; i < edits.length; i++)
    for (let j = i + 1; j < edits.length; j++) {
      const a = edits[i],
        b = edits[j];
      if (
        rangesOverlap(a.anchor, b.anchor) ||
        (includeSource &&
          a.anchor.source.some((x) =>
            b.anchor.source.some((y) => x.file === y.file && rangesOverlap(x, y)),
          ))
      ) {
        result.add(a.id);
        result.add(b.id);
      }
    }
  return result;
}
