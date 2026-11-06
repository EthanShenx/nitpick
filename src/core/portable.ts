import type { Project } from './types';
import { serializeProject } from './storage';

export interface ProjectFileHandle {
  name?: string;
  queryPermission?: (options: { mode: 'readwrite' }) => Promise<string>;
  requestPermission?: (options: { mode: 'readwrite' }) => Promise<string>;
  createWritable: () => Promise<{
    write: (text: string) => Promise<void>;
    close: () => Promise<void>;
    abort?: () => Promise<void>;
  }>;
}
export interface SaveOptions {
  promptPermission?: boolean;
  handle?: ProjectFileHandle | null;
  picker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<ProjectFileHandle>;
  download: (text: string, name: string, mime: string) => void;
}
/** Writes a snapshot. The caller must only mark this snapshot's revision saved after success. */
export async function savePortable(project: Project, options: SaveOptions) {
  const name = project.projectFileName || `${project.title}.nitpick`;
  let handle = options.handle;
  if (!handle && options.picker)
    handle = await options.picker({
      suggestedName: name,
      types: [{ description: 'Nitpick project', accept: { 'application/json': ['.nitpick'] } }],
    });
  const text = serializeProject(project);
  if (!handle) {
    options.download(text, name, 'application/json');
    return null;
  }
  if (
    options.promptPermission === false &&
    handle.queryPermission &&
    (await handle.queryPermission({ mode: 'readwrite' })) !== 'granted'
  )
    throw new Error('Reconnect the project file to resume autosave.');
  if (
    options.promptPermission !== false &&
    handle.requestPermission &&
    (await handle.requestPermission({ mode: 'readwrite' })) !== 'granted'
  )
    throw new Error('File access was not granted. Use Save As to choose a new project file.');
  const writable = await handle.createWritable();
  try {
    await writable.write(text);
    await writable.close();
  } catch (error) {
    await writable.abort?.().catch(() => {});
    throw error;
  }
  return handle;
}

/** Serialize writes across handles and Save As, so a slow older write cannot win. */
export class PortableWriteQueue {
  private pending: Promise<unknown> = Promise.resolve();
  write(project: Project, handle: ProjectFileHandle) {
    const snapshot = structuredClone(project);
    const result = this.pending
      .catch(() => {})
      .then(async () => {
        await savePortable(snapshot, {
          handle,
          promptPermission: false,
          download() {
            throw new Error('File autosave requires a writable handle.');
          },
        });
        return { id: snapshot.id, revision: snapshot.revision };
      });
    this.pending = result;
    return result;
  }
}
