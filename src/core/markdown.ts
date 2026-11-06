import { decodeString } from 'micromark-util-decode-string';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { DocumentBuilder } from './model';
import type { DraftRun } from './model';
export function parseMarkdown(source: string, name = 'essay.md') {
  const b = new DocumentBuilder('md', name, { [name]: source });
  function visit(node: any, style?: DraftRun['style'], inList = false) {
    const start = node.position?.start.offset ?? 0,
      end = node.position?.end.offset ?? start;
    const pos = { file: name, start, end };
    if (node.type === 'text') {
      const raw = source.slice(start, end);
      const runs: DraftRun[] = [];
      let cursor = 0;
      const token =
        /\\[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]|&(?:#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);|\r\n/g;
      for (const match of raw.matchAll(token)) {
        const i = match.index!;
        if (i > cursor)
          runs.push({
            text: raw.slice(cursor, i),
            source: { file: name, start: start + cursor, end: start + i },
            style,
          });
        const text = match[0] === '\r\n' ? '\n' : decodeString(match[0]);
        runs.push({
          text,
          source: { file: name, start: start + i, end: start + i + match[0].length },
          atomic: text !== match[0],
          style,
        });
        cursor = i + match[0].length;
      }
      if (cursor < raw.length)
        runs.push({
          text: raw.slice(cursor),
          source: { file: name, start: start + cursor, end },
          style,
        });
      if (runs.map((r) => r.text).join('') === node.value) runs.forEach((r) => b.add(r));
      else {
        b.add({ text: node.value, style });
        b.warnings.push(
          'Some decoded Markdown text has display offsets only; source coordinates are unavailable for that fragment.',
        );
      }
      return;
    }
    if (node.type === 'inlineCode' || node.type === 'code') {
      const raw = source.slice(start, end);
      const value: string = node.value;
      if (node.type === 'code') b.flush();
      const found = raw.indexOf(
        value,
        node.type === 'inlineCode'
          ? (raw.match(/^`+/)?.[0].length ?? 1)
          : raw.startsWith('```') || raw.startsWith('~~~')
            ? raw.indexOf('\n') + 1
            : 0,
      );
      if (found >= 0)
        b.add({
          text: value,
          source: { file: name, start: start + found, end: start + found + value.length },
          style: 'code',
        });
      else {
        b.add({ text: value, style: 'code' });
        b.warnings.push(
          'Normalized code uses display offsets only; its original source is retained in the project.',
        );
      }
      if (node.type === 'code') b.flush('paragraph');
      return;
    }
    if (node.type === 'image') {
      b.add({
        text: `[Image: ${node.alt || node.url}]`,
        kind: 'placeholder',
        atomic: true,
        source: pos,
      });
      b.warnings.push(
        'Markdown image references are shown as labeled placeholders; use a LaTeX ZIP or Word file to bundle images.',
      );
      return;
    }
    if (node.type === 'html') {
      b.add({ text: `[HTML: ${node.value}]`, kind: 'placeholder', atomic: true, source: pos });
      return;
    }
    if (node.type === 'break') {
      b.add({ text: '\n', source: pos, atomic: true });
      return;
    }
    const block = ['paragraph', 'heading', 'code', 'thematicBreak'].includes(node.type);
    if (block) b.flush();
    if (node.type === 'thematicBreak') b.add({ text: '────────', atomic: true, source: pos });
    for (const child of node.children ?? [])
      visit(
        child,
        node.type === 'strong' ? 'strong' : node.type === 'emphasis' ? 'emphasis' : style,
        inList || node.type === 'listItem',
      );
    if (block)
      b.flush(
        node.type === 'heading'
          ? node.depth === 1 && b.blocks.length === 0
            ? 'title'
            : 'heading'
          : inList
            ? 'list'
            : 'paragraph',
        node.depth,
      );
  }
  visit(fromMarkdown(source));
  const doc = b.finish(name);
  if (!doc.text.trim())
    throw new Error('This Markdown file contains no readable text. Your existing work is safe.');
  return doc;
}
