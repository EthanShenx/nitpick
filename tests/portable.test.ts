import { describe, it, expect, vi } from 'vitest';
import { savePortable } from '../src/core/portable';
import type { ProjectFileHandle } from '../src/core/portable';
import { newProject as createDefaultProject } from '../src/core/types';
// These fixture projects intentionally omit app-wide defaults.
const newProject = (doc: Parameters<typeof createDefaultProject>[0]) =>
  createDefaultProject(doc, { defaultSuggestions: false });
import { parseMarkdown } from '../src/core/markdown';
import { parseProject } from '../src/core/storage';
const project = () => newProject(parseMarkdown('A portable document.'));
describe('native and fallback project saves', () => {
  it('updates the same handle repeatedly and reopens the latest complete snapshot', async () => {
    let file = '';
    const close = vi.fn(async () => {});
    const handle: ProjectFileHandle = {
      requestPermission: vi.fn(async () => 'granted'),
      createWritable: vi.fn(async () => ({
        write: async (text: string) => {
          file = text;
        },
        close,
      })),
    };
    const picker = vi.fn(async () => handle);
    const download = vi.fn();
    const p = project();
    const first = await savePortable(p, { picker, download });
    p.notes.push('Half-finished 中文');
    p.revision++;
    const second = await savePortable(p, { handle: first, picker, download });
    expect(second).toBe(handle);
    expect(picker).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(2);
    expect(download).not.toHaveBeenCalled();
    expect(parseProject(file).notes).toContain('Half-finished 中文');
    expect(parseProject(file).fileRevision).toBe(p.revision);
  });
  it('Save As chooses a new handle and fallback downloads a complete portable file', async () => {
    const download = vi.fn();
    const p = project();
    await savePortable(p, { download });
    expect(download).toHaveBeenCalledTimes(1);
    expect(parseProject(download.mock.calls[0][0])).toMatchObject({
      id: p.id,
      doc: { text: p.doc.text },
    });
    const writable = { write: vi.fn(async () => {}), close: vi.fn(async () => {}) };
    const picker = vi.fn(async () => ({ createWritable: async () => writable }));
    await savePortable(p, { picker, download });
    expect(picker).toHaveBeenCalledTimes(1);
    expect(writable.write).toHaveBeenCalledWith(expect.stringContaining('nitpick'));
  });
  it('does not mark or mutate the project when permissions or writes fail', async () => {
    const p = project();
    const original = JSON.stringify(p);
    const download = vi.fn();
    await expect(
      savePortable(p, {
        handle: { requestPermission: async () => 'denied', createWritable: vi.fn() },
        download,
      }),
    ).rejects.toThrow('not granted');
    const abort = vi.fn(async () => {});
    await expect(
      savePortable(p, {
        handle: {
          createWritable: async () => ({
            write: async () => {
              throw new Error('Disk full');
            },
            close: async () => {},
            abort,
          }),
        },
        download,
      }),
    ).rejects.toThrow('Disk full');
    expect(abort).toHaveBeenCalled();
    expect(JSON.stringify(p)).toBe(original);
    expect(download).not.toHaveBeenCalled();
  });
});
