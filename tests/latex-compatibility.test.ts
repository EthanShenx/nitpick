import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { parseLatex } from '../src/core/latex';
import { anchorAt, sourceQuote } from '../src/core/model';
import { readBibliography } from '../src/core/bibliography';
import {
  importDocument,
  importLatexFolder,
  LatexProjectRequired,
  MainFileChoice,
} from '../src/core/import';
import { parseProject, serializeProject } from '../src/core/storage';
import { newProject as createDefaultProject } from '../src/core/types';
// These fixture projects intentionally omit app-wide defaults.
const newProject = (doc: Parameters<typeof createDefaultProject>[0]) =>
  createDefaultProject(doc, { defaultSuggestions: false });
import { listMarkdown } from '../src/core/export';
import { unzipSync } from 'fflate';
const root = 'samples/latex-compatibility/';
const paths = [
  'main.tex',
  'library.bib',
  'images/logo.svg',
  ...readdirSync(root + 'sections').map((p) => 'sections/' + p),
];
const files = Object.fromEntries(
  paths.filter((p) => /\.(tex|bib)$/.test(p)).map((p) => [p, readFileSync(root + p, 'utf8')]),
);
const assets = {
  'images/logo.svg':
    'data:image/svg+xml;base64,' + readFileSync(root + 'images/logo.svg').toString('base64'),
};
const load = () => parseLatex(files, 'main.tex', assets);

describe('multi-file academic LaTeX compatibility', () => {
  it('renders cover, essay, captions, references and complete longtable contents', () => {
    const doc = load();
    for (const text of [
      'Reading the Cell: A Review',
      'Author: Reader 中文',
      'Cell states',
      '(Reader et al., 2025)',
      'Reader et al. (2025)',
      '(see Reader et al., 2025, p. 3)',
      'YAP–AP-1',
      '“memory”',
      'Figure 1 and Table 1',
      'A complete figure caption.',
      'Lineage tracing supports a reversible programme.',
      'Independent evidence with 中文 text.',
      'Abbreviations:',
      'https://doi.org/10.0000/example',
    ])
      expect(doc.text).toContain(text);
    expect(doc.text).not.toContain('Unsupported');
    expect(doc.blocks.filter((b) => b.kind === 'title')).toHaveLength(1);
    expect(doc.text).not.toContain('SomeFont');
    expect(doc.text).not.toContain('textwidth');
    expect(doc.text.match(/References/g)).toHaveLength(1);
    expect(doc.blocks.flatMap((b) => b.runs).find((r) => r.kind === 'image')?.image).toBe(
      'images/logo.svg',
    );
    expect(doc.text).toContain('PDF figure: Figure1.pdf');
    const table = doc.blocks.find((b) => b.kind === 'table')!;
    expect(doc.text.slice(table.start, table.end)).toContain('Independent evidence');
    expect(table.runs.filter((r) => r.text === '\t').length).toBeGreaterThanOrEqual(4);
  });
  it('preserves exact source mapping for every ordinary run and atomic transformed construct', () => {
    const doc = load();
    for (const run of doc.blocks.flatMap((b) => b.runs)) {
      expect(run.source).toBeDefined();
      const range = run.source!;
      expect(range.start).toBeGreaterThanOrEqual(0);
      expect(range.end).toBeLessThanOrEqual(files[range.file].length);
      if (!run.atomic) expect(files[range.file].slice(range.start, range.end)).toBe(run.text);
      else
        expect(sourceQuote(doc, anchorAt(doc, run.start, run.end))).toBe(
          files[range.file].slice(range.start, range.end),
        );
    }
    for (const [quote, source] of [
      ['(Reader et al., 2025)', '\\parencite{reader2025}'],
      ['–', '--'],
      ['“', '``'],
      ['A complete figure caption.', 'A complete figure caption.'],
      ['Lineage tracing supports', 'Lineage tracing supports'],
    ] as const) {
      const i = doc.text.indexOf(quote);
      expect(sourceQuote(doc, anchorAt(doc, i, i + quote.length))).toBe(source);
    }
    const start = doc.text.lastIndexOf('Repeated phrase.');
    expect(sourceQuote(doc, anchorAt(doc, start, start + 16))).toBe('Repeated phrase.');
    expect(anchorAt(doc, start, start + 16).source[0].start).toBe(
      files['sections/essay.tex'].lastIndexOf('Repeated phrase.'),
    );
  });
  it('keeps paragraph ranges and source quotes through save/reopen/export', () => {
    const p = newProject(load());
    const start = p.doc.text.indexOf('Repeated phrase.');
    const end =
      p.doc.text.indexOf('The second occurrence must map here.') +
      'The second occurrence must map here.'.length;
    p.annotations.push({
      id: 'E1',
      type: 'Comment',
      scope: 'selection',
      anchor: anchorAt(p.doc, start, end),
      note: 'Review all of this',
      replacement: '',
      placement: 'after',
      createdAt: 0,
    });
    const restored = parseProject(serializeProject(p));
    expect(restored.doc).toEqual(JSON.parse(JSON.stringify(p.doc)));
    const a = restored.annotations[0];
    expect(a.anchor.quote).toBe(p.doc.text.slice(start, end));
    expect(listMarkdown(restored, { ...restored.exportSettings, audience: 'people' })).toContain(
      a.anchor.quote,
    );
    expect(listMarkdown(restored, restored.exportSettings)).toContain(
      sourceQuote(restored.doc, a.anchor),
    );
  });
  it('guides standalone main-file imports to the complete project before replacing work', async () => {
    const file = new File([files['main.tex']], 'main.tex');
    await expect(importDocument(file)).rejects.toBeInstanceOf(LatexProjectRequired);
    const partial = await importDocument(file, undefined, true);
    expect(partial.text).toContain('Missing input: sections/essay');
    // Commented inputs should not trigger a request for additional files.
    expect((await importDocument(new File(['% \\input{not-used}\nHello'], 'one.tex'))).text).toBe(
      'Hello',
    );
  });
  it('imports a folder with dependencies and preserves every original byte in the portable archive', async () => {
    const selected = paths.map((path) => {
      const file = new File([readFileSync(root + path)], path.split('/').at(-1)!);
      Object.defineProperty(file, 'webkitRelativePath', { value: 'project/' + path });
      return file;
    });
    const doc = await importLatexFolder(selected);
    expect(doc.main).toBe('project/main.tex');
    expect(doc.text).toContain('Independent evidence with 中文 text.');
    const original = unzipSync(new Uint8Array(Buffer.from(doc.original!.data, 'base64')));
    for (const path of paths)
      expect(Buffer.from(original['project/' + path])).toEqual(readFileSync(root + path));
    expect(parseProject(serializeProject(newProject(doc))).doc).toEqual(
      JSON.parse(JSON.stringify(doc)),
    );
  });
  it('retains main-file choice for folders with several documents', async () => {
    await expect(
      importLatexFolder([
        new File(['\\documentclass{article}One'], 'one.tex'),
        new File(['\\documentclass{article}Two'], 'two.tex'),
      ]),
    ).rejects.toBeInstanceOf(MainFileChoice);
  });
  it('reads nested BibTeX braces, quoted commas, and escaped delimiters without splitting fields', () => {
    const raw =
      '@article{key, title={{A}, {B} and \\{C\\}}, author="Reader, Alex and Writer, Bo", year=2025, journal={Journal}}';
    const entries = readBibliography(raw, 'refs.bib');
    expect(entries).toHaveLength(1);
    expect(entries[0].fields.title).toBe('{A}, {B} and \\{C\\}');
    expect(entries[0].fields.author).toBe('Reader, Alex and Writer, Bo');
    expect(entries[0].fields.year).toBe('2025');
    expect(raw.slice(entries[0].source.start, entries[0].source.end)).toBe(raw);
  });
});
