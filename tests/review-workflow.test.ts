import { describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { newProject } from '../src/core/types';
import { parseMarkdown } from '../src/core/markdown';
import { anchorAt, sourceQuote } from '../src/core/model';
import {
  annotationScope,
  emptyTextAnnotation,
  ensureGlobalSuggestions,
  GLOBAL_SUGGESTIONS,
  wordCount,
} from '../src/core/review';
import {
  serializeProject,
  parseProject,
  saveLocal,
  recentProjects,
  deleteLocalProject,
  deletedProjects,
  restoreLocalProject,
  saveHandle,
  getHandle,
} from '../src/core/storage';
import { PortableWriteQueue } from '../src/core/portable';
import { listMarkdown } from '../src/core/export';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { DocumentOutline } from '../src/components/DocumentOutline';
import type { Annotation } from '../src/core/types';
const make = () =>
  newProject(
    parseMarkdown(
      '# Review\n\n## First\n\nFour selected words here.\n\n### Detail\n\nAnother point.\n\n## Second\n\nFinal words.',
    ),
  );
function detail(p = make()): Annotation {
  const start = p.doc.text.indexOf('Four');
  return {
    id: 'E1',
    type: 'Comment',
    scope: 'selection',
    anchor: anchorAt(p.doc, start, start + 24),
    note: 'Make this clearer.',
    replacement: '',
    placement: 'after',
    createdAt: 0,
  };
}
describe('review workflow improvements', () => {
  it('opens an existing newer IndexedDB revision without losing saved documents', async () => {
    const existing = await openDB('nitpick', 2, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('projects'))
          db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles');
      },
    });
    existing.close();
    const p = make();
    await saveLocal(p);
    expect((await recentProjects()).some((x) => x.id === p.id)).toBe(true);
  });
  it('counts Unicode words and applies the selection threshold consistently', () => {
    expect(wordCount('one two three')).toBe(3);
    expect(wordCount('one two three four')).toBe(4);
    expect(wordCount('中文 café 👀')).toBe(2);
    expect(wordCount('one\n\ntwo—three')).toBe(3);
  });
  it('adds exactly two supplied global defaults, migrates existing work once, and respects their deletion', () => {
    const p = make();
    expect(p.annotations.map((a) => a.note)).toEqual([...GLOBAL_SUGGESTIONS]);
    expect(p.annotations.every((a) => a.scope === 'document')).toBe(true);
    p.annotations.splice(0, 1);
    expect(ensureGlobalSuggestions(p).annotations).toHaveLength(1);
    const legacy = { ...p, defaultSuggestionsVersion: undefined, annotations: [detail(p)] };
    expect(ensureGlobalSuggestions(legacy).annotations.map((a) => a.note)).toContain(
      'Make this clearer.',
    );
    expect(ensureGlobalSuggestions(legacy).annotations).toHaveLength(3);
  });
  it('converts a detail note to a global note and restores its complete exact anchor after saving', () => {
    const p = make(),
      a = detail(p);
    const global = annotationScope(p, a, 'document');
    p.annotations.push(global);
    expect(global.anchor.quote).toBe('');
    expect(global.id).toBe(a.id);
    expect(global.localAnchor).toEqual(a.anchor);
    const restored = parseProject(serializeProject(p));
    const local = annotationScope(restored, restored.annotations.at(-1)!, 'selection');
    expect(local.anchor).toEqual(a.anchor);
    expect(sourceQuote(restored.doc, local.anchor)).toBe(a.anchor.quote);
    expect(listMarkdown(restored, restored.exportSettings)).toContain('Make this clearer.');
  });
  it('discards empty text annotations but keeps intentional Delete, Keep, Verify and uncertain Move actions', () => {
    const a = { ...detail(), note: '  ', replacement: '' };
    for (const type of ['Comment', 'Replace', 'Insert'] as const)
      expect(emptyTextAnnotation({ ...a, type })).toBe(true);
    expect(emptyTextAnnotation({ ...a, replacement: 'new words' })).toBe(false);
    for (const type of ['Delete', 'Keep', 'Verify', 'Move'] as const)
      expect(emptyTextAnnotation({ ...a, type })).toBe(false);
    const p = make();
    p.annotations.push({ ...a, type: 'Move', destinationUncertain: true });
    const reopened = parseProject(serializeProject(p));
    expect(listMarkdown(reopened, reopened.exportSettings)).toContain('Destination: Not sure yet.');
  });
  it('shows cumulative section revision counts while excluding global notes', () => {
    const p = make();
    p.annotations.push(detail(p));
    const html = renderToStaticMarkup(
      createElement(DocumentOutline, { doc: p.doc, annotations: p.annotations, onNavigate() {} }),
    );
    expect(html).toContain('aria-label="1 annotation"');
    // Sections without annotations show no count.
    expect(html).not.toContain('aria-label="0 annotations"');
    expect(html).not.toContain('aria-label="3 annotations"');
  });
  it('removes a recent project recoverably without losing its bound handle or document', async () => {
    const p = make();
    await saveLocal(p);
    await saveHandle(p.id, { name: 'review.nitpick' });
    await deleteLocalProject(p.id);
    expect((await recentProjects()).some((x) => x.id === p.id)).toBe(false);
    expect((await deletedProjects()).find((x) => x.id === p.id)).toEqual(p);
    await restoreLocalProject(p.id);
    expect((await recentProjects()).find((x) => x.id === p.id)).toEqual(p);
    expect(await getHandle(p.id)).toEqual({ name: 'review.nitpick' });
  });
  it('serializes file autosaves and captures snapshots so a slow old write cannot overwrite a newer revision', async () => {
    const queue = new PortableWriteQueue();
    let file = '',
      release: () => void = () => {};
    const firstBlocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let writes = 0;
    const handle = {
      queryPermission: async () => 'granted',
      createWritable: async () => ({
        write: async (text: string) => {
          if (++writes === 1) await firstBlocked;
          file = text;
        },
        close: async () => {},
      }),
    };
    const p = make();
    const old = queue.write(p, handle);
    p.revision++;
    p.notes.push('Later change 中文');
    const newer = queue.write(p, handle);
    release();
    await Promise.all([old, newer]);
    expect(parseProject(file).notes).toContain('Later change 中文');
    expect(parseProject(file).fileRevision).toBe(p.revision);
  });
  it('does not prompt for permission during background writes and can recover on the next authorized handle', async () => {
    const queue = new PortableWriteQueue(),
      p = make();
    const requestPermission = vi.fn(async () => 'granted');
    await expect(
      queue.write(p, {
        queryPermission: async () => 'prompt',
        requestPermission,
        createWritable: vi.fn(),
      }),
    ).rejects.toThrow('Reconnect');
    expect(requestPermission).not.toHaveBeenCalled();
    let saved = '';
    await queue.write(p, {
      queryPermission: async () => 'granted',
      createWritable: async () => ({
        write: async (s) => {
          saved = s;
        },
        close: async () => {},
      }),
    });
    expect(parseProject(saved).id).toBe(p.id);
  });
});
