import type { Annotation, Doc, ExportSettings, Project } from './types';
import { pdfAreaLabel } from './pdf-anchors';
import { sectionLabel } from './outline';
import { overlapGroups, overlappingIds } from './overlap';
import { context, location, matches, sourceQuote } from './model';
const esc = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
export function filteredAnnotations(p: Project, s: ExportSettings) {
  return p.annotations
    .filter((a) => matches(a, s.filters))
    .sort((a, b) => a.anchor.start - b.anchor.start || a.createdAt - b.createdAt);
}
function instruction(a: Annotation) {
  if (a.type === 'Replace')
    return `With: "${a.replacement}"${!a.replacement ? ' [unfinished replacement]' : ''}${a.note ? `\nInstruction: ${a.note}` : ''}`;
  if (a.type === 'Insert')
    return `Insert ${a.placement}: "${a.replacement}"${!a.replacement ? ' [unfinished insertion]' : ''}${a.note ? `\nInstruction: ${a.note}` : ''}`;
  if (a.type === 'Verify')
    return `Instruction: ${a.note || 'Find a source; if none exists, flag it.'}`;
  if (a.type === 'Keep') return `Instruction: ${a.note || 'Preserve this text unchanged.'}`;
  return a.note
    ? `Instruction: ${a.note}`
    : a.type === 'Comment'
      ? 'Instruction: [unfinished comment]'
      : '';
}
function quote(d: Doc, a: Annotation, ai: boolean) {
  return ai && d.format === 'tex' ? sourceQuote(d, a.anchor) : a.anchor.quote;
}
function dest(d: Doc, a: Annotation, ai: boolean) {
  const t = a.destination;
  return t
    ? `Destination: ${a.placement} "${t.region ? pdfAreaLabel(t) : ai && d.format === 'tex' ? sourceQuote(d, t) : t.quote}" in ${location(t, d)}.\nAdjacent text before: "${t.before}"\nAdjacent text after: "${t.after}"`
    : a.destinationUncertain
      ? 'Destination: Not sure yet. Propose a suitable location for review; do not move the text until the destination is confirmed.'
      : 'Destination: [unfinished — select a destination before applying this move]';
}
export function listMarkdown(p: Project, s: ExportSettings) {
  const ai = s.audience === 'ai',
    all = filteredAnnotations(p, s),
    d = p.doc;
  let text = ai
    ? `${s.instructions}\n\n# Revisions for ${p.title}\n\n`
    : `# Revisions for ${p.title}\n\n`;
  if (!all.length) return text + 'No annotations match these filters.\n';
  const peers = (a: Annotation) =>
    all.filter(
      (other) => other.id !== a.id && overlappingIds([a, other], ai && d.format === 'tex').size > 0,
    );
  const groups = new Map<string, Annotation[]>();
  for (const a of all) {
    const heading = ai
      ? a.scope === 'document'
        ? 'DOCUMENT'
        : a.scope === 'section'
          ? `SECTION ${sectionLabel(d, a.anchor.section)} ("${a.anchor.heading}")`
          : a.scope === 'paragraph'
            ? d.pdf ? 'PAGE NOTES' : 'PARAGRAPH NOTES'
            : 'SPECIFIC EDITS'
      : a.scope === 'document'
        ? 'Document notes'
        : d.pdf ? location(a.anchor, d)
        : a.anchor.section
          ? `Section ${sectionLabel(d, a.anchor.section)} ("${a.anchor.heading}")`
          : 'Document';
    const arr = groups.get(heading) ?? [];
    arr.push(a);
    groups.set(heading, arr);
  }
  const order = ai
    ? [...groups.keys()].sort((x, y) => {
        const rank = (v: string) =>
          v === 'DOCUMENT' ? 0 : v.startsWith('SECTION') ? 1 : ['PARAGRAPH NOTES','PAGE NOTES'].includes(v) ? 2 : 3;
        return rank(x) - rank(y);
      })
    : [...groups.keys()];
  for (const heading of order) {
    text += `## ${heading}\n\n`;
    for (const a of groups.get(heading)!) {
      const label =
        a.scope === 'document'
          ? 'the whole document'
          : a.scope === 'section'
            ? `${location(a.anchor, d, 'section')}${a.anchor.quote ? ` — "${quote(d, a, ai)}"` : ''}`
            : a.anchor.region ? `${pdfAreaLabel(a.anchor)} on ${location(a.anchor,d)}` : `"${quote(d, a, ai)}" in ${location(a.anchor, d)}`;
      if (ai) {
        text += `- [${a.id}] ${a.type.toUpperCase()}: ${label}\n`;
        if (a.scope === 'selection' && !a.anchor.region)
          text += `  Context: "${context(d, a.anchor, d.format === 'tex')}"\n`;
        if (d.format === 'tex' && a.anchor.source.length)
          text += `  Source: ${a.anchor.source.map((r) => `${r.file}:${r.start}-${r.end} (UTF-16 offsets)`).join('; ')}\n`;
        if (peers(a).length)
          text += `  Overlaps: ${peers(a)
            .map((other) => `[${other.id}]`)
            .join(', ')}. Review these notes together; do not assume precedence.\n`;
        if (a.type === 'Move') text += '  ' + dest(d, a, true).replaceAll('\n', '\n  ') + '\n';
        const ins = instruction(a);
        if (ins) text += '  ' + ins.replaceAll('\n', '\n  ') + '\n';
      } else {
        text += `- ${a.type} ${label}`;
        if (a.type === 'Replace')
          text += ` with "${a.replacement}"${!a.replacement ? ' (unfinished)' : ''}`;
        if (a.type === 'Insert')
          text += `; insert "${a.replacement}" ${a.placement}${!a.replacement ? ' (unfinished)' : ''}`;
        text += '.';
        if (a.type === 'Move') text += '\n  ' + dest(d, a, false).replaceAll('\n', '\n  ');
        if (a.note) text += ` ${a.note}`;
        else if (a.type === 'Verify') text += ' Find a source; if none exists, flag it.';
        else if (a.type === 'Keep') text += ' Preserve this text unchanged.';
        else if (a.type === 'Comment') text += ' (Unfinished comment.)';
        if (peers(a).length)
          text += ' This text also has other revision notes; review them together.';
        text += '\n';
      }
      text += '\n';
    }
  }
  return text;
}
export function jsonExport(p: Project, s: ExportSettings) {
  return JSON.stringify(
    {
      schema: 'nitpick-revisions/1',
      document: p.title,
      instructions: s.instructions,
      edits: filteredAnnotations(p, s).map((a) => ({
        ...a,
        quote: quote(p.doc, a, true),
        location: location(a.anchor, p.doc, a.scope),
        context:
          a.scope === 'selection' ? context(p.doc, a.anchor, p.doc.format === 'tex') : undefined,
        instruction: instruction(a),
        overlapsWith: filteredAnnotations(p, s)
          .filter(
            (other) =>
              other.id !== a.id && overlappingIds([a, other], p.doc.format === 'tex').size > 0,
          )
          .map((other) => other.id),
      })),
    },
    null,
    2,
  );
}
function critic(a: Annotation, old: string, d: Doc) {
  const extra = a.note ? ` {>>${a.note}<<}` : '';
  switch (a.type) {
    case 'Delete':
      return `{--${old}--}${extra}`;
    case 'Replace':
      return `{~~${old}~>${a.replacement}~~}${extra}`;
    case 'Insert':
      return a.placement === 'before'
        ? `{++${a.replacement}++}${old}${extra}`
        : `${old}{++${a.replacement}++}${extra}`;
    case 'Comment':
      return `${old}{>>${a.note || '[unfinished comment]'}<<}`;
    default:
      return `${old}{>>${a.type.toUpperCase()}: ${a.type === 'Move' ? dest(d, a, true) : a.note || (a.type === 'Verify' ? 'Find a source; if none exists, flag it.' : 'Preserve unchanged.')}<<}`;
  }
}
export function inlineExport(p: Project, s: ExportSettings) {
  const ai = s.audience === 'ai',
    all = filteredAnnotations(p, s),
    d = p.doc;
  // Shared instructions are exported together; neither annotation silently takes precedence.
  const overlapping = overlappingIds(all, ai && d.format === 'tex');
  let body = '';
  const render = (a: Annotation, old: string) => {
    if (ai)
      return overlapping.has(a.id)
        ? `${old}{>>${a.type.toUpperCase()} [${a.id}]: "${quote(d, a, true)}" in ${location(a.anchor, d, a.scope)}. ${instruction(a)} ${a.type === 'Move' ? dest(d, a, true) : ''} (overlapping annotation; review conflicts)<<}`
        : critic(a, old, d);
    const tag = (kind: string, text: string) => `<${kind}>${esc(text)}</${kind}>`;
    const note = `<aside class="note"><b>${esc(a.type)}</b>, ${esc(location(a.anchor, d, a.scope))}${a.note ? ` — ${esc(a.note)}` : ''}${a.type === 'Move' ? ` — ${esc(dest(d, a, false))}` : ''}${a.type === 'Verify' && !a.note ? ' — Find a source; if none exists, flag it.' : ''}</aside>`;
    if (overlapping.has(a.id))
      return (
        esc(old) +
        `<aside class="overlap-review">Overlapping notes: review together</aside>` +
        note +
        `<blockquote>"${esc(a.anchor.quote)}" ${esc(instruction(a))}</blockquote>`
      );
    if (a.type === 'Delete') return tag('del', old) + note;
    if (a.type === 'Replace')
      return tag('del', old) + tag('ins', a.replacement || '[unfinished replacement]') + note;
    if (a.type === 'Insert')
      return (
        (a.placement === 'before'
          ? tag('ins', a.replacement || '[unfinished insertion]') + esc(old)
          : esc(old) + tag('ins', a.replacement || '[unfinished insertion]')) + note
      );
    return `<mark>${esc(old)}</mark>` + note;
  };
  if (ai && d.format === 'tex') {
    // Keep every original project file intact; apply only single-source, non-overlapping anchored marks.
    for (const [file, raw] of Object.entries(d.files).filter(([file]) => file.endsWith('.tex'))) {
      let out = '',
        cursor = 0;
      const edits = all
        .filter(
          (a) =>
            a.scope !== 'document' &&
            a.anchor.source.length === 1 &&
            a.anchor.source[0].file === file &&
            !overlapping.has(a.id),
        )
        .sort((a, b) => a.anchor.source[0].start - b.anchor.source[0].start);
      for (const a of edits) {
        const r = a.anchor.source[0];
        if (r.start < cursor) continue;
        out += raw.slice(cursor, r.start) + critic(a, raw.slice(r.start, r.end), d);
        cursor = r.end;
      }
      out += raw.slice(cursor);
      body += `\n\nFILE: ${file}\n\n${out}`;
    }
    const unresolved = all.filter(
      (a) => a.scope === 'document' || a.anchor.source.length !== 1 || overlapping.has(a.id),
    );
    if (unresolved.length)
      body +=
        '\n\n' +
        unresolved
          .map(
            (a) =>
              `{>>${a.type.toUpperCase()} [${a.id}]: "${quote(d, a, true)}" in ${location(a.anchor, d, a.scope)}. ${instruction(a)} ${a.type === 'Move' ? dest(d, a, true) : ''}${overlapping.has(a.id) ? ' (overlapping source or selection; review together)' : ''}<<}`,
          )
          .join('\n');
  } else {
    let cursor = 0;
    for (const group of overlapGroups(all.filter(a => !a.anchor.region))) {
      const between = d.text.slice(cursor, group.start);
      body += ai ? between : esc(between);
      const original = d.text.slice(group.start, group.end);
      if (group.annotations.length === 1) body += render(group.annotations[0], original);
      else {
        body += ai ? original : `<span class="overlap-text">${esc(original)}</span>`;
        for (const a of group.annotations) body += render(a, '');
      }
      cursor = group.end;
    }
    body += ai ? d.text.slice(cursor) : esc(d.text.slice(cursor));
    for (const a of all.filter(a => a.anchor.region)) body += ai ? `\n{>>${a.type.toUpperCase()} [${a.id}]: ${pdfAreaLabel(a.anchor)} on ${location(a.anchor,d)}. ${instruction(a)} ${a.type === 'Move' ? dest(d,a,true) : ''}<<}` : `<aside class="note">${esc(a.type)}: ${esc(pdfAreaLabel(a.anchor))} on ${esc(location(a.anchor,d))}. ${esc(instruction(a))}</aside>`;
    for (const a of all.filter((a) => a.scope === 'document'))
      body += ai
        ? `\n{>>DOCUMENT ${a.type.toUpperCase()}: ${a.note || instruction(a)}<<}`
        : `<aside class="note"><b>${esc(a.type)}</b>, whole document: ${esc(a.note || instruction(a))}</aside>`;
  }
  if (ai) return s.instructions + (d.pdf ? '\n\nExtracted PDF text follows in embedded reading order. Consult the original PDF for layout. Area annotations are listed separately.\n' : '') + '\n\n' + body;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(p.title)} — Revisions</title><style>body{max-width:760px;margin:56px auto;padding:24px;color:#202020;background:#ffffff;font:18px/1.7 Georgia,'Times New Roman',serif}article{white-space:pre-wrap}h1{font:700 32px/1.25 Arial,'Helvetica Neue',Helvetica,sans-serif;color:#03629c;margin:0 0 8px}header p{font:14px/1.5 Arial,'Helvetica Neue',Helvetica,sans-serif;color:#646464;margin:0 0 32px}del{color:#ce2c31;background:#feebec}ins{color:#2a7e3b;background:#e9f6e9;text-decoration:none}mark{background:#fff7c2;color:inherit}.overlap-text{text-decoration:underline double #646464;text-underline-offset:4px}.overlap-review{font:700 14px/1.5 Arial,'Helvetica Neue',Helvetica,sans-serif;color:#646464;margin-top:12px}.note{display:block;padding:8px 12px;margin:8px 0;font:14px/1.5 Arial,'Helvetica Neue',Helvetica,sans-serif;color:#202020;background:#f0f0f0;border-radius:4px}blockquote{font-size:14px;margin:8px 0}@media print{body{margin:0;max-width:none;background:none}.note{break-inside:avoid}}</style><header><h1>${esc(p.title)}</h1><p>Revision notes</p></header><article>${body}</article></html>`;
}
export function exportText(p: Project, s: ExportSettings) {
  if (s.format === 'pdf') return listMarkdown(p, {...s, layout:'list',audience:'people'});
  return s.layout === 'inline'
    ? inlineExport(p, s)
    : s.format === 'json'
      ? jsonExport(p, s)
      : listMarkdown(p, s);
}
export async function exportDocx(p: Project, s: ExportSettings) {
  const { Document, Packer, Paragraph, TextRun } = await import('docx');
  const lines = listMarkdown(p, { ...s, audience: 'people', layout: 'list' }).split('\n');
  return Packer.toBlob(
    new Document({
      sections: [
        {
          children: lines.map(
            (line) =>
              new Paragraph({
                children: [
                  new TextRun({ text: line.replace(/^#+ /, ''), bold: line.startsWith('#') }),
                ],
                spacing: { after: 140 },
              }),
          ),
        },
      ],
    }),
  );
}
