import { parse } from 'parse5';
import type { DefaultTreeAdapterTypes as Tree } from 'parse5';
import { DocumentBuilder } from './model';
import type { DraftRun } from './model';
import type { Block } from './types';

type Context = {
  style?: DraftRun['style'];
  pre?: boolean;
  kind?: Block['kind'];
  cell?: boolean;
  list?: { marker: string; used: boolean };
};
const BLOCKS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'div',
  'dl',
  'dt',
  'dd',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'header',
  'main',
  'nav',
  'p',
  'section',
  'summary',
  'details',
]);
const IGNORED = new Set([
  'head',
  'script',
  'style',
  'link',
  'meta',
  'base',
  'title',
  'template',
  'noscript',
]);
const attribute = (node: Tree.Element, name: string) =>
  node.attrs.find((a) => a.name === name)?.value;
const children = (node: Tree.Node): Tree.ChildNode[] =>
  'childNodes' in node ? node.childNodes : [];
const element = (node: Tree.Node): node is Tree.Element => 'tagName' in node;
const plainText = (node: Tree.Node): string =>
  'value' in node
    ? node.value
    : children(node)
        .filter((n) => !element(n) || !IGNORED.has(n.tagName))
        .map(plainText)
        .join('');

/** Parse into data only. Imported markup is never inserted into a browser document. */
export function parseHtml(source: string, name = 'essay.html') {
  const root = parse(source, { sourceCodeLocationInfo: true });
  const b = new DocumentBuilder('html', name, { [name]: source });
  b.warnings.push(
    'HTML uses Nitpick’s reading layout. Original styles, scripts, forms, and page layout are not applied; the original HTML is retained in the project.',
  );
  let pending: DraftRun[] = [];
  const warn = (message: string) => b.warnings.push(message);
  const pos = (node: Tree.Node) =>
    node.sourceCodeLocation
      ? {
          file: name,
          start: node.sourceCodeLocation.startOffset,
          end: node.sourceCodeLocation.endOffset,
        }
      : undefined;
  function add(run: DraftRun) {
    if (!run.text) return;
    const last = pending.at(-1);
    const linear = (r: DraftRun) => r.source && r.source.end - r.source.start === r.text.length;
    // Keep ordinary prose in long spans, while retaining boundaries for formatting,
    // normalized whitespace, images and exact source coordinates.
    if (
      last &&
      !last.atomic &&
      !run.atomic &&
      !last.kind &&
      !run.kind &&
      last.style === run.style &&
      ((!last.source && !run.source) ||
        (linear(last) && linear(run) && last.source!.end === run.source!.start))
    ) {
      last.text += run.text;
      if (last.source) last.source.end = run.source!.end;
    } else pending.push(run);
  }
  function flush(ctx: Context = {}, kind: Block['kind'] = ctx.kind ?? 'paragraph', level?: number) {
    // HTML collapses ASCII whitespace, while NBSP and Unicode spacing remain intact.
    if (!ctx.pre) {
      while (pending.length && /^[ \t\r\n\f]*$/.test(pending[0].text)) pending.shift();
      while (pending.length && /^[ \t\r\n\f]*$/.test(pending.at(-1)!.text)) pending.pop();
      for (const [run, side] of [
        [pending[0], 'start'],
        [pending.at(-1), 'end'],
      ] as const) {
        if (!run) continue;
        const old = run.text;
        run.text =
          side === 'start' ? old.replace(/^[ \t\r\n\f]+/, '') : old.replace(/[ \t\r\n\f]+$/, '');
        if (run.source && run.source.end - run.source.start === old.length) {
          if (side === 'start') run.source.start += old.length - run.text.length;
          else run.source.end -= old.length - run.text.length;
        }
      }
    }
    if (!pending.some((r) => r.text)) {
      pending = [];
      return;
    }
    const previous = b.blocks.length;
    pending.forEach((r) => b.add(r));
    pending = [];
    b.flush(kind, level);
    if (ctx.list && b.blocks.length > previous && kind === 'list') {
      b.blocks.at(-1)!.listMarker = ctx.list.used ? '' : ctx.list.marker;
      ctx.list.used = true;
    }
  }
  function text(node: Tree.TextNode, ctx: Context) {
    const sourceRange = pos(node),
      raw = sourceRange ? source.slice(sourceRange.start, sourceRange.end) : '';
    const linear = raw === node.value;
    if (ctx.pre) {
      add({ text: node.value, style: ctx.style, source: linear ? sourceRange : undefined });
      return;
    }
    for (const token of node.value.matchAll(/[ \t\r\n\f]+|[^ \t\r\n\f]+/g)) {
      const whitespace = /^[ \t\r\n\f]/.test(token[0]);
      if (whitespace && (!pending.length || /[ \t\r\n\f]$/.test(pending.at(-1)!.text))) continue;
      add({
        text: whitespace ? ' ' : token[0],
        style: ctx.style,
        source:
          linear && sourceRange
            ? {
                file: name,
                start: sourceRange.start + token.index,
                end: sourceRange.start + token.index + token[0].length,
              }
            : undefined,
      });
    }
  }
  function placeholder(node: Tree.Element, label: string, ctx: Context) {
    add({
      text: `[${label}]`,
      kind: 'placeholder',
      atomic: true,
      source: pos(node),
      style: ctx.style,
    });
  }
  function image(node: Tree.Element, ctx: Context) {
    const src = attribute(node, 'src') ?? '',
      label =
        attribute(node, 'alt') ||
        attribute(node, 'title') ||
        (src && !src.startsWith('data:') ? src : 'HTML image');
    const compact = src.replace(/[\t\r\n ]/g, '');
    if (/^data:image\/(?:png|jpeg|gif|webp|avif);base64,[A-Za-z0-9+/]+={0,2}$/i.test(compact)) {
      const key = `html-image-${Object.keys(b.assets).length}`;
      b.assets[key] = compact;
      add({
        text: `[Image: ${label}]`,
        kind: 'image',
        image: key,
        atomic: true,
        source: pos(node),
      });
    } else {
      placeholder(node, `Image unavailable: ${label}`, ctx);
      warn(
        'External, relative, SVG, or invalid HTML images are shown as labeled placeholders. Embed PNG, JPEG, GIF, WebP, or AVIF images as data URLs to include them without network access.',
      );
    }
  }
  function walk(node: Tree.Node, ctx: Context = {}, depth = 0) {
    if (depth > 256)
      throw new Error('This HTML file is nested too deeply to import. Your existing work is safe.');
    if ('value' in node) {
      text(node, ctx);
      return;
    }
    if (!element(node)) {
      for (const child of children(node)) walk(child, ctx, depth + 1);
      return;
    }
    const tag = node.tagName;
    if (
      IGNORED.has(tag) ||
      attribute(node, 'hidden') !== undefined ||
      /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/i.test(
        attribute(node, 'style') ?? '',
      )
    )
      return;
    if (tag === 'img') {
      image(node, ctx);
      return;
    }
    if (tag === 'br') {
      add({ text: '\n', source: pos(node) });
      return;
    }
    if (tag === 'hr') {
      if (!ctx.cell) flush(ctx);
      add({ text: '────────', atomic: true, source: pos(node) });
      if (!ctx.cell) flush(ctx);
      return;
    }
    if (['iframe', 'embed', 'object', 'canvas', 'svg', 'math', 'audio', 'video'].includes(tag)) {
      const label =
        attribute(node, 'aria-label') ||
        attribute(node, 'title') ||
        (tag === 'math' ? plainText(node) : '');
      placeholder(node, `${tag.toUpperCase()} content${label ? `: ${label}` : ''}`, ctx);
      warn(
        'Embedded media, SVG drawings, and MathML are shown as selectable labeled placeholders; their source is retained.',
      );
      return;
    }
    if (['input', 'textarea', 'select', 'button'].includes(tag)) {
      const label =
        attribute(node, 'aria-label') ||
        attribute(node, 'placeholder') ||
        attribute(node, 'value') ||
        plainText(node).trim();
      if (attribute(node, 'type') !== 'hidden')
        placeholder(node, `Form control${label ? `: ${label}` : ''}`, ctx);
      warn('HTML form controls are read-only placeholders.');
      return;
    }
    if (tag === 'table' && !ctx.cell) {
      flush(ctx);
      const rows: Tree.Element[] = [];
      function findRows(parent: Tree.Node) {
        for (const child of children(parent)) {
          if (!element(child)) continue;
          if (child.tagName === 'table') continue;
          if (child.tagName === 'caption') {
            walk(child, {}, depth + 1);
            flush();
          } else if (child.tagName === 'tr') rows.push(child);
          else findRows(child);
        }
      }
      findRows(node);
      rows.forEach((row, rowIndex) => {
        if (rowIndex) add({ text: '\n', atomic: true });
        row.childNodes
          .filter(element)
          .filter((cell) => ['td', 'th'].includes(cell.tagName))
          .forEach((cell, cellIndex) => {
            if (cellIndex) add({ text: '\t', atomic: true });
            if (attribute(cell, 'colspan') || attribute(cell, 'rowspan'))
              warn(
                'Merged HTML table cells are flattened into a reading grid; all cell text is retained.',
              );
            for (const child of cell.childNodes)
              walk(
                child,
                { cell: true, style: cell.tagName === 'th' ? 'strong' : undefined },
                depth + 1,
              );
          });
      });
      flush({}, 'table');
      return;
    }
    if ((tag === 'ul' || tag === 'ol') && !ctx.cell) {
      flush(ctx);
      let number = Number(attribute(node, 'start') ?? 1);
      if (!Number.isSafeInteger(number)) number = 1;
      for (const child of children(node)) {
        if (element(child) && child.tagName === 'li') {
          const explicit = Number(attribute(child, 'value'));
          if (attribute(child, 'value') !== undefined && Number.isSafeInteger(explicit))
            number = explicit;
          const li = {
            kind: 'list' as const,
            list: { marker: tag === 'ol' ? `${number++}.` : '•', used: false },
          };
          for (const nested of children(child)) walk(nested, li, depth + 1);
          flush(li);
        } else walk(child, ctx, depth + 1);
      }
      return;
    }
    const heading = /^h[1-6]$/.test(tag);
    const block = BLOCKS.has(tag) || tag === 'pre' || tag === 'li' || heading;
    if (block && !ctx.cell) flush(ctx);
    else if (block && ctx.cell && pending.length && !/[\n\t]$/.test(pending.at(-1)!.text))
      add({ text: '\n' });
    const next: Context = {
      ...ctx,
      pre: ctx.pre || tag === 'pre',
      style: ['strong', 'b'].includes(tag)
        ? 'strong'
        : ['em', 'i'].includes(tag)
          ? 'emphasis'
          : ['pre', 'code', 'kbd', 'samp'].includes(tag)
            ? 'code'
            : ['del', 's', 'strike'].includes(tag)
              ? 'deleted'
              : tag === 'ins'
                ? 'inserted'
                : tag === 'sup'
                  ? 'footnote'
                  : ctx.style,
    };
    for (const child of children(node)) walk(child, next, depth + 1);
    if (block && !ctx.cell)
      flush(
        next,
        heading
          ? tag === 'h1' && b.blocks.length === 0
            ? 'title'
            : 'heading'
          : (ctx.kind ?? 'paragraph'),
        heading ? Number(tag[1]) : undefined,
      );
  }
  walk(root);
  flush();
  const doc = b.finish(name);
  if (!doc.text.trim())
    throw new Error(
      'This HTML file contains no readable text or supported content. Your existing work is safe.',
    );
  return doc;
}

export function decodeHtml(bytes: Uint8Array): string {
  // HTML saved from older tools may declare a legacy charset. UTF BOMs win.
  let encoding =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? 'utf-16le'
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? 'utf-16be'
        : 'utf-8';
  if (encoding === 'utf-8' && !(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) {
    const head = new TextDecoder('windows-1252').decode(bytes.subarray(0, 1024));
    for (const meta of head.matchAll(/<meta\b[^>]*>/gi)) {
      const charset = /\bcharset\s*=\s*["']?\s*([^\s"'/>;]+)/i.exec(meta[0]);
      if (charset) {
        encoding = charset[1];
        break;
      }
    }
  }
  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch {
    throw new Error(
      `This HTML file declares an unsupported character encoding (${encoding}). Save it as UTF-8 and try again. Your existing work is safe.`,
    );
  }
}
