import { unzipSync, strFromU8, zipSync } from 'fflate';
import { parseMarkdown } from './markdown';
import { DocumentBuilder } from './model';
import type { Doc } from './types';
export class MainFileChoice extends Error {
  constructor(
    public candidates: string[],
    public files: Record<string, string>,
    public assets: Record<string, string>,
    public archiveName: string,
    public originalData?: string,
  ) {
    super('Choose the main LaTeX file.');
  }
}
export class LatexProjectRequired extends Error {
  constructor(
    public file: File,
    public inputs: string[],
  ) {
    super(
      'This LaTeX file needs other project files. Open the complete folder or a ZIP so the essay, bibliography, and images are included.',
    );
  }
}
export async function importLatexFolder(selected: File[]): Promise<Doc> {
  const entries: Record<string, Uint8Array> = {};
  let size = 0;
  for (const file of selected) {
    const path = file.webkitRelativePath || file.name;
    if (path.split('/').some((part) => part.startsWith('.') || part === 'node_modules')) continue;
    size += file.size;
    if (size > 50 * 1024 * 1024)
      throw new Error(
        'This folder exceeds the 50 MB import limit. Choose a ZIP containing the required LaTeX sources and images.',
      );
    entries[path] = new Uint8Array(await file.arrayBuffer());
  }
  const folder = selected[0]?.webkitRelativePath?.split('/')[0] || 'LaTeX project';
  const bytes = zipSync(entries, { level: 0 });
  return importDocument(new File([bytes], `${folder}.zip`, { type: 'application/zip' }));
}
export async function importDocument(
  file: File,
  main?: string,
  allowMissingInputs = false,
): Promise<Doc> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (file.size > 50 * 1024 * 1024)
    throw new Error('This file exceeds the 50 MB import limit. Please use a smaller project.');
  if (ext === 'html' || ext === 'htm') {
    const { parseHtml, decodeHtml } = await import('./html');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = parseHtml(decodeHtml(bytes), file.name);
    doc.original = {name:file.name,data:bytesToBase64(bytes),encoding:'base64'};
    return doc;
  }
  if (ext === 'pdf') {
    const { importPdf } = await import('./pdf-import');
    return importPdf(file);
  }
  if (ext === 'md') return parseMarkdown(await file.text(), file.name);
  if (ext === 'tex') {
    const { parseLatex } = await import('./latex');
    const source = await file.text();
    const inputs = [
      ...source.replace(/(?<!\\)%[^\n]*/g, '').matchAll(/\\(?:input|include)\s*\{([^}]+)\}/g),
    ].map((m) => m[1]);
    if (inputs.length && !allowMissingInputs) throw new LatexProjectRequired(file, inputs);
    return parseLatex({ [file.name]: source }, file.name, {}, file.name);
  }
  if (ext === 'zip') {
    const originalBytes = new Uint8Array(await file.arrayBuffer());
    const entries = unzipSync(originalBytes);
    const files: Record<string, string> = {},
      assets: Record<string, string> = {};
    let total = 0;
    for (const [path, bytes] of Object.entries(entries)) {
      total += bytes.length;
      if (total > 100 * 1024 * 1024) throw new Error('The expanded ZIP exceeds 100 MB.');
      if (path.startsWith('__MACOSX') || path.endsWith('/') || path.includes('..')) continue;
      if (/\.(tex|bib|sty|cls|txt)$/i.test(path)) files[path] = strFromU8(bytes);
      else if (/\.(png|jpe?g|gif|webp|svg)$/i.test(path))
        assets[path] =
          `data:image/${path.endsWith('.svg') ? 'svg+xml' : path.endsWith('.jpg') ? 'jpeg' : path.split('.').pop()};base64,${bytesToBase64(bytes)}`;
    }
    const tex = Object.keys(files).filter((p) => p.endsWith('.tex'));
    if (!tex.length) throw new Error('No .tex files were found in this ZIP.');
    const roots = tex.filter((p) => /\\documentclass\b|\\begin\{document\}/.test(files[p]));
    const candidates = roots.length ? roots : tex;
    if (!main && candidates.length > 1)
      throw new MainFileChoice(candidates, files, assets, file.name, bytesToBase64(originalBytes));
    const { parseLatex } = await import('./latex');
    const { prepareFigureAssets } = await import('./figure-assets');
    const figureWarnings = await prepareFigureAssets(files, main ?? candidates[0], entries, assets);
    const doc = parseLatex(files, main ?? candidates[0], assets, file.name);
    doc.warnings.push(...figureWarnings);
    doc.original = { name: file.name, data: bytesToBase64(originalBytes), encoding: 'base64' };
    return doc;
  }
  if (ext === 'docx') {
    const buffer = await file.arrayBuffer();
    const mammoth = await import('mammoth');
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
    const html = new DOMParser().parseFromString(result.value, 'text/html');
    const b = new DocumentBuilder('docx', file.name, {
      [file.name]: bytesToBase64(new Uint8Array(buffer)),
    });
    b.warnings.push(
      'Word layout, pagination, fonts, tracked changes, and some formatting may differ. The original Word file is retained in the project.',
      ...result.messages.map((m) => m.message),
    );
    function inline(node: Node, style?: 'strong' | 'emphasis') {
      if (node.nodeType === Node.TEXT_NODE) {
        b.add({ text: node.textContent ?? '', style });
        return;
      }
      if (node instanceof Element && node.tagName === 'IMG') {
        const src = node.getAttribute('src') ?? '';
        const key = `word-image-${Object.keys(b.assets).length}`;
        if (src.startsWith('data:image/')) b.assets[key] = src;
        b.add({
          text: `[Image: ${node.getAttribute('alt') || 'Word image'}]`,
          atomic: true,
          kind: b.assets[key] ? 'image' : 'placeholder',
          image: b.assets[key] ? key : undefined,
        });
        return;
      }
      if (node instanceof Element && node.tagName === 'BR') {
        b.add({ text: '\n' });
        return;
      }
      for (const child of node.childNodes)
        inline(
          child,
          node instanceof Element && ['STRONG', 'B'].includes(node.tagName)
            ? 'strong'
            : node instanceof Element && ['EM', 'I'].includes(node.tagName)
              ? 'emphasis'
              : style,
        );
    }
    for (const el of html.body.querySelectorAll('p,h1,h2,h3,h4,h5,h6,td,th')) {
      inline(el);
      const heading = /^H\d$/.test(el.tagName);
      b.flush(
        heading
          ? el.tagName === 'H1' && b.blocks.length === 0
            ? 'title'
            : 'heading'
          : 'paragraph',
        heading ? Number(el.tagName[1]) : undefined,
      );
    }
    if (!b.blocks.length) throw new Error('This Word file contains no readable text.');
    return b.finish(file.name);
  }
  throw new Error(
    'Choose a .html, .htm, .pdf, .md, .docx, .tex, .zip, or .nitpick file.',
  );
}
export function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}
