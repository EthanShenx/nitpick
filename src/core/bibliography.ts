import type { SourceRange } from './types';

export interface BibEntry {
  key: string;
  fields: Record<string, string>;
  source: SourceRange;
}
// Read braced/quoted BibTeX values without executing TeX or evaluating strings.
// Balanced braces matter: titles often contain protected acronyms and commas.
export function readBibliography(source: string, file: string): BibEntry[] {
  const entries: BibEntry[] = [];
  const entry = /@(\w+)\s*\{\s*([^,{}\s]+)\s*,/g;
  let match: RegExpExecArray | null;
  while ((match = entry.exec(source))) {
    let i = entry.lastIndex;
    const fields: Record<string, string> = {};
    while (i < source.length) {
      while (/[\s,]/.test(source[i] ?? '') && i < source.length) i++;
      if (source[i] === '}') {
        i++;
        break;
      }
      const field = /^[\w-]+\s*=\s*/.exec(source.slice(i));
      if (!field) {
        i++;
        continue;
      }
      const key = field[0].split('=')[0].trim().toLowerCase();
      i += field[0].length;
      const begin = source[i];
      let value = '';
      if (begin === '{' || begin === '"') {
        const start = ++i;
        let depth = begin === '{' ? 1 : 0;
        while (i < source.length) {
          const ch = source[i];
          if (ch === '\\') {
            i += 2;
            continue;
          }
          if (ch === '{') depth++;
          if (ch === '}') {
            if (depth === 0) break;
            depth--;
            if (begin === '{' && depth === 0) break;
          }
          if (begin === '"' && ch === '"' && depth === 0) break;
          i++;
        }
        value = source.slice(start, i);
        i++;
      } else {
        const start = i;
        while (i < source.length && !/[,}]/.test(source[i])) i++;
        value = source.slice(start, i).trim();
      }
      fields[key] = value;
    }
    if (!['comment', 'preamble', 'string'].includes(match[1].toLowerCase()))
      entries.push({ key: match[2], fields, source: { file, start: match.index, end: i } });
    entry.lastIndex = i;
  }
  return entries;
}
export function bibText(value = ''): string {
  return value
    .replace(/\\&/g, '&')
    .replace(/[{}]/g, '')
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/\s+/g, ' ')
    .trim();
}
export function citationName(entry: BibEntry): string {
  const names = (entry.fields.author || entry.fields.editor || '').split(/\s+and\s+/);
  const surname = (name: string) =>
    bibText(name.includes(',') ? name.split(',')[0] : name.trim().split(/\s+/).at(-1));
  if (!names[0]) return bibText(entry.fields.title) || entry.key;
  return names.length > 2 ? `${surname(names[0])} et al.` : names.map(surname).join(' and ');
}
export function referenceText(entry: BibEntry): string {
  const f = entry.fields;
  const authors = bibText(f.author || f.editor).replace(/\s+and\s+/g, '; ');
  return [
    authors,
    f.year || f.date ? `(${bibText(f.year || f.date)})` : '',
    bibText(f.title),
    bibText(f.journaltitle || f.journal || f.booktitle),
    f.volume ? `${bibText(f.volume)}${f.number ? `(${bibText(f.number)})` : ''}` : '',
    f.pages ? `pp. ${bibText(f.pages)}` : '',
    f.doi ? `https://doi.org/${bibText(f.doi)}` : bibText(f.url),
  ]
    .filter(Boolean)
    .join('. ');
}
