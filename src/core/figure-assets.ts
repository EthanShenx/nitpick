import { resolvePath } from './latex';
type Renderer = (bytes: Uint8Array) => Promise<string>;
export function referencedPdfFigures(
  files: Record<string, string>,
  main: string,
  available: Record<string, unknown>,
): string[] {
  const figures = new Set<string>();
  const visited = new Set<string>();
  const graphics: { file: string; path: string }[] = [];
  const clean = (source: string) => source.replace(/(?<!\\)%[^\n]*/g, '');
  function visit(file: string) {
    if (visited.has(file) || !files[file]) return;
    visited.add(file);
    const source = clean(files[file]);
    for (const match of source.matchAll(/\\graphicspath\s*\{((?:\s*\{[^}]*\}\s*)+)\}/g))
      for (const path of match[1].matchAll(/\{([^}]*)\}/g)) graphics.push({ file, path: path[1] });
    for (const match of source.matchAll(/\\(?:input|include)\s*\{([^}]+)\}/g)) {
      const path = resolvePath(file, match[1], files, '.tex');
      if (path) visit(path);
    }
    for (const match of source.matchAll(/\\includegraphics\*?(?:\s*\[[^\]]*\])*\s*\{([^}]+)\}/g)) {
      const target = match[1].trim();
      for (const base of [{ file, path: '' }, { file: main, path: '' }, ...graphics]) {
        const path = resolvePath(base.file, base.path + target, available, '.pdf');
        if (path && /\.pdf$/i.test(path)) {
          figures.add(path);
          break;
        }
      }
    }
  }
  visit(main);
  return [...figures];
}
export async function prepareFigureAssets(
  files: Record<string, string>,
  main: string,
  entries: Record<string, Uint8Array>,
  assets: Record<string, string>,
  render?: Renderer,
): Promise<string[]> {
  const warnings: string[] = [];
  for (const path of referencedPdfFigures(files, main, entries)) {
    if (assets[path]) continue;
    try {
      if (!render) {
        if (typeof document === 'undefined')
          throw new Error('PDF figure previews require a browser.');
        render = (await import('./pdf-figures')).renderPdfFigure;
      }
      const preview = await render(entries[path]);
      if (!preview.startsWith('data:image/png')) throw new Error('No image was produced.');
      assets[path] = preview;
    } catch (e) {
      warnings.push(
        `Could not preview PDF figure ${path}: ${e instanceof Error ? e.message : String(e)} The original PDF is retained; its caption and a selectable placeholder are available.`,
      );
    }
  }
  return warnings;
}
