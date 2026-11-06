import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { parseMarkdown } from '../src/core/markdown';
import { anchorAt, sourceQuote } from '../src/core/model';
import { importDocument, MainFileChoice } from '../src/core/import';
import { newProject as createDefaultProject } from '../src/core/types';
// These fixture projects intentionally omit app-wide defaults.
const newProject = (doc: Parameters<typeof createDefaultProject>[0]) =>
  createDefaultProject(doc, { defaultSuggestions: false });
import { parseProject, serializeProject } from '../src/core/storage';
describe('import boundaries and source fidelity', () => {
  it('maps Markdown escapes, entities, emphasis and Unicode to their own exact source fragments', () => {
    const raw = '# Essay\n\nA \\*literal\\* &amp; 中文 👩‍🔬 and **bold** word.\n';
    const d = parseMarkdown(raw);
    for (const text of ['literal', '中文', '👩‍🔬', 'bold', 'word']) {
      const start = d.text.indexOf(text);
      const a = anchorAt(d, start, start + text.length);
      expect(a.quote).toBe(text);
      expect(sourceQuote(d, a)).toBe(text);
    }
    const amp = d.text.indexOf('&');
    expect(sourceQuote(d, anchorAt(d, amp, amp + 1))).toBe('&amp;');
    expect(d.warnings).toEqual([]);
  });
  it('keeps code and list content without snapping ordinary prose to an entire paragraph', () => {
    const d = parseMarkdown(
      '- One item\n- Two items\n\nUse `one two` here.\n\n```txt\ncode 中文\n```',
    );
    expect(d.blocks.filter((b) => b.kind === 'list')).toHaveLength(2);
    const i = d.text.indexOf('two');
    expect(anchorAt(d, i, i + 3).quote).toBe('two');
    expect(sourceQuote(d, anchorAt(d, i, i + 3))).toBe('two');
    expect(d.text).toContain('code 中文');
  });
  it('preserves every original ZIP byte including uninterpreted project files', async () => {
    const bytes = zipSync({
      'paper/main.tex': strToU8(
        '\\documentclass{article}\\begin{document}Hello \\input{part}\\end{document}',
      ),
      'paper/part.tex': strToU8('included 中文.'),
      'paper/custom.bst': strToU8('uninterpreted'),
      'paper/diagram.png': new Uint8Array([137, 80, 78, 71]),
    });
    const doc = await importDocument(new File([bytes], 'paper.zip'));
    expect(doc.text).toContain('Hello included 中文.');
    expect(doc.assets['paper/diagram.png']).toMatch(/^data:image\/png;base64,/);
    expect(doc.original?.data).toBe(Buffer.from(bytes).toString('base64'));
    const reopened = parseProject(serializeProject(newProject(doc)));
    expect(reopened.doc).toEqual(JSON.parse(JSON.stringify(doc)));
  });
  it('asks for an ambiguous main file without discarding project resources', async () => {
    const bytes = zipSync({
      'one.tex': strToU8('\\documentclass{article} One'),
      'two.tex': strToU8('\\documentclass{article} Two'),
    });
    try {
      await importDocument(new File([bytes], 'paper.zip'));
      throw new Error('Expected a main-file choice');
    } catch (e) {
      expect(e).toBeInstanceOf(MainFileChoice);
      expect((e as MainFileChoice).candidates).toEqual(['one.tex', 'two.tex']);
      expect((e as MainFileChoice).originalData).toBeTruthy();
    }
  });
  it('rejects empty Markdown and excluded/invalid files safely', async () => {
    expect(() => parseMarkdown(' \n\n')).toThrow('no readable text');
    await expect(importDocument(new File(['pdf'], 'paper.pdf'))).rejects.toThrow(
      'Could not open this PDF',
    );
    await expect(importDocument(new File(['bad'], 'bad.zip'))).rejects.toThrow();
  });
  it('rejects damaged portable locations, run geometry, and image references', () => {
    const p = newProject(parseMarkdown('A paragraph.'));
    for (const mutate of [
      (x: any) => {
        x.doc.blocks[0].heading = { invalid: true };
      },
      (x: any) => {
        x.doc.blocks[0].start = 99;
      },
      (x: any) => {
        x.doc.blocks[0].level = 'invalid';
      },
      (x: any) => {
        x.doc.blocks[0].runs[0].kind = 'image';
        x.doc.blocks[0].runs[0].image = 'missing.png';
      },
    ]) {
      const broken = JSON.parse(serializeProject(p));
      mutate(broken);
      expect(() => parseProject(JSON.stringify(broken))).toThrow('damaged');
    }
    expect(parseProject(serializeProject(p)).doc.text).toBe('A paragraph.');
  });
});
