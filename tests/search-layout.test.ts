import { describe, expect, it } from 'vitest';
import { findMatches, nextMatch } from '../src/core/search';
import { defaultColumns, fitColumns, resizeColumn } from '../src/core/layout';
import { parseMarkdown } from '../src/core/markdown';
import { anchorAt } from '../src/core/model';
import { newProject } from '../src/core/types';
import { parseProject, serializeProject } from '../src/core/storage';
import { exportText } from '../src/core/export';
describe('document search', () => {
  it('finds the exact repeated occurrence using UTF-16 offsets, including Unicode and case variants', () => {
    const text = '中文 👩‍🔬 Repeat this.\n\n中文 repeat THIS.\n\nA sentence ending here.';
    const matches = findMatches(text, 'repeat this.');
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => text.slice(m.start, m.end))).toEqual([
      'Repeat this.',
      'repeat THIS.',
    ]);
    expect(matches[1].start).toBe(text.indexOf('repeat THIS.'));
    expect(findMatches(text, '中文')).toHaveLength(2);
    expect(findMatches(text, '👩‍🔬')).toEqual([{ start: 3, end: 8 }]);
    expect(findMatches(text, 'Repeat this.', true)).toHaveLength(1);
  });
  it('treats search characters literally and matches complete sentences across formatted runs and line breaks', () => {
    const text =
      'Use (a+b) [test]. Price $4.50?\n\nThe sentence\ncontinues\there.\nThe sentence continues here.';
    expect(findMatches(text, '(a+b) [test].')).toHaveLength(1);
    expect(findMatches(text, '$4.50?')).toHaveLength(1);
    expect(findMatches(text, 'The sentence continues here.')).toHaveLength(2);
    expect(findMatches(text, '[')).toHaveLength(1);
    expect(findMatches(text, '\\')).toHaveLength(0);
    expect(findMatches(text, '   \n')).toEqual([]);
    expect(findMatches(text, 'missing')).toEqual([]);
  });
  it('wraps next and previous navigation, including empty results', () => {
    expect(nextMatch(2, 3, 1)).toBe(0);
    expect(nextMatch(0, 3, -1)).toBe(2);
    expect(nextMatch(0, 0, 1)).toBe(0);
    expect(nextMatch(0, 1, 1)).toBe(0);
  });
});
describe('reader layout and portable view settings', () => {
  it('bounds both column dividers and keeps a usable reading column as the viewport narrows', () => {
    expect(defaultColumns(1440)).toEqual({ outline: 240, annotations: 360 });
    const wide = { outline: 480, annotations: 640 };
    for (const width of [951, 1024, 1150, 1440, 1920]) {
      const fit = fitColumns(width, wide);
      expect(fit.outline).toBeGreaterThanOrEqual(150);
      expect(fit.annotations).toBeGreaterThanOrEqual(240);
      expect(width - fit.outline - fit.annotations).toBeGreaterThanOrEqual(319);
      const left = resizeColumn('outline', 9999, width, fit);
      expect(left.outline).toBeLessThanOrEqual(480);
      expect(width - left.outline - left.annotations).toBeGreaterThanOrEqual(319);
      const right = resizeColumn('annotations', 9999, width, fit);
      expect(right.annotations).toBeLessThanOrEqual(640);
      expect(width - right.outline - right.annotations).toBeGreaterThanOrEqual(319);
    }
    const tablet = fitColumns(768, wide);
    expect(tablet.annotations).toBe(488);
    expect(resizeColumn('annotations', 9999, 768, tablet).annotations).toBe(488);
    expect(fitColumns(1000, wide, false).outline).toBe(480);
  });
  it('restores zoom, resized columns, existing anchors and exports exactly without changing the document', () => {
    const p = newProject(
      parseMarkdown(
        '# Essay\n\n## Background\n\nRepeated phrase. First occurrence.\n\nRepeated phrase. Second occurrence.',
      ),
      { defaultSuggestions: false },
    );
    const start = p.doc.text.lastIndexOf('Repeated phrase.');
    p.annotations = [
      {
        id: 'E1',
        type: 'Delete',
        scope: 'selection',
        anchor: anchorAt(p.doc, start, start + 16),
        note: '',
        replacement: '',
        placement: 'after',
        createdAt: 1,
      },
    ];
    const before = structuredClone(p.doc),
      output = exportText(p, p.exportSettings);
    p.readerZoom = 175;
    p.columnWidths = { outline: 288, annotations: 416 };
    const restored = parseProject(serializeProject(p));
    expect(restored.readerZoom).toBe(175);
    expect(restored.columnWidths).toEqual(p.columnWidths);
    expect(restored.doc).toEqual(before);
    expect(restored.annotations).toEqual(p.annotations);
    expect(exportText(restored, restored.exportSettings)).toBe(output);
    for (const settings of [
      { readerZoom: 0 },
      { readerZoom: 201 },
      { readerZoom: '150%' },
      { columnWidths: { outline: -1, annotations: 360 } },
      { columnWidths: { outline: 240, annotations: Infinity } },
      { columnWidths: [] },
    ])
      expect(() => parseProject(JSON.stringify({ ...p, ...settings }))).toThrow('damaged');
    delete p.readerZoom;
    delete p.columnWidths;
    expect(parseProject(serializeProject(p)).doc).toEqual(before);
  });
});
