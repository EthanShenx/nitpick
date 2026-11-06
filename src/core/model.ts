import { pdfRangeRects } from './pdf-anchors';
import { sectionLabel, headingLevel } from './outline';
import type { Anchor, Annotation, Block, Doc, Filters, Run, SourceRange } from './types';
export type DraftRun = Omit<Run, 'start' | 'end'>;
export class DocumentBuilder {
  blocks: Block[] = [];
  warnings: string[] = [];
  private pending: DraftRun[] = [];
  private kind: Block['kind'] = 'paragraph';
  constructor(
    public format: Doc['format'],
    public main: string,
    public files: Record<string, string>,
    public assets: Record<string, string> = {},
  ) {}
  add(run: DraftRun) {
    if (run.text) this.pending.push(run);
  }
  flush(kind?: Block['kind'], level?: number) {
    while (this.pending.length && !this.pending[0].text.trim()) this.pending.shift();
    while (this.pending.length && !this.pending.at(-1)!.text.trim()) this.pending.pop();
    if (!this.pending.length) return;
    this.blocks.push({
      id: `b${this.blocks.length}`,
      kind: kind ?? this.kind,
      level,
      runs: this.pending.map((r) => ({ ...r, start: 0, end: 0 })),
      start: 0,
      end: 0,
      section: 0,
      heading: '',
      paragraph: 0,
    });
    this.pending = [];
  }
  finish(name: string): Doc {
    this.flush();
    let text = '',
      section = 0,
      heading = '',
      paragraph = 0;
    for (const block of this.blocks) {
      if (text) text += '\n\n';
      block.start = text.length;
      if (block.kind === 'heading') {
        section++;
        heading = block.runs.map((r) => r.text).join('');
        paragraph = 0;
      } else if (block.kind !== 'title') paragraph++;
      block.section = section;
      block.heading = heading;
      block.paragraph = paragraph;
      for (const run of block.runs) {
        run.start = text.length;
        text += run.text;
        run.end = text.length;
      }
      block.end = text.length;
    }
    return {
      name,
      format: this.format,
      main: this.main,
      files: this.files,
      assets: this.assets,
      blocks: this.blocks,
      text,
      warnings: [...new Set(this.warnings)],
    };
  }
}
export function snapRange(doc: Doc, start: number, end: number) {
  for (const b of doc.blocks)
    for (const r of b.runs)
      if (r.atomic) {
        if (start > r.start && start < r.end) start = r.start;
        if (end > r.start && end < r.end) end = r.end;
      }
  return { start: Math.max(0, start), end: Math.min(doc.text.length, end) };
}
export function sourceRanges(doc: Doc, start: number, end: number): SourceRange[] {
  const ranges: SourceRange[] = [];
  for (const b of doc.blocks)
    for (const r of b.runs) {
      if (!r.source || r.end <= start || r.start >= end) continue;
      const s = r.source;
      const linear = !r.atomic && s.end - s.start === r.text.length;
      const next = {
        file: s.file,
        start: linear ? s.start + Math.max(0, start - r.start) : s.start,
        end: linear ? s.end - Math.max(0, r.end - end) : s.end,
      };
      const last = ranges.at(-1);
      if (last && last.file === next.file && next.start >= last.start) {
        last.end = Math.max(last.end, next.end);
      } else ranges.push(next);
    }
  return ranges;
}
export function anchorAt(doc: Doc, start: number, end: number): Anchor {
  ({ start, end } = snapRange(doc, start, end));
  const first = doc.blocks.find((b) => b.end > start) ?? doc.blocks.at(-1)!;
  const last = [...doc.blocks].reverse().find((b) => b.start < end) ?? first;
  return {
    start,
    end,
    quote: doc.text.slice(start, end),
    before: doc.text.slice(Math.max(0, start - 80), start),
    after: doc.text.slice(end, end + 80),
    section: first?.section ?? 0,
    sectionEnd: last?.section ?? 0,
    heading: first?.heading ?? '',
    paragraph: first?.paragraph ?? 0,
    paragraphEnd: last?.paragraph ?? 0,
    source: sourceRanges(doc, start, end),
    ...(doc.pdf ? { pdfRects: pdfRangeRects(doc, start, end) } : {}),
  };
}
export function blockAnchor(doc: Doc, b: Block, section = false): Anchor {
  if (!section) return anchorAt(doc, b.start, b.end);
  const heading = doc.blocks.find((x) => x.kind === 'heading' && x.section === b.section);
  if (!heading) return anchorAt(doc, b.start, b.end);
  const index = doc.blocks.indexOf(heading);
  let end = doc.text.length;
  for (const next of doc.blocks.slice(index + 1))
    if (next.kind === 'heading' && headingLevel(doc, next) <= headingLevel(doc, heading)) {
      end = next.start - 2;
      break;
    }
  return anchorAt(doc, heading.start, end);
}
export function location(a: Anchor, doc: Doc, scope = 'selection') {
  const sec = a.section ? `, section ${sectionLabel(doc, a.section)} ("${a.heading}")` : '';
  if (scope === 'document') return 'the whole document';
  if (doc.pdf) {
    const pages = a.region ? [...new Set(a.pdfRects?.map(r => r.page) ?? [])] : doc.pdf.pages.filter(p => a.start < p.end && a.end > p.start).map(p => p.number);
    const first = pages[0] ?? doc.pdf.pages.find(p => p.start <= a.start && p.end > a.start)?.number ?? 1;
    const last = pages.at(-1) ?? first;
    const label = (n: number) => { const p = doc.pdf!.pages[n-1]; return p.label === String(n) ? String(n) : `${p.label} (PDF page ${n})`; };
    return first === last ? `page ${label(first)}` : `pages ${label(first)}–${label(last)}`;
  }
  if (scope === 'selection' && a.paragraph === 0 && a.paragraphEnd === 0)
    return a.section
      ? `heading of section ${sectionLabel(doc, a.section)} ("${a.heading}")`
      : 'the document title';
  if (scope === 'section') return `section ${sectionLabel(doc, a.section)} ("${a.heading}")`;
  if (a.paragraph === 0 && a.sectionEnd === a.section && a.paragraphEnd > 0)
    return `${a.section ? 'heading' : 'document title'} through paragraph ${a.paragraphEnd}${sec}`;
  if (a.sectionEnd !== a.section) {
    const end = doc.blocks.find((b) => b.section === a.sectionEnd);
    return `paragraph ${a.paragraph}, section ${sectionLabel(doc, a.section)} ("${a.heading}") through paragraph ${a.paragraphEnd}, section ${sectionLabel(doc, a.sectionEnd)} ("${end?.heading ?? ''}")`;
  }
  return (
    (a.paragraph === a.paragraphEnd
      ? `paragraph ${a.paragraph}`
      : `paragraphs ${a.paragraph}-${a.paragraphEnd}`) + sec
  );
}
export function matches(a: Annotation, f: Filters) {
  const small = a.scope === 'selection' && ['Delete', 'Replace', 'Insert'].includes(a.type);
  return (
    (f.type === 'all' || a.type === f.type) &&
    (f.scope === 'all' || a.scope === f.scope) &&
    (f.preset === 'Everything' || (f.preset === 'Small edits' ? small : !small))
  );
}
export function context(doc: Doc, a: Anchor, source = false): string {
  const text = doc.text;
  // Segmenter preserves Unicode punctuation and paragraph breaks. No quote is shortened.
  const segments = [
    ...new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(text),
  ].filter((s) => s.segment.trim());
  let first = segments.findIndex((s) => s.index + s.segment.length > a.start),
    last = segments.findIndex((s) => s.index + s.segment.length >= a.end);
  if (first < 0) first = 0;
  if (last < 0) last = segments.length - 1;
  const begins = text.slice(segments[first]?.index ?? 0, a.start).trim() === '';
  const ends =
    text
      .slice(a.end, (segments[last]?.index ?? 0) + (segments[last]?.segment.length ?? 0))
      .trim() === '';
  if (begins && ends) {
    first = Math.max(0, first - 1);
    last = Math.min(segments.length - 1, last + 1);
  }
  const start = segments[first]?.index ?? a.start,
    end = (segments[last]?.index ?? a.end) + (segments[last]?.segment.length ?? 0);
  return source ? sourceQuote(doc, anchorAt(doc, start, end)) : text.slice(start, end).trim();
}
export function sourceQuote(doc: Doc, a: Anchor) {
  return a.source.length
    ? a.source.map((s) => doc.files[s.file]?.slice(s.start, s.end) ?? '').join('\n\n')
    : a.quote;
}
