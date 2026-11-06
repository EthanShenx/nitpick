import { parse, getParser } from '@unified-latex/unified-latex-util-parse';
import { DocumentBuilder } from './model';
import type { DraftRun } from './model';
import { readBibliography, citationName, referenceText, bibText } from './bibliography';
import type { BibEntry } from './bibliography';

type N = {
  type: string;
  content?: any;
  env?: string;
  args?: N[];
  openMark?: string;
  closeMark?: string;
  position?: { start: { offset: number }; end: { offset: number } };
};

const citationCommands = [
  'cite',
  'parencite',
  'textcite',
  'autocite',
  'footcite',
  'citep',
  'citet',
  'citeauthor',
  'citeyear',
];
const parser = getParser({
  macros: {
    ...Object.fromEntries(citationCommands.map((c) => [c, { signature: 's o o m' }])),
    fancyhead: { signature: 'o m' },
    fancyfoot: { signature: 'o m' },
    fancyhf: { signature: 'o m' },
    captionsetup: { signature: 'o m' },
    captionof: { signature: 's m o m' },
    graphicspath: { signature: 'm' },
    printbibliography: { signature: 'o' },
    addbibresource: { signature: 'o m' },
    rowcolor: { signature: 'o m o o' },
    cellcolor: { signature: 'o m' },
    vspace: { signature: 's m' },
    hspace: { signature: 's m' },
    textsc: { signature: 'm' },
    linespread: { signature: 'm' },
    setstretch: { signature: 'm' },
    newfontfamily: { signature: 'm o m o' },
  },
  environments: { longtable: { signature: 'o m' } },
});
function parseDocument(source: string): N {
  return parser.runSync(parser.parse(source)) as N;
}

function endOf(n: N): number {
  let end = n.position?.end.offset ?? 0;
  if (n.type === 'argument') {
    for (const c of n.content ?? []) end = Math.max(end, endOf(c));
    return end + (n.closeMark?.length ?? 0);
  }
  for (const a of n.args ?? []) end = Math.max(end, endOf(a));
  return end;
}
function plain(nodes: N[]): string {
  return nodes
    .map((n) =>
      n.type === 'whitespace'
        ? ' '
        : n.type === 'parbreak'
          ? '\n\n'
          : n.type === 'string'
            ? n.content
            : n.type === 'macro'
              ? n.args?.length
                ? plain(n.args.at(-1)!.content ?? [])
                : `\\${n.content}`
              : Array.isArray(n.content)
                ? plain(n.content)
                : '',
    )
    .join('');
}
function rawArgument(n: N, source: string) {
  const children = n.content ?? [];
  if (!children.length) return '';
  return source.slice(children[0].position?.start.offset ?? 0, endOf(children.at(-1)!));
}
export function resolvePath(
  current: string,
  target: string,
  available: Record<string, unknown>,
  extension = '',
) {
  const dir = current.includes('/') ? current.slice(0, current.lastIndexOf('/') + 1) : '';
  const normalize = (p: string) => {
    const parts: string[] = [];
    for (const a of p.split('/')) {
      if (a === '..') parts.pop();
      else if (a && a !== '.') parts.push(a);
    }
    return parts.join('/');
  };
  for (const p of [normalize(dir + target), normalize(target)])
    for (const suffix of ['', extension])
      if (Object.hasOwn(available, p + suffix)) return p + suffix;
  return undefined;
}
export function parseLatex(
  files: Record<string, string>,
  main: string,
  assets: Record<string, string> = {},
  name = main,
) {
  if (!files[main]) throw new Error(`The main LaTeX file "${main}" is missing or empty.`);
  const b = new DocumentBuilder('tex', main, files, assets);
  const trees: Record<string, N> = {};
  const macros: Record<string, { args: number; body: string }> = {};
  let title: { node: N; file: string } | undefined;
  let tableMode = false;
  let coverMode = false;
  let coverTitleSeen = false;
  const graphicPaths: { file: string; path: string }[] = [];
  const fontCommands = new Set<string>();
  const bibliography = new Map<string, BibEntry>();
  const cited = new Set<string>();
  const references: Record<string, string> = {};
  const counters = { figure: 0, table: 0, section: 0 };
  let currentReference = '';
  const captionNumbers = new WeakMap<N, { type: string; number: number }>();
  let currentTable = 0;
  let floatType = 'figure';
  const stack: string[] = [];
  function tree(file: string): N {
    if (trees[file]) return trees[file];
    try {
      trees[file] = parseDocument(files[file]);
    } catch (e) {
      throw new Error(
        `Could not parse ${file}: ${e instanceof Error ? e.message : String(e)}. Existing work has been kept.`,
      );
    }
    return trees[file];
  }
  function collect(n: N, file: string) {
    if (n.type === 'macro') {
      const command = n.content as string;
      const args = n.args ?? [];
      const last = args.at(-1);
      if (['newcommand', 'renewcommand', 'providecommand'].includes(command)) {
        const key = plain(args[2]?.content ?? []).replace(/^\\/, '');
        if (key)
          macros[key] = {
            args: Number(plain(args[3]?.content ?? [])) || 0,
            body: rawArgument(last!, files[file]),
          };
        return; // Definition bodies are not document content.
      }
      if (command === 'newfontfamily') {
        fontCommands.add(plain(args[0]?.content ?? []).replace(/^\\/, ''));
        return;
      }
      if (command === 'graphicspath') {
        for (const group of last?.content ?? [])
          if (group.type === 'group') graphicPaths.push({ file, path: plain(group.content) });
        return;
      }
      if (command === 'addbibresource' || command === 'bibliography') {
        for (const target of plain(last?.content ?? []).split(',')) {
          const path = resolvePath(file, target.trim(), files, '.bib');
          if (path) for (const e of readBibliography(files[path], path)) bibliography.set(e.key, e);
          else
            b.warnings.push(
              `Missing bibliography: ${target}. Import the complete LaTeX folder or ZIP.`,
            );
        }
        return;
      }
      if (command === 'title') title = { node: n, file };
      if (command === 'section' && !plain(args[0]?.content ?? []).includes('*'))
        currentReference = String(++counters.section);
      if (command === 'caption' || command === 'captionof') {
        const type = command === 'captionof' ? plain(args[1]?.content ?? []) : floatType;
        if (type === 'figure' || type === 'table') {
          const number = ++counters[type];
          currentReference = String(number);
          captionNumbers.set(n, { type, number });
        }
      }
      if (command === 'label') references[plain(last?.content ?? [])] = currentReference;
      if (citationCommands.includes(command))
        for (const key of plain(last?.content ?? []).split(','))
          if (key.trim()) cited.add(key.trim());
      if (['input', 'include'].includes(command)) {
        const target = resolvePath(file, plain(last?.content ?? []), files, '.tex');
        if (target && !collected.has(target)) {
          collected.add(target);
          collect(tree(target), target);
        }
        return;
      }
      // Do not read definitions, font options, page headers, or layout hooks as prose.
      if (/^(Declare|renewbibmacro|newbibmacro|At|titleformat|titlespacing|fancy)/.test(command))
        return;
      for (const arg of args) for (const c of arg.content ?? []) collect(c, file);
    }
    const prior = floatType;
    if (n.type === 'environment') {
      if (/^figure/.test(n.env ?? '')) floatType = 'figure';
      if (/^(table|tabular|longtable)/.test(n.env ?? '')) floatType = 'table';
    }
    if (Array.isArray(n.content)) for (const c of n.content) collect(c, file);
    floatType = prior;
  }
  // Definitions from project files are collected without expanding or executing TeX.
  const collected = new Set([main]);
  collect(tree(main), main);
  function flushProse() {
    const count = b.blocks.length;
    const title = coverMode && !coverTitleSeen;
    b.flush(title ? 'title' : undefined, title ? 1 : undefined);
    if (coverMode && b.blocks.length > count) coverTitleSeen = true;
  }
  function visit(nodes: N[], file: string, style?: DraftRun['style']) {
    const source = files[file];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i],
        start = n.position?.start.offset ?? 0;
      let end = endOf(n);
      const pos = () => ({ file, start, end });
      const atom = (text: string, extra: Partial<DraftRun> = {}) =>
        b.add({ text, atomic: true, source: pos(), ...extra });
      const placeholder = (label: string) => {
        atom(`[${label}]`, { kind: 'placeholder' });
        b.warnings.push(`${label}: preserved as a selectable placeholder; source is retained.`);
      };
      if (n.type === 'string') {
        // TeX typography is many-to-one; keep each substitution source-backed.
        const rest = source.slice(start);
        const token = /^(---|--|``|'')/.exec(rest)?.[0];
        if (token && token.length > n.content.length) {
          const targetEnd = start + token.length;
          let j = i;
          while (
            j + 1 < nodes.length &&
            endOf(nodes[j]) < targetEnd &&
            nodes[j + 1].type === 'string'
          )
            j++;
          if (endOf(nodes[j]) === targetEnd) {
            i = j;
            end = targetEnd;
            atom(
              ({ '---': '—', '--': '–', '``': '“', "''": '”' } as Record<string, string>)[token],
              { style },
            );
            continue;
          }
        }
        if (n.content === '~') {
          atom(' ', { style });
          continue;
        }
        b.add({
          text: tableMode && n.content === '&' ? '\t' : n.content,
          source: pos(),
          atomic: tableMode && n.content === '&',
          style,
        });
        continue;
      }
      if (n.type === 'whitespace') {
        b.add({ text: ' ', source: pos(), atomic: source.slice(start, end) !== ' ', style });
        continue;
      }
      if (n.type === 'parbreak') {
        if (tableMode) continue;
        flushProse();
        continue;
      }
      if (n.type === 'comment') continue;
      if (n.type === 'group' || n.type === 'argument') {
        visit(n.content ?? [], file, style);
        continue;
      }
      if (['inlinemath', 'displaymath', 'mathenv'].includes(n.type)) {
        const display = n.type !== 'inlinemath';
        const raw = source.slice(start, end);
        const math =
          n.type === 'mathenv'
            ? raw.replace(/^\\begin\{[^}]+\}/, '').replace(/\\end\{[^}]+\}$/, '')
            : raw.replace(/^(\$\$?|\\\[|\\\()/, '').replace(/(\$\$?|\\\]|\\\))$/, '');
        if (display) b.flush();
        atom(math.trim(), { kind: 'math', math: math.trim(), display });
        if (display) b.flush();
        continue;
      }
      if (n.type === 'environment') {
        const env = n.env ?? '';
        if (env === 'document') {
          visit(n.content ?? [], file);
          continue;
        }
        if (
          [
            'itemize',
            'enumerate',
            'description',
            'quote',
            'quotation',
            'center',
            'abstract',
            'figure',
            'figure*',
            'table',
            'table*',
            'tabular',
            'tabular*',
            'longtable',
            'minipage',
            'titlepage',
            'flushleft',
            'flushright',
          ].includes(env)
        ) {
          b.flush();
          const prior = tableMode,
            priorCover = coverMode;
          if (env.startsWith('tabular') || env === 'longtable') tableMode = true;
          if (env === 'titlepage') {
            coverMode = true;
            coverTitleSeen = false;
          }
          const content = n.content ?? [];
          // Unpaginated HTML has no repeated page heads/feet. Keep their content as rows.
          if (env === 'longtable')
            b.warnings.push(
              'Longtable content is shown as a continuous table, including any repeated header/footer rows; page layout and row colours are not reproduced.',
            );
          visit(content, file, style);
          tableMode = prior;
          coverMode = priorCover;
          b.flush(
            env.startsWith('tabular') || env === 'longtable'
              ? 'table'
              : env === 'titlepage'
                ? 'title'
                : ['itemize', 'enumerate', 'description'].includes(env)
                  ? 'list'
                  : env.startsWith('figure')
                    ? 'figure'
                    : 'paragraph',
          );
        } else {
          b.flush();
          placeholder(`Unsupported environment: ${env}`);
          b.flush();
        }
        continue;
      }
      if (n.type === 'macro') {
        const command = n.content as string;
        const args = n.args ?? [];
        const last = args.at(-1);
        if (
          [
            'newcommand',
            'renewcommand',
            'providecommand',
            'documentclass',
            'usepackage',
            'author',
            'date',
            'label',
            'bibliographystyle',
            'pagestyle',
            'setlength',
            'geometry',
            'centering',
            'hline',
            'toprule',
            'midrule',
            'bottomrule',
            'noindent',
            'fancyhead',
            'fancyfoot',
            'fancyhf',
            'captionsetup',
            'rowcolor',
            'cellcolor',
            'begingroup',
            'endgroup',
            'small',
            'footnotesize',
            'scriptsize',
            'tiny',
            'normalsize',
            'large',
            'Large',
            'LARGE',
            'huge',
            'Huge',
            'normalfont',
            'sffamily',
            'rmfamily',
            'raggedright',
            'raggedleft',
            'arraybackslash',
            'vspace',
            'hspace',
            'vfill',
            'hfill',
            'endfirsthead',
            'endhead',
            'endfoot',
            'endlastfoot',
            'graphicspath',
            'addbibresource',
            'newfontfamily',
            'linespread',
            'selectfont',
            'setstretch',
          ].includes(command)
        )
          continue;
        if (fontCommands.has(command)) continue;
        if (
          [
            'title',
            'section',
            'subsection',
            'subsubsection',
            'chapter',
            'paragraph',
            'caption',
            'captionof',
          ].includes(command)
        ) {
          if (command === 'title') continue;
          b.flush(tableMode ? 'table' : undefined);
          const caption = command === 'caption' || command === 'captionof';
          const numbered = captionNumbers.get(n);
          if (numbered?.type === 'table') currentTable = numbered.number;
          visit(last?.content ?? [], file, caption ? 'emphasis' : undefined);
          b.flush(
            caption ? 'paragraph' : 'heading',
            (
              { chapter: 1, section: 2, subsection: 3, subsubsection: 4, paragraph: 5 } as Record<
                string,
                number
              >
            )[command],
          );
          continue;
        }
        if (command === 'maketitle') {
          if (title) {
            b.flush();
            visit(title.node.args?.at(-1)?.content ?? [], title.file);
            b.flush('title', 1);
          }
          continue;
        }
        if (
          [
            'textbf',
            'textit',
            'emph',
            'texttt',
            'textrm',
            'textnormal',
            'underline',
            'textsc',
            'multicolumn',
            'multirow',
          ].includes(command)
        ) {
          visit(
            last?.content ?? [],
            file,
            command === 'textbf'
              ? 'strong'
              : command === 'texttt'
                ? 'code'
                : ['textit', 'emph', 'underline'].includes(command)
                  ? 'emphasis'
                  : style,
          );
          continue;
        }
        if (['input', 'include'].includes(command)) {
          const target = plain(last?.content ?? []);
          const path = resolvePath(file, target, files, '.tex');
          if (!path) {
            placeholder(`Missing input: ${target}`);
            continue;
          }
          if (stack.includes(path)) {
            placeholder(`Circular input: ${path}`);
            continue;
          }
          stack.push(path);
          visit(tree(path).content ?? [], path);
          stack.pop();
          continue;
        }
        if (command === 'includegraphics') {
          const target = plain(last?.content ?? []);
          let path: string | undefined;
          const bases = [{ file, path: '' }, { file: main, path: '' }, ...graphicPaths];
          for (const base of bases) {
            for (const ext of ['', '.png', '.jpg', '.jpeg', '.svg', '.webp', '.pdf']) {
              path = resolvePath(base.file, base.path + target, assets, ext);
              if (path) break;
            }
            if (path) break;
          }
          if (path) {
            if (coverMode) b.flush();
            atom(`[Image: ${target}]`, { kind: 'image', image: path });
            if (coverMode) b.flush('figure');
          } else if (/\.pdf$/i.test(target))
            placeholder(`PDF figure: ${target} — preview unavailable; caption follows`);
          else placeholder(`Image unavailable: ${target}`);
          continue;
        }
        if (citationCommands.includes(command)) {
          const keys = plain(last?.content ?? [])
            .split(',')
            .map((k) => k.trim());
          const notes = args
            .filter((a) => a.openMark === '[' && a.content?.length)
            .map((a) => plain(a.content));
          const text = keys
            .map((key) => {
              const entry = bibliography.get(key);
              if (!entry) {
                b.warnings.push(
                  `Unresolved citation: ${key}. The citation source is retained; include its .bib file to display author and year.`,
                );
                return `[${key}]`;
              }
              const year = bibText(entry.fields.year || entry.fields.date) || 'n.d.';
              if (command === 'citeauthor') return citationName(entry);
              if (command === 'citeyear') return year;
              return ['textcite', 'citet'].includes(command)
                ? `${citationName(entry)} (${year})`
                : `${citationName(entry)}, ${year}`;
            })
            .join('; ');
          const withNotes =
            notes.length === 2
              ? `${notes[0]} ${text}, ${notes[1]}`
              : notes.length
                ? `${text}, ${notes[0]}`
                : text;
          atom(
            ['parencite', 'citep', 'autocite', 'footcite'].includes(command)
              ? `(${withNotes})`
              : withNotes,
            { style },
          );
          continue;
        }
        if (/^(ref|eqref|autoref|pageref)$/.test(command)) {
          const key = plain(last?.content ?? []);
          const value = references[key];
          atom(value ? (command === 'eqref' ? `(${value})` : value) : `[${key}]`, { style });
          if (!value) b.warnings.push(`Unresolved reference: ${key}. Original command retained.`);
          continue;
        }
        if (command === 'printbibliography' || command === 'bibliography') {
          b.flush();
          const option = plain(last?.content ?? []);
          const heading = /title\s*=\s*([^,]+)/.exec(option)?.[1]?.trim() || 'References';
          atom(heading);
          b.flush('heading', 2);
          const entries = [...cited]
            .map((key) => bibliography.get(key))
            .filter((e): e is BibEntry => !!e)
            .sort((a, z) => citationName(a).localeCompare(citationName(z)));
          if (!entries.length)
            placeholder('Bibliography unavailable — include the .bib file in the project');
          for (const entry of entries) {
            b.add({ text: referenceText(entry), atomic: true, source: entry.source });
            b.flush();
          }
          b.warnings.push(
            'Citations and references use a simplified author–year display from the supplied .bib data. Custom biblatex styles and TeX hooks are not executed. Each reference is one selectable unit mapped to its .bib entry.',
          );
          continue;
        }
        if (command === 'footnote') {
          atom(` [Footnote: ${plain(last?.content ?? [])}]`, { style: 'footnote' });
          continue;
        }
        if (command === 'href' || command === 'url') {
          visit(last?.content ?? [], file, style);
          continue;
        }
        if (command === 'item') {
          b.flush('list');
          if (args.length > 3) visit(args[3].content ?? [], file, style);
          b.flush('list');
          continue;
        }
        if (command === '\\') {
          atom('\n');
          continue;
        }
        if (command === 'par') {
          flushProse();
          continue;
        }
        const chars: Record<string, string> = {
          '%': '%',
          '&': '&',
          _: '_',
          '#': '#',
          $: '$',
          '{': '{',
          '}': '}',
          ldots: '…',
          dots: '…',
          LaTeX: 'LaTeX',
          TeX: 'TeX',
          textendash: '–',
          textemdash: '—',
          ' ': ' ',
          thetable: String(currentTable),
          textbackslash: '\\',
          textasciitilde: '~',
        };
        if (command in chars) {
          atom(chars[command], { style });
          continue;
        }
        if (['clearpage', 'newpage', 'pagebreak'].includes(command)) {
          b.flush();
          continue;
        }
        if (
          [',', ';', '!', ':', 'quad', 'qquad', 'smallskip', 'medskip', 'bigskip'].includes(command)
        ) {
          atom(' ');
          continue;
        }
        const def = macros[command];
        if (def && def.args <= 9) {
          let expanded = def.body;
          let ok = true;
          for (let a = 1; a <= def.args; a++) {
            const group = nodes[i + 1];
            if (group?.type !== 'group') {
              ok = false;
              break;
            }
            i++;
            end = endOf(group);
            expanded = expanded.replaceAll(`#${a}`, rawArgument(group, source));
          }
          if (
            def.args === 0 &&
            nodes[i + 1]?.type === 'group' &&
            !(nodes[i + 1].content ?? []).length
          )
            end = endOf(nodes[++i]);
          if (ok && !/\\(?:input|include|def|newcommand|write|csname)/.test(expanded)) {
            // A custom expansion is one source-backed unit, never attributed to its definition.
            try {
              const text = plain(parse(expanded).content as N[]);
              if (!/\\[A-Za-z]+/.test(text)) {
                atom(text, { style });
                continue;
              }
            } catch {
              /* fall through */
            }
          }
        }
        while (nodes[i + 1]?.type === 'group') {
          end = endOf(nodes[++i]);
        }
        placeholder(`Unsupported command: ${source.slice(start, end)}`);
        continue;
      }
      placeholder(`Unsupported LaTeX: ${source.slice(start, end)}`);
    }
  }
  const root = tree(main);
  const document = (root.content ?? []).find(
    (n: N) => n.type === 'environment' && n.env === 'document',
  );
  stack.push(main);
  visit(
    document
      ? [
          ...(root.content ?? []).filter((n: N) => n.type === 'macro' && n.content === 'title'),
          document,
        ]
      : (root.content ?? []),
    main,
  );
  const result = b.finish(name);
  if (!result.text.trim()) throw new Error('This LaTeX project contains no readable content.');
  return result;
}
