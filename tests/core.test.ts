import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { readFileSync, readdirSync } from 'node:fs';
import { parseMarkdown } from '../src/core/markdown';
import { parseLatex } from '../src/core/latex';
import { anchorAt, blockAnchor, sourceQuote, context, location } from '../src/core/model';
import { defaultFilters, newProject as createDefaultProject } from '../src/core/types';
// These fixture projects intentionally omit app-wide defaults.
const newProject = (doc: Parameters<typeof createDefaultProject>[0]) =>
  createDefaultProject(doc, { defaultSuggestions: false });
import type { Action, Annotation, Project, Scope } from '../src/core/types';
import { parseProject, serializeProject, saveLocal, recentProjects } from '../src/core/storage';
import {
  listMarkdown,
  exportText,
  filteredAnnotations,
  inlineExport,
  exportDocx,
} from '../src/core/export';
const source =
  '# A paper\n\n## Background\n\nRepeat this. A sentence with 中文 and **bold** text.\n\nRepeat this. Another sentence.\n\n' +
  'Long words, with punctuation! '.repeat(30) +
  '\n\nFinal paragraph.\n';
function project() {
  return newProject(parseMarkdown(source));
}
function add(p: Project, type: Action, quote: string, scope: Scope = 'selection', occurrence = 0) {
  let start = -1;
  for (let i = 0; i <= occurrence; i++) start = p.doc.text.indexOf(quote, start + 1);
  if (start < 0) throw new Error('missing quote');
  const a: Annotation = {
    id: `E${p.annotations.length + 1}`,
    type,
    scope,
    anchor: anchorAt(p.doc, start, start + quote.length),
    note: 'A specific instruction.',
    replacement: 'New text 中文',
    placement: 'after',
    createdAt: 1,
  };
  p.annotations.push(a);
  return a;
}
describe('anchors', () => {
  it('distinguishes repeated occurrences with exact source offsets', () => {
    const p = project(),
      a = add(p, 'Delete', 'Repeat this.', 'selection', 1);
    expect(a.anchor.paragraph).toBe(2);
    expect(a.anchor.source[0].start).toBe(source.lastIndexOf('Repeat this.'));
    expect(sourceQuote(p.doc, a.anchor)).toBe('Repeat this.');
  });
  it('retains a long multi-paragraph quote and correct paragraph range', () => {
    const p = project();
    const blocks = p.doc.blocks.filter((b) => b.kind === 'paragraph');
    const a = anchorAt(p.doc, blocks[0].start, blocks[2].end);
    expect(a.quote).toBe(p.doc.text.slice(blocks[0].start, blocks[2].end));
    expect(a.quote.length).toBeGreaterThan(900);
    expect(location(a, p.doc)).toBe('paragraphs 1-3, section 1 ("Background")');
    p.annotations.push({
      id: 'E1',
      type: 'Comment',
      scope: 'selection',
      anchor: a,
      note: 'Review',
      replacement: '',
      placement: 'after',
      createdAt: 0,
    });
    for (const audience of ['ai', 'people'] as const)
      expect(listMarkdown(p, { ...p.exportSettings, audience })).toContain(a.quote);
  });
  it('anchors a full paragraph or section and preserves emphasis coordinates', () => {
    const p = project();
    const b = p.doc.blocks.find((b) => b.kind === 'paragraph')!;
    expect(blockAnchor(p.doc, b).quote).toBe(p.doc.text.slice(b.start, b.end));
    expect(blockAnchor(p.doc, b, true).quote).toContain('Final paragraph.');
    const i = p.doc.text.indexOf('bold');
    expect(sourceQuote(p.doc, anchorAt(p.doc, i, i + 4))).toBe('bold');
  });
  it('uses full containing sentence, or adjacent sentences for whole-sentence selection', () => {
    const p = project(),
      i = p.doc.text.indexOf('中文');
    expect(context(p.doc, anchorAt(p.doc, i, i + 2))).toBe('A sentence with 中文 and bold text.');
    const end = p.doc.text.indexOf('Another sentence.') + 'Another sentence.'.length;
    const a = anchorAt(p.doc, p.doc.text.indexOf('Another sentence.'), end);
    expect(context(p.doc, a)).toContain('Repeat this.');
    expect(context(p.doc, a)).toContain('Long words, with punctuation!');
  });
  it('uses paragraph alone for heading-free documents', () => {
    const d = parseMarkdown('One.\n\nTwo.');
    expect(location(anchorAt(d, 6, 10), d)).toBe('paragraph 2');
  });
});
describe('LaTeX mapping', () => {
  const files = Object.fromEntries(
    readdirSync('samples/latex')
      .filter((x) => x.endsWith('.tex'))
      .map((f) => [f, readFileSync(`samples/latex/${f}`, 'utf8')]),
  );
  it('maps math, macros and included content to their invocation sources', () => {
    const d = parseLatex(files, 'main.tex');
    for (const r of d.blocks.flatMap((b) => b.runs)) {
      if (!r.source) continue;
      expect(r.source.end).toBeLessThanOrEqual(files[r.source.file].length);
      if (!r.atomic) expect(files[r.source.file].slice(r.source.start, r.source.end)).toBe(r.text);
      if (r.atomic && r.text.length > 2)
        expect(anchorAt(d, r.start + 1, r.end - 1).quote).toBe(r.text);
    }
    const i = d.text.indexOf('Included text');
    expect(anchorAt(d, i, i + 13).source[0].file).toBe('conclusion.tex');
    const macro = d.blocks.flatMap((b) => b.runs).find((r) => r.text === 'exact anchors')!;
    expect(sourceQuote(d, anchorAt(d, macro.start, macro.end))).toBe('\\term{exact anchors}');
  });
  it('retains every list item and its exact source, including styled content', () => {
    const d = parseLatex(files, 'main.tex');
    for (const word of ['First item.', 'Second item', 'bold text']) {
      const start = d.text.indexOf(word);
      expect(start).toBeGreaterThan(0);
      expect(sourceQuote(d, anchorAt(d, start, start + word.length))).toBe(word);
    }
    expect(d.blocks.filter((b) => b.kind === 'list')).toHaveLength(2);
  });
  it('never drops unknown environments, missing and circular inputs', () => {
    const d = parseLatex(
      {
        'main.tex':
          '\\section{Hi} Before \\begin{tikzpicture}magic\\end{tikzpicture} After \\input{missing} \\input{main}',
      },
      'main.tex',
    );
    expect(d.text).toContain('Unsupported environment: tikzpicture');
    expect(d.text).toContain('Missing input: missing');
    expect(d.text).toContain('Circular input: main.tex');
  });
  it('quotes LaTeX source for AI and displayed expansion for people', () => {
    const p = newProject(parseLatex(files, 'main.tex'));
    const a = add(p, 'Replace', 'exact anchors');
    expect(listMarkdown(p, p.exportSettings)).toContain('"\\term{exact anchors}"');
    expect(listMarkdown(p, { ...p.exportSettings, audience: 'people' })).toContain(
      '"exact anchors"',
    );
    expect(inlineExport(p, { ...p.exportSettings, layout: 'inline' })).toContain(
      '{~~\\term{exact anchors}~>New text 中文~~}',
    );
    expect(a.anchor.source[0].file).toBe('main.tex');
  });
});
describe('portable projects and autosave', () => {
  it('round trips source, assets, incomplete moves, notes, filters, position and settings', async () => {
    const p = project();
    add(p, 'Move', 'Repeat this.');
    p.doc.assets['test.png'] = 'data:image/png;base64,aGVsbG8=';
    p.filters = { preset: 'Larger changes', type: 'Move', scope: 'all' };
    p.scroll = 342;
    p.notes.push('Reusable 中文');
    p.exportSettings.instructions = 'My instructions';
    p.revision = 13;
    p.editingId = p.annotations[0].id;
    const restored = parseProject(serializeProject(p));
    expect(restored).toMatchObject({
      ...JSON.parse(JSON.stringify(p)),
      updatedAt: expect.any(Number),
      fileRevision: 13,
    });
    await saveLocal(restored);
    expect((await recentProjects()).find((x) => x.id === p.id)).toEqual(restored);
  });
  it('rejects malformed, future, and corrupted files without changing existing work', () => {
    const p = project(),
      original = serializeProject(p);
    expect(() => parseProject('{oops')).toThrow('valid');
    expect(() => parseProject('{"format":"nitpick","version":99}')).toThrow('newer');
    const broken = JSON.parse(original);
    broken.doc.blocks[0].runs[0].text = 'tampered';
    expect(() => parseProject(JSON.stringify(broken))).toThrow('damaged');
    expect(serializeProject(p)).toBe(original);
  });
});
describe('exports', () => {
  it('supports every action, scope, audience, layout, preset and JSON', () => {
    const p = project();
    for (const type of [
      'Delete',
      'Replace',
      'Insert',
      'Move',
      'Comment',
      'Keep',
      'Verify',
    ] as Action[])
      for (const scope of ['selection', 'paragraph', 'section', 'document'] as Scope[]) {
        const a = add(p, type, 'Repeat this.', scope);
        if (type === 'Move')
          a.destination = anchorAt(p.doc, p.doc.text.indexOf('Final'), p.doc.text.length);
      }
    for (const audience of ['ai', 'people'] as const)
      for (const layout of ['list', 'inline'] as const)
        for (const preset of ['Everything', 'Small edits', 'Larger changes'] as const) {
          const s = {
            ...p.exportSettings,
            audience,
            layout,
            filters: { ...defaultFilters, preset },
          };
          expect(exportText(p, s)).toBeTruthy();
          if (layout === 'list') expect(exportText(p, s)).toContain('Repeat this.');
        }
    expect(
      filteredAnnotations(p, {
        ...p.exportSettings,
        filters: { preset: 'Small edits', type: 'all', scope: 'all' },
      }),
    ).toHaveLength(3);
    expect(
      filteredAnnotations(p, {
        ...p.exportSettings,
        filters: { preset: 'Larger changes', type: 'all', scope: 'all' },
      }),
    ).toHaveLength(25);
    expect(JSON.parse(exportText(p, { ...p.exportSettings, format: 'json' })).edits).toHaveLength(
      28,
    );
    const people = listMarkdown(p, { ...p.exportSettings, audience: 'people' });
    expect(people).not.toContain('[E1]');
    expect(people).toContain('Adjacent text before:');
    expect(people).toContain('paragraph 4');
  });
  it('generates all four CriticMarkup forms and labeled Move, Keep and Verify notes', () => {
    for (const [type, token] of [
      ['Delete', '{--Repeat this.--}'],
      ['Replace', '{~~Repeat this.~>New text 中文~~}'],
      ['Insert', '{++New text 中文++}'],
      ['Comment', '{>>A specific instruction.<<}'],
      ['Move', 'MOVE:'],
      ['Keep', 'KEEP:'],
      ['Verify', 'VERIFY:'],
    ] as [Action, string][]) {
      const p = project();
      add(p, type, 'Repeat this.');
      expect(inlineExport(p, { ...p.exportSettings, layout: 'inline' })).toContain(token);
    }
  });
  it('preserves original characters with overlaps and produces escaped printable HTML', () => {
    const p = project();
    add(p, 'Delete', 'Repeat this.');
    add(p, 'Replace', 'this.');
    const html = inlineExport(p, { ...p.exportSettings, layout: 'inline', audience: 'people' });
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Repeat this.');
    expect(html).toContain('<blockquote>');
  });
  it('exports a real Word archive', async () => {
    const p = project();
    add(p, 'Comment', 'Repeat this.');
    const blob = await exportDocx(p, p.exportSettings);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect([...bytes.slice(0, 2)]).toEqual([80, 75]);
  });
});
