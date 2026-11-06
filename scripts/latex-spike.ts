import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import katex from 'katex';
import { parseLatex } from '../src/core/latex';
import { anchorAt, sourceQuote } from '../src/core/model';
const files = Object.fromEntries(
  readdirSync('samples/latex')
    .filter((f) => f.endsWith('.tex'))
    .map((f) => [f, readFileSync(`samples/latex/${f}`, 'utf8')]),
);
const doc = parseLatex(files, 'main.tex', {
  'diagram.svg':
    'data:image/svg+xml;base64,' + readFileSync('samples/latex/diagram.svg').toString('base64'),
});
for (const word of [
  'Repeated phrase.',
  '中文文本',
  'after.',
  'exact anchors',
  'Included text',
  'First item.',
  'Second item',
  'bold text',
  'This is the complete footnote.',
  'smith2024',
]) {
  const start = doc.text.indexOf(word);
  assert(start >= 0, word);
  const a = anchorAt(doc, start, start + word.length);
  const raw = sourceQuote(doc, a);
  assert(raw.includes(word) || raw === '\\term{exact anchors}', `${word} maps to ${raw}`);
}
const second = doc.text.indexOf('Repeated phrase.', doc.text.indexOf('Repeated phrase.') + 1);
assert.equal(
  anchorAt(doc, second, second + 16).source[0].start,
  files['main.tex'].indexOf('Repeated phrase.', files['main.tex'].indexOf('Repeated phrase.') + 1),
);
const macro = doc.blocks
  .flatMap((b) => b.runs)
  .find((r) => r.text === 'careful reading' && r.atomic)!;
assert.equal(sourceQuote(doc, anchorAt(doc, macro.start + 1, macro.end - 1)), '\\study{}');
for (const r of doc.blocks.flatMap((b) => b.runs).filter((r) => r.kind === 'math')) {
  katex.renderToString(r.math!, { throwOnError: true });
  assert.equal(anchorAt(doc, r.start + 1, r.end - 1).start, r.start);
  assert.match(sourceQuote(doc, anchorAt(doc, r.start, r.end)), /\$|\\\[/);
}
assert(doc.text.includes('[Unsupported environment: tikzpicture]'));
assert(doc.blocks.flatMap((b) => b.runs).some((r) => r.kind === 'image'));
assert(doc.blocks.flatMap((b) => b.runs).some((r) => r.source?.file === 'conclusion.tex'));
const result = {
  result: 'PASS',
  blocks: doc.blocks.length,
  characters: doc.text.length,
  warnings: doc.warnings,
  features: [
    'Unicode',
    'repeated occurrences',
    'inline and display math',
    'custom macros',
    'sections',
    'citations',
    'footnotes',
    'lists',
    'table content',
    'figure images',
    'input source file attribution',
    'atomic unsupported placeholders',
  ],
};
writeFileSync('samples/latex/spike-result.json', JSON.stringify(result, null, 2));
console.log(result);
