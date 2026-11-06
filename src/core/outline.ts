import type { Block, Doc } from './types';

export interface OutlineEntry {
  block: Block;
  level: number;
  number: string;
  children: OutlineEntry[];
}
/** Levels are display metadata; the stored ordinal section anchors remain stable. */
export function headingLevel(doc: Doc, block: Block): number {
  if (doc.format === 'tex') {
    const source = block.runs.find((r) => r.source)?.source;
    if (source) {
      const prefix =
        doc.files[source.file]?.slice(Math.max(0, source.start - 300), source.start) ?? '';
      const command =
        /\\(chapter|section|subsection|subsubsection|paragraph)\*?(?:\[[^\]]*\])?\s*\{[^{}]*$/.exec(
          prefix,
        )?.[1];
      const levels: Record<string, number> = {
        chapter: 1,
        section: 2,
        subsection: 3,
        subsubsection: 4,
        paragraph: 5,
      };
      if (command) return levels[command];
    }
  }
  return Math.max(1, Math.min(6, block.level ?? 2));
}
export function documentOutline(doc: Doc): OutlineEntry[] {
  const roots: OutlineEntry[] = [],
    stack: OutlineEntry[] = [];
  for (const block of doc.blocks.filter((b) => b.kind === 'heading')) {
    const level = headingLevel(doc, block);
    while (stack.length && stack.at(-1)!.level >= level) stack.pop();
    const parent = stack.at(-1),
      siblings = parent ? parent.children : roots;
    const number = `${parent ? parent.number + '.' : ''}${siblings.length + 1}`;
    const entry: OutlineEntry = { block, level, number, children: [] };
    siblings.push(entry);
    stack.push(entry);
  }
  return roots;
}
export function sectionLabel(doc: Doc, ordinal: number): string {
  const find = (entries: OutlineEntry[]): string | undefined => {
    for (const entry of entries) {
      if (entry.block.section === ordinal) return entry.number;
      const child = find(entry.children);
      if (child) return child;
    }
  };
  return find(documentOutline(doc)) ?? String(ordinal);
}
