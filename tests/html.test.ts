import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHtml, decodeHtml } from '../src/core/html';
import { importDocument } from '../src/core/import';
import { anchorAt, blockAnchor, location } from '../src/core/model';
import { documentOutline } from '../src/core/outline';
import { newProject, ACTIONS } from '../src/core/types';
import type { Annotation } from '../src/core/types';
import { parseProject, serializeProject, saveLocal, recentProjects } from '../src/core/storage';
import { exportText, exportDocx } from '../src/core/export';
import { Paper } from '../src/components/Paper';
const source = readFileSync('samples/html/essay.html', 'utf8');
const create = () => newProject(parseHtml(source), { defaultSuggestions: false });
function annotation(
  p: ReturnType<typeof create>,
  start: number,
  end: number,
  id = 'E1',
): Annotation {
  return {
    id,
    type: 'Comment',
    scope: 'selection',
    anchor: anchorAt(p.doc, start, end),
    note: 'Review this occurrence. 中文备注。',
    replacement: 'New wording',
    placement: 'after',
    createdAt: 1,
  };
}
describe('HTML documents', () => {
  it('imports HTML documents and fragments with nested headings, Unicode, formatting, lists, tables and images', () => {
    const d = parseHtml(source);
    expect(d.format).toBe('html');
    expect(d.files[d.main]).toBe(source);
    expect(d.text).toContain('中文文本');
    expect(d.text).toContain('an & character.');
    expect(d.text).not.toContain('color: purple');
    expect(d.blocks.filter((b) => b.kind === 'heading').map((b) => b.level)).toEqual([2, 3, 2]);
    const outline = documentOutline(d);
    expect(outline[0].children[0].block.heading).toBe('Details');
    const list = d.blocks.filter((b) => b.kind === 'list');
    expect(list.map((b) => b.listMarker)).toEqual(['3.', '4.', '•']);
    expect(
      d.blocks
        .find((b) => b.kind === 'table')!
        .runs.map((r) => r.text)
        .join(''),
    ).toBe('Group\tObservation\n中文\tNo text is dropped.\nRepeat\tRepeated phrase.');
    expect(Object.keys(d.assets)).toHaveLength(1);
    expect(d.text).toContain('[Image unavailable: A local figure]');
    expect(d.text).toContain('  const message = "中文";');
    expect(
      parseHtml('<p><del>Old</del> <ins>New</ins></p>')
        .blocks[0].runs.filter((r) => r.style)
        .map((r) => r.style),
    ).toEqual(['deleted', 'inserted']);
    expect(parseHtml('<div>First paragraph.</div><p>Second <b>bold</b> paragraph.').text).toBe(
      'First paragraph.\n\nSecond bold paragraph.',
    );
  });
  it('parses untrusted markup as data without browser APIs, scripts, handlers, styles or external resources', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    try {
      const raw =
        '<base href="https://example.invalid/"><meta http-equiv="refresh" content="0;url=https://example.invalid/"><style>@import "https://example.invalid/style";</style><script>globalThis.executed=true</script><h1 onclick="bad()">Safe title</h1><p>Visible &lt;script&gt;文字&lt;/script&gt;<span hidden>hidden</span><span style="display:none">also hidden</span></p><img src="https://example.invalid/tracker" onerror="bad()" alt="Figure"><iframe src="https://example.invalid/frame" title="Embedded frame"></iframe><svg onload="bad()"><text>SVG label</text></svg><input type="hidden" value="secret"><input value="Read-only"><template>Template text</template>';
      const d = parseHtml(raw),
        p = newProject(d, { defaultSuggestions: false });
      expect(d.text).not.toContain('executed');
      expect(d.text).not.toContain('hidden');
      expect(d.text).not.toContain('Template text');
      expect(d.text).toContain('Visible <script>文字</script>');
      expect(d.text).toContain('[IFRAME content: Embedded frame]');
      expect(d.text).toContain('[Form control: Read-only]');
      const rendered = renderToStaticMarkup(
        createElement(Paper, {
          doc: d,
          annotations: [],
          filters: p.filters,
          active: null,
          onScope() {},
          onJump() {},
          onOverlap() {},
        }),
      );
      expect(rendered).toContain('&lt;script&gt;');
      expect(rendered).not.toMatch(/<script|<iframe|onerror|onclick|<style|<input/);
      expect(rendered).not.toContain('src="https:');
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('anchors the correct occurrence and preserves every word across paragraphs, inline runs and sections', () => {
    const p = create(),
      d = p.doc,
      first = d.text.indexOf('Repeated phrase.'),
      second = d.text.indexOf('Repeated phrase.', first + 1);
    p.annotations = [annotation(p, second, second + 16)];
    expect(p.annotations[0].anchor.start).toBe(second);
    expect(p.annotations[0].anchor.paragraph).toBe(2);
    const end = d.text.indexOf('formatted text') + 'formatted text'.length;
    const a = annotation(p, first, end, 'E2');
    p.annotations.push(a);
    expect(a.anchor.quote).toContain('\n\n');
    expect(location(a.anchor, d)).toContain('through');
    const list = exportText(p, p.exportSettings);
    expect(list).toContain('"' + d.text.slice(first, end) + '"');
    expect(list).toContain('paragraph 2');
    const heading = d.blocks.find((b) => b.kind === 'heading')!;
    expect(blockAnchor(d, heading, true).quote).toContain('Details');
  });
  it('imports .html and .HTM and saves original bytes, notes, settings, and anchors in portable projects and IndexedDB', async () => {
    for (const filename of ['essay.html', 'Essay.HTM']) {
      const bytes = Buffer.from(source),
        d = await importDocument(new File([bytes], filename, { type: 'text/html' })),
        p = newProject(d, { defaultSuggestions: false });
      expect(p.version).toBe(3);
      expect(p.title).toBe(filename === 'Essay.HTM' ? 'Essay' : 'essay');
      const start = d.text.lastIndexOf('Repeated phrase.');
      p.annotations = [annotation(p, start, start + 16)];
      p.scroll = 230;
      p.editingId = 'E1';
      p.notes = ['中文 saved note'];
      p.filters = { preset: 'Larger changes', scope: 'all', type: 'all' };
      p.exportSettings = {
        ...p.exportSettings,
        audience: 'people',
        layout: 'inline',
        format: 'html',
      };
      const restored = parseProject(serializeProject(p));
      expect(restored.doc).toEqual(d);
      expect(restored.annotations).toEqual(p.annotations);
      expect(restored.notes).toEqual(p.notes);
      expect(restored.exportSettings).toEqual(p.exportSettings);
      expect(restored.scroll).toBe(230);
      expect(restored.doc.original!.data).toBe(bytes.toString('base64'));
      await saveLocal(restored);
      expect((await recentProjects()).find((x) => x.id === p.id)!.doc).toEqual(d);
    }
  });
  it('supports all existing annotation actions and export audiences, layouts and filters for HTML', async () => {
    const p = create(),
      start = p.doc.text.indexOf('Repeated phrase.');
    p.annotations = ACTIONS.map((type, i) => ({
      ...annotation(p, start, start + 16, `E${i + 1}`),
      type,
    }));
    p.annotations.push({ ...annotation(p, 0, 0, 'D1'), scope: 'document' });
    p.annotations.push({
      ...annotation(p, 0, 0, 'P1'),
      scope: 'paragraph',
      anchor: blockAnchor(
        p.doc,
        p.doc.blocks.find((b) => b.paragraph === 1)!,
      ),
    });
    p.annotations.push({
      ...annotation(p, 0, 0, 'S1'),
      scope: 'section',
      anchor: blockAnchor(
        p.doc,
        p.doc.blocks.find((b) => b.kind === 'heading')!,
        true,
      ),
    });
    for (const audience of ['ai', 'people'] as const)
      for (const layout of ['list', 'inline'] as const) {
        const out = exportText(p, { ...p.exportSettings, audience, layout });
        expect(out).toContain('Review this occurrence. 中文备注。');
        expect(out).toContain('Repeated phrase.');
        expect(out).toContain('Background');
      }
    const json = JSON.parse(exportText(p, { ...p.exportSettings, format: 'json' }));
    expect(json.edits).toHaveLength(10);
    const small = exportText(p, {
      ...p.exportSettings,
      filters: { preset: 'Small edits', type: 'all', scope: 'all' },
    });
    expect(small).toContain('DELETE');
    expect(small).not.toContain('VERIFY');
    const word = await exportDocx(p, p.exportSettings);
    expect(word.size).toBeGreaterThan(1000);
  });
  it('decodes declared legacy encodings and UTF-16 BOMs, and safely rejects empty, invalid, or deeply nested inputs', async () => {
    const gbk = Buffer.concat([
      Buffer.from('<meta charset="gb18030"><p>'),
      Buffer.from([0xd6, 0xd0, 0xce, 0xc4]),
      Buffer.from('</p>'),
    ]);
    expect(parseHtml(decodeHtml(gbk)).text).toBe('中文');
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('<p>中文</p>', 'utf16le')]);
    expect(parseHtml(decodeHtml(utf16)).text).toBe('中文');
    expect(() => decodeHtml(Buffer.from('<meta charset="no-such-encoding">'))).toThrow('UTF-8');
    expect(() =>
      parseHtml(
        '<html><head><title>Only metadata</title></head><body><script>bad()</script></body></html>',
      ),
    ).toThrow('no readable text');
    expect(() => parseHtml('<div>'.repeat(260) + 'Too deep' + '</div>'.repeat(260))).toThrow(
      'too deeply',
    );
    expect(() => parseProject(JSON.stringify({ ...create(), version: 2 }))).toThrow('damaged');
  });
});
