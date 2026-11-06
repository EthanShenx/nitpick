import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseLatex } from '../src/core/latex';
import { referencedPdfFigures, prepareFigureAssets } from '../src/core/figure-assets';
import { documentOutline, sectionLabel, headingLevel } from '../src/core/outline';
import { anchorAt, sourceQuote, location, blockAnchor } from '../src/core/model';
import { newProject as createDefaultProject } from '../src/core/types';
// These fixture projects intentionally omit app-wide defaults.
const newProject = (doc: Parameters<typeof createDefaultProject>[0]) =>
  createDefaultProject(doc, { defaultSuggestions: false });
import { serializeProject, parseProject } from '../src/core/storage';
import { listMarkdown } from '../src/core/export';
import { DocumentOutline } from '../src/components/DocumentOutline';
const source = readFileSync('samples/pdf-figures/main.tex', 'utf8');
const files = { 'paper/main.tex': source };
const bytes = new Uint8Array(readFileSync('samples/pdf-figures/figures/two-pages.pdf'));
const entries = {
  'paper/figures/two-pages.pdf': bytes,
  'paper/main.pdf': bytes,
  'paper/unrelated.pdf': bytes,
};
const png = 'data:image/png;base64,aW1hZ2U=';

describe('bundled PDF figures and heading hierarchy', () => {
  it('recognizes layout-only font and spacing switches without losing surrounding prose or source coordinates', () => {
    const d = parseLatex(files, 'paper/main.tex');
    expect(d.text).not.toContain('Unsupported command');
    expect(d.text).not.toContain('0.96');
    const i = d.text.indexOf('Plain prose');
    expect(sourceQuote(d, anchorAt(d, i, i + 11))).toBe('Plain prose');
    expect(d.blocks.filter((b) => b.kind === 'heading').map((b) => b.level)).toEqual([2, 3, 4, 2]);
  });
  it('builds real nested outline lists, with sibling reset and matching export locations', () => {
    const d = parseLatex(files, 'paper/main.tex');
    const roots = documentOutline(d);
    expect(roots.map((r) => r.number)).toEqual(['1', '2']);
    expect(roots[0].children[0].number).toBe('1.1');
    expect(roots[0].children[0].children[0].number).toBe('1.1.1');
    const heading = d.blocks.find((b) => b.heading === 'Details')!;
    expect(sectionLabel(d, heading.section)).toBe('1.1.1');
    expect(location(anchorAt(d, heading.start, heading.end), d)).toContain(
      'section 1.1.1 ("Details")',
    );
    const html = renderToStaticMarkup(createElement(DocumentOutline, { doc: d, onNavigate() {} }));
    expect(html.match(/class="outline-children"/g)).toHaveLength(2);
    const section = blockAnchor(d, roots[0].block, true);
    expect(section.quote).toContain('Precise source-backed prose');
    expect(section.quote).not.toContain('Conclusion');
    const p = newProject(d);
    p.annotations.push({
      id: 'S1',
      type: 'Comment',
      scope: 'section',
      anchor: blockAnchor(d, heading, true),
      note: 'Review details.',
      replacement: '',
      placement: 'after',
      createdAt: 0,
    });
    expect(listMarkdown(p, p.exportSettings)).toContain('SECTION 1.1.1 ("Details")');
  });
  it('recovers subsubsection depth from the source of older saved models without changing anchors', () => {
    const d = parseLatex(files, 'paper/main.tex');
    const heading = d.blocks.find((b) => b.heading === 'Details')!;
    heading.level = 3; // Older importer flattened subsubsection to subsection.
    const original = JSON.stringify(anchorAt(d, heading.start, heading.end));
    expect(headingLevel(d, heading)).toBe(4);
    expect(sectionLabel(d, heading.section)).toBe('1.1.1');
    expect(JSON.stringify(anchorAt(d, heading.start, heading.end))).toBe(original);
  });
  it('prepares only referenced PDFs, resolves graphicspath/input paths, and keeps figures atomic and portable', async () => {
    expect(referencedPdfFigures(files, 'paper/main.tex', entries)).toEqual([
      'paper/figures/two-pages.pdf',
    ]);
    const assets: Record<string, string> = {};
    let calls = 0;
    expect(
      await prepareFigureAssets(files, 'paper/main.tex', entries, assets, async (data) => {
        expect(data).toBe(bytes);
        calls++;
        return png;
      }),
    ).toEqual([]);
    expect(calls).toBe(1);
    const d = parseLatex(files, 'paper/main.tex', assets);
    const r = d.blocks.flatMap((b) => b.runs).find((r) => r.kind === 'image')!;
    expect(r.image).toBe('paper/figures/two-pages.pdf');
    expect(sourceQuote(d, anchorAt(d, r.start + 1, r.end - 1))).toBe(
      '\\includegraphics[width=\\textwidth]{two-pages.pdf}',
    );
    expect(parseProject(serializeProject(newProject(d))).doc.assets).toEqual(assets);
    const included = {
      'main.tex': '\\graphicspath{{fig/}}\\input{sub/essay}',
      'sub/essay.tex': '\\includegraphics{chart}',
    };
    expect(referencedPdfFigures(included, 'main.tex', { 'fig/chart.pdf': bytes })).toEqual([
      'fig/chart.pdf',
    ]);
  });
  it('retains the correct continued-table number in projects with several longtables', () => {
    const source = String.raw`\begin{longtable}{l}\caption{First}\\Table \thetable\ continued\\\end{longtable}\begin{longtable}{l}\caption{Second}\\Table \thetable\ continued\\\end{longtable}`;
    const doc = parseLatex({ 'main.tex': source }, 'main.tex');
    expect(doc.text).toContain('Table 1 continued');
    expect(doc.text).toContain('Table 2 continued');
  });
  it('keeps the essay and caption safe when a PDF is invalid or rendering fails', async () => {
    const assets: Record<string, string> = {};
    const warnings = await prepareFigureAssets(
      files,
      'paper/main.tex',
      entries,
      assets,
      async () => {
        throw new Error('Invalid PDF');
      },
    );
    expect(warnings[0]).toContain('Invalid PDF');
    const doc = parseLatex(files, 'paper/main.tex', assets);
    expect(doc.text).toContain('PDF figure: two-pages.pdf');
    expect(doc.text).toContain('Both pages are visible');
    expect(doc.text).toContain('Keep this conclusion.');
  });
});
