import { openDB } from 'idb';
import type { Project } from './types';
import { validPdfRects } from './pdf-anchors';
import { anchorAt } from './model';
import { ACTIONS } from './types';
export const PROJECT_VERSION = 3;
const db = () =>
  openDB('nitpick', undefined, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('projects'))
        db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles');
    },
  });
let pending = Promise.resolve();
export function saveLocal(project: Project) {
  const snapshot = structuredClone(project);
  pending = pending
    .catch(() => {})
    .then(async () => {
      const d = await db();
      await d.put('projects', snapshot);
    });
  return pending;
}
export async function recentProjects(): Promise<Project[]> {
  const d = await db();
  return (await d.getAll('projects')).sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function saveHandle(id: string, handle: unknown) {
  const d = await db();
  await d.put('handles', handle, id);
}
export async function getHandle(id: string) {
  const d = await db();
  return d.get('handles', id);
}
const trashDb = () =>
  openDB('nitpick-trash', 1, {
    upgrade(db) {
      db.createObjectStore('projects', { keyPath: 'id' });
    },
  });
export async function deletedProjects(): Promise<Project[]> {
  const d = await db();
  const legacy = d.objectStoreNames.contains('trash') ? await d.getAll('trash') : [];
  const removed = await (await trashDb()).getAll('projects');
  return [...new Map([...legacy, ...removed].map((p) => [p.id, p])).values()] as Project[];
}
export async function deleteLocalProject(id: string) {
  await pending.catch(() => {});
  const d = await db(),
    trash = await trashDb(),
    p = await d.get('projects', id);
  if (p) {
    await trash.put('projects', p);
    await d.delete('projects', id);
  }
}
export async function restoreLocalProject(id: string) {
  const d = await db(),
    trash = await trashDb(),
    p =
      (await trash.get('projects', id)) ??
      (d.objectStoreNames.contains('trash') ? await d.get('trash', id) : undefined);
  if (p) {
    await d.put('projects', p);
    await trash.delete('projects', id);
    if (d.objectStoreNames.contains('trash')) await d.delete('trash', id);
  }
}
export function serializeProject(p: Project) {
  return JSON.stringify({ ...p, fileRevision: p.revision }, null, 2);
}
const obj = (x: unknown): x is Record<string, any> =>
  !!x && typeof x === 'object' && !Array.isArray(x);
export function parseProject(text: string): Project {
  let p: any;
  try {
    p = JSON.parse(text);
  } catch {
    throw new Error(
      'This is not a valid .nitpick file: the JSON cannot be read. Your existing work is safe.',
    );
  }
  if (!obj(p) || p.format !== 'nitpick')
    throw new Error('This is not a Nitpick project file. Your existing work is safe.');
  if (typeof p.version === 'number' && p.version > PROJECT_VERSION)
    throw new Error(
      `This project uses format version ${p.version}. This app supports version ${PROJECT_VERSION}; open it in a newer Nitpick app. Your existing work is safe.`,
    );
  const fail = () => {
    throw new Error(
      'This project is incomplete or damaged. Its document, anchors, or settings are invalid. Your existing work is safe.',
    );
  };
  if (
    ![1, 2, 3].includes(p.version) ||
    typeof p.id !== 'string' ||
    typeof p.title !== 'string' ||
    !obj(p.doc) ||
    (p.sourcePath !== undefined && typeof p.sourcePath !== 'string') ||
    (p.projectFileName !== undefined && typeof p.projectFileName !== 'string') ||
    (p.defaultSuggestionsVersion !== undefined && p.defaultSuggestionsVersion !== 1) ||
    !Array.isArray(p.annotations) ||
    !Array.isArray(p.notes) ||
    !p.notes.every((n: unknown) => typeof n === 'string') ||
    !obj(p.filters) ||
    !obj(p.exportSettings) ||
    !Number.isFinite(p.scroll) ||
    !Number.isInteger(p.revision) ||
    p.revision < 0 ||
    p.scroll < 0 ||
    !Number.isFinite(p.updatedAt)
  )
    fail();
  const d = p.doc;
  if (
    typeof d.text !== 'string' ||
    !['md', 'tex', 'docx', 'pdf', 'html'].includes(d.format) ||
    typeof d.name !== 'string' ||
    typeof d.main !== 'string' ||
    !obj(d.files) ||
    !obj(d.assets) ||
    !Array.isArray(d.blocks) ||
    !d.blocks.length ||
    !Array.isArray(d.warnings) ||
    !d.warnings.every((x: unknown) => typeof x === 'string')
  )
    fail();
  if (
    typeof d.files[d.main] !== 'string' ||
    !Object.values(d.files).every((x) => typeof x === 'string') ||
    !Object.values(d.assets).every((x) => typeof x === 'string' && /^data:image\//.test(x))
  )
    fail();
  if (d.format === 'html' && p.version !== 3) fail();
  const validSource = (s: any) =>
    obj(s) &&
    typeof s.file === 'string' &&
    typeof d.files[s.file] === 'string' &&
    Number.isInteger(s.start) &&
    Number.isInteger(s.end) &&
    s.start >= 0 &&
    s.end >= s.start &&
    s.end <= d.files[s.file].length;
  const validAnchor = (a: any) =>
    obj(a) &&
    Number.isInteger(a.start) &&
    Number.isInteger(a.end) &&
    a.start >= 0 &&
    a.end >= a.start &&
    a.end <= d.text.length &&
    a.quote === d.text.slice(a.start, a.end) &&
    Array.isArray(a.source) &&
    a.source.every(validSource) &&
    ['before', 'after', 'heading'].every((k) => typeof a[k] === 'string') &&
    ['paragraph', 'paragraphEnd', 'section', 'sectionEnd'].every((k) => Number.isInteger(a[k]));
  let cursor = 0;
  const blockIds = new Set<string>();
  for (const b of d.blocks) {
    if (
      !obj(b) ||
      typeof b.id !== 'string' ||
      !/^[A-Za-z0-9_-]+$/.test(b.id) ||
      blockIds.has(b.id) ||
      !['paragraph', 'heading', 'title', 'list', 'table', 'figure'].includes(b.kind) ||
      (b.listMarker !== undefined && (typeof b.listMarker !== 'string' || b.listMarker.length > 32)) ||
      (b.level !== undefined && (!Number.isInteger(b.level) || b.level < 1 || b.level > 6)) ||
      !Number.isInteger(b.start) ||
      !Number.isInteger(b.end) ||
      b.start !== cursor ||
      b.end <= b.start ||
      b.end > d.text.length ||
      typeof b.heading !== 'string' ||
      !Number.isInteger(b.section) ||
      b.section < 0 ||
      !Number.isInteger(b.paragraph) ||
      b.paragraph < 0 ||
      !Array.isArray(b.runs) ||
      !b.runs.length
    )
      fail();
    blockIds.add(b.id);
    let runCursor = b.start;
    for (const r of b.runs) {
      if (
        !obj(r) ||
        typeof r.text !== 'string' ||
        !Number.isInteger(r.start) ||
        !Number.isInteger(r.end) ||
        r.start !== runCursor ||
        r.end > b.end ||
        d.text.slice(r.start, r.end) !== r.text ||
        r.end - r.start !== r.text.length ||
        (r.source && !validSource(r.source)) ||
        (r.atomic !== undefined && typeof r.atomic !== 'boolean') ||
        (r.kind !== undefined && !['math', 'placeholder', 'image'].includes(r.kind)) ||
        (r.math !== undefined && typeof r.math !== 'string') ||
        (r.style !== undefined && !['strong', 'emphasis', 'code', 'footnote', 'deleted', 'inserted'].includes(r.style)) ||
        (r.kind === 'image' &&
          (typeof r.image !== 'string' || typeof d.assets[r.image] !== 'string'))
      )
        fail();
      runCursor = r.end;
    }
    if (runCursor !== b.end) fail();
    cursor = b.end + 2;
    if (b !== d.blocks.at(-1) && d.text.slice(b.end, cursor) !== '\n\n') fail();
  }
  if (cursor - 2 !== d.text.length) fail();
  if (d.format === 'pdf') {
    if (p.version !== 2 || !obj(d.pdf) || !Array.isArray(d.pdf.pages) ||
      d.pdf.pages.length !== d.blocks.length || !Array.isArray(d.pdf.outline) ||
      !d.original || d.original.data !== d.files[d.main] ||
      typeof d.original.data !== 'string' || !/^JVBERi0/.test(d.original.data)) fail();
    for (const [i, page] of d.pdf.pages.entries()) {
      const block = d.blocks[i];
      if (!obj(page) || page.number !== i + 1 || typeof page.label !== 'string' ||
        !Number.isFinite(page.width) || !Number.isFinite(page.height) ||
        page.width <= 0 || page.height <= 0 || page.width > 20000 || page.height > 20000 ||
        ![0,90,180,270].includes(page.rotation) || !Array.isArray(page.transform) ||
        page.transform.length !== 6 || !page.transform.every(Number.isFinite) ||
        Math.abs(page.transform[0]*page.transform[3]-page.transform[1]*page.transform[2]) < .001 ||
        page.start !== block.start || page.end !== block.end || !Array.isArray(page.items)) fail();
      let previous = page.start;
      for (const [index, item] of page.items.entries()) {
        if (!obj(item) || item.index !== index || !Number.isInteger(item.start) ||
          !Number.isInteger(item.end) || item.start < previous || item.end < item.start ||
          item.end > page.end || !obj(item.rect) || item.rect.page !== page.number ||
          !validPdfRects(d, { start: page.start, end: page.end, pdfRects: [item.rect] } as any)) fail();
        previous = item.end;
      }
    }
    const validBookmarks = (entries: any[], depth = 0): boolean => depth < 32 && entries.every(e => obj(e) && typeof e.title === 'string' && Number.isInteger(e.page) && e.page > 0 && e.page <= d.pdf.pages.length && Array.isArray(e.children) && validBookmarks(e.children, depth + 1));
    if (!validBookmarks(d.pdf.outline)) fail();
  } else if (d.pdf !== undefined) fail();
  const exactAnchor = (a: any) => {
    if (!validAnchor(a)) return false;
    if (!validPdfRects(d, a)) return false;
    const expected = anchorAt(d, a.start, a.end);
    return (
      [
        'start',
        'end',
        'quote',
        'before',
        'after',
        'paragraph',
        'paragraphEnd',
        'section',
        'sectionEnd',
        'heading',
      ].every((k) => a[k] === expected[k as keyof typeof expected]) &&
      a.source.length === expected.source.length &&
      a.source.every(
        (s: any, i: number) =>
          s.file === expected.source[i].file &&
          s.start === expected.source[i].start &&
          s.end === expected.source[i].end,
      )
    );
  };
  const ids = new Set();
  for (const a of p.annotations) {
    if (
      !obj(a) ||
      typeof a.id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(a.id) ||
      ids.has(a.id) ||
      !ACTIONS.includes(a.type) ||
      !['selection', 'paragraph', 'section', 'document'].includes(a.scope) ||
      !exactAnchor(a.anchor) ||
      !Number.isFinite(a.createdAt) ||
      typeof a.note !== 'string' ||
      typeof a.replacement !== 'string' ||
      !['before', 'after'].includes(a.placement) ||
      (a.destination && !exactAnchor(a.destination)) ||
      (a.localAnchor && !exactAnchor(a.localAnchor)) ||
      (a.destinationUncertain !== undefined && typeof a.destinationUncertain !== 'boolean')
    )
      fail();
    ids.add(a.id);
  }
  const vf = (f: any) =>
    obj(f) &&
    ['Everything', 'Small edits', 'Larger changes'].includes(f.preset) &&
    ['all', ...ACTIONS].includes(f.type) &&
    ['all', 'selection', 'paragraph', 'section', 'document'].includes(f.scope);
  if (p.editingId !== undefined && (typeof p.editingId !== 'string' || !ids.has(p.editingId)))
    fail();
  if (
    d.original &&
    (!obj(d.original) ||
      typeof d.original.name !== 'string' ||
      typeof d.original.data !== 'string' ||
      d.original.encoding !== 'base64')
  )
    fail();
  if (
    p.readingOffset !== undefined &&
    (!Number.isInteger(p.readingOffset) || p.readingOffset < 0 || p.readingOffset > d.text.length)
  )
    fail();
  if (p.pdfZoom !== undefined && p.pdfZoom !== 'fit' && ![.75,1,1.25,1.5,2].includes(p.pdfZoom)) fail();
  if (p.readerZoom !== undefined && (!Number.isInteger(p.readerZoom) || p.readerZoom < 50 || p.readerZoom > 200)) fail();
  if (p.columnWidths !== undefined && (!obj(p.columnWidths) ||
    !Number.isFinite(p.columnWidths.outline) || p.columnWidths.outline < 150 || p.columnWidths.outline > 480 ||
    !Number.isFinite(p.columnWidths.annotations) || p.columnWidths.annotations < 240 || p.columnWidths.annotations > 640)) fail();
  const e = p.exportSettings;
  if (
    !vf(p.filters) ||
    !vf(e.filters) ||
    !['ai', 'people'].includes(e.audience) ||
    !['list', 'inline'].includes(e.layout) ||
    !['md', 'json', 'docx', 'html', 'pdf'].includes(e.format) ||
    typeof e.instructions !== 'string'
  )
    fail();
  p.fileRevision = p.revision;
  p.updatedAt = Date.now();
  return p as Project;
}
export function download(content: Blob | string, name: string, mime = 'text/plain;charset=utf-8') {
  const blob = typeof content === 'string' ? new Blob([content], { type: mime }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
