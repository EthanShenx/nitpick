import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseMarkdown } from '../src/core/markdown';
import { parseLatex } from '../src/core/latex';
import { anchorAt } from '../src/core/model';
import { newProject as createDefaultProject, defaultFilters } from '../src/core/types';
// These fixture projects intentionally omit app-wide defaults.
const newProject = (doc: Parameters<typeof createDefaultProject>[0]) =>
  createDefaultProject(doc, { defaultSuggestions: false });
import type { Project, Action, Annotation } from '../src/core/types';
import {
  rangesOverlap,
  overlapGroups,
  overlappingIds,
  overlappingAnnotations,
} from '../src/core/overlap';
import { inlineExport, listMarkdown, jsonExport } from '../src/core/export';
import { parseProject, serializeProject } from '../src/core/storage';
import { Paper } from '../src/components/Paper';
const fresh = () =>
  newProject(parseMarkdown('The quick brown fox jumps over the fence.\n\nAnother paragraph.'));
function mark(p: Project, start: number, end: number, type: Action = 'Comment'): Annotation {
  const a: Annotation = {
    id: `E${p.annotations.length + 1}`,
    type,
    scope: 'selection',
    anchor: anchorAt(p.doc, start, end),
    note: `Instruction ${p.annotations.length + 1}`,
    replacement: 'new wording',
    placement: 'after',
    createdAt: p.annotations.length,
  };
  p.annotations.push(a);
  return a;
}
describe('overlapping word selections', () => {
  it('distinguishes touching selections from partial, nested and exact overlaps', () => {
    expect(rangesOverlap({ start: 0, end: 5 }, { start: 5, end: 9 })).toBe(false);
    for (const b of [
      { start: 3, end: 8 },
      { start: 1, end: 4 },
      { start: 0, end: 5 },
    ])
      expect(rangesOverlap({ start: 0, end: 5 }, b)).toBe(true);
  });
  it('groups transitive overlaps without modifying their exact anchors', () => {
    const p = fresh();
    mark(p, 4, 15, 'Delete');
    mark(p, 10, 19, 'Replace');
    mark(p, 16, 25, 'Keep');
    mark(p, 25, 30);
    const before = JSON.stringify(p.annotations);
    const groups = overlapGroups(p.annotations);
    expect(groups.map((g) => [g.start, g.end, g.annotations.length])).toEqual([
      [4, 25, 3],
      [25, 30, 1],
    ]);
    expect(JSON.stringify(p.annotations)).toBe(before);
    expect(overlappingIds(p.annotations)).toEqual(new Set(['E1', 'E2', 'E3']));
  });
  it('keeps each nested/identical note independently across saving, deletion, and filters', () => {
    const p = fresh();
    const outer = mark(p, 4, 19, 'Delete');
    const inner = mark(p, 10, 15, 'Keep');
    mark(p, 10, 15, 'Comment');
    expect(overlappingAnnotations(inner.anchor, p.annotations, inner.id)).toHaveLength(2);
    const reopened = parseProject(serializeProject(p));
    expect(reopened.annotations.map((a) => a.anchor.quote)).toEqual([
      'quick brown fox',
      'brown',
      'brown',
    ]);
    reopened.annotations = reopened.annotations.filter((a) => a.id !== inner.id);
    expect(reopened.annotations.find((a) => a.id === outer.id)?.anchor).toEqual(outer.anchor);
    expect(
      listMarkdown(reopened, {
        ...p.exportSettings,
        filters: { ...defaultFilters, type: 'Delete' },
      }),
    ).toContain('quick brown fox');
  });
  it('renders shared segments once, exposes the chooser, and uses the active note styling', () => {
    const p = fresh();
    mark(p, 4, 15, 'Delete');
    const chosen = mark(p, 10, 19, 'Comment');
    mark(p, 10, 15, 'Keep');
    const html = renderToStaticMarkup(
      createElement(Paper, {
        doc: p.doc,
        annotations: p.annotations,
        filters: defaultFilters,
        active: chosen.id,
        onScope: () => {},
        onJump: () => {},
        onOverlap: () => {},
      }),
    );
    expect(html).toContain('data-overlap-count="3"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toMatch(/class="run\s+mark-comment mark-overlap mark-active"/);
    expect(html.match(/>brown<\//g)).toHaveLength(1);
  });
  it('keeps the entire original shared passage intact and every instruction once in inline exports', () => {
    const p = fresh();
    mark(p, 4, 15, 'Delete');
    mark(p, 10, 19, 'Replace');
    mark(p, 10, 15, 'Keep');
    const ai = inlineExport(p, { ...p.exportSettings, instructions: '', layout: 'inline' });
    expect(ai).toContain('The quick brown fox');
    expect(ai).not.toContain('{--');
    expect(ai).not.toContain('{~~');
    expect(ai).toContain('[E1]');
    expect(ai).toContain('[E2]');
    expect(ai).toContain('[E3]');
    expect(ai.replace(/\{>>[\s\S]*?<<\}/g, '').trim()).toBe(p.doc.text);
    for (const a of p.annotations) expect(ai.split(a.note)).toHaveLength(2);
    const html = inlineExport(p, { ...p.exportSettings, audience: 'people', layout: 'inline' });
    expect(html).toContain('<span class="overlap-text">quick brown fox</span>');
    expect(html).not.toContain('<del>');
    expect(html).not.toContain('<ins>');
    expect(html).toContain('"quick brown"');
    expect(html).toContain('"brown fox"');
    expect(html).toContain('"brown"');
  });
  it('preserves normal CriticMarkup for adjacent, non-overlapping edits', () => {
    const p = fresh();
    mark(p, 4, 9, 'Delete');
    mark(p, 9, 15, 'Replace');
    const text = inlineExport(p, { ...p.exportSettings, layout: 'inline' });
    expect(text).toContain('{--quick--}');
    expect(text).toContain('{~~ brown~>new wording~~}');
    expect(text).not.toContain('overlapping annotation');
  });
  it('lists complete quotes with peer references, with no machine IDs in the people list', () => {
    const p = fresh();
    mark(p, 4, 15, 'Delete');
    mark(p, 10, 19, 'Comment');
    const ai = listMarkdown(p, p.exportSettings);
    expect(ai).toContain('Overlaps: [E2]');
    expect(ai).toContain('Overlaps: [E1]');
    const people = listMarkdown(p, { ...p.exportSettings, audience: 'people' });
    expect(people).toContain('"quick brown"');
    expect(people).toContain('"brown fox"');
    expect(people).not.toMatch(/\[E\d\]/);
    expect(JSON.parse(jsonExport(p, p.exportSettings)).edits[0].overlapsWith).toEqual(['E2']);
  });
  it('does not silently drop edits on reused LaTeX input source', () => {
    const doc = parseLatex(
      { 'main.tex': '\\input{part}\n\n\\input{part}', 'part.tex': 'Repeated source sentence.' },
      'main.tex',
    );
    const p = newProject(doc);
    const first = doc.text.indexOf('source'),
      second = doc.text.indexOf('source', first + 1);
    mark(p, first, first + 6, 'Delete');
    mark(p, second, second + 6, 'Keep');
    expect(overlappingIds(p.annotations)).toHaveLength(0);
    expect(overlappingIds(p.annotations, true)).toEqual(new Set(['E1', 'E2']));
    const out = inlineExport(p, { ...p.exportSettings, layout: 'inline' });
    expect(out).toContain('[E1]');
    expect(out).toContain('[E2]');
    expect(out).not.toContain('{--');
    expect(out).toContain('overlapping source');
  });
  it('keeps global suggestions outside text overlap groups and includes them in exports and portable saves', () => {
    const p = fresh();
    mark(p, 4, 15, 'Delete');
    const global: Annotation = {
      id: 'D1',
      type: 'Comment',
      scope: 'document',
      anchor: anchorAt(p.doc, 0, 0),
      note: 'Eliminate unnecessary transitions throughout.',
      replacement: '',
      placement: 'after',
      createdAt: 3,
    };
    p.annotations.push(global);
    expect(overlapGroups(p.annotations)).toHaveLength(1);
    expect(overlappingAnnotations(p.annotations[0].anchor, p.annotations)).not.toContain(global);
    const saved = parseProject(serializeProject(p));
    expect(listMarkdown(saved, saved.exportSettings)).toContain(
      '## DOCUMENT\n\n- [D1] COMMENT: the whole document\n  Instruction: Eliminate unnecessary transitions throughout.',
    );
    expect(inlineExport(saved, { ...saved.exportSettings, layout: 'inline' })).toContain(
      'DOCUMENT COMMENT: Eliminate unnecessary transitions throughout.',
    );
  });
});
