import { memo, useEffect, useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import type { Annotation, Block, Doc, Run, Scope } from '../core/types';
import { matches } from '../core/model';
import { headingLevel } from '../core/outline';
import type { OverlapTarget } from './OverlapPicker';
import type { Filters } from '../core/types';
let katexModule: Promise<typeof import('katex')> | undefined;
const MathRun = memo(function MathRun({ run }: { run: Run }) {
  const [html, setHtml] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    (katexModule ??= import('katex'))
      .then(({ default: katex }) => {
        try {
          const value = katex.renderToString(run.math ?? run.text, {
            displayMode: run.display,
            throwOnError: true,
            trust: false,
            output: 'html',
          });
          if (!cancelled) setHtml(value);
        } catch {
          if (!cancelled) setHtml(null);
        }
      })
      .catch(() => {
        if (!cancelled) setHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [run]);
  return html ? (
    <span className="math-visual" aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span className="unsupported">
      [{html === undefined ? 'Rendering' : 'Unsupported'} math: {run.math}]
    </span>
  );
});

function RunView({
  run,
  doc,
  annotations,
  active,
  onJump,
  onOverlap,
}: {
  run: Run;
  doc: Doc;
  annotations: Annotation[];
  active: string | null;
  onJump: (id: string, target: { x: number; y: number }) => void;
  onOverlap: (target: OverlapTarget) => void;
}) {
  const boundaries = [
    run.start,
    run.end,
    ...annotations
      .flatMap((a) => [a.anchor.start, a.anchor.end])
      .filter((x) => x > run.start && x < run.end),
  ].sort((a, b) => a - b);
  const points = run.atomic ? [run.start, run.end] : [...new Set(boundaries)];
  return points.slice(0, -1).map((start, i) => {
    const end = points[i + 1];
    const anns = annotations.filter((a) => a.anchor.start < end && a.anchor.end > start);
    const primary = anns.find((a) => a.id === active) ?? anns[0];
    const activate = (el: HTMLElement) => {
      if (anns.length > 1) {
        const rect = el.getBoundingClientRect();
        onOverlap({ ids: anns.map((a) => a.id), x: rect.left + rect.width / 2, y: rect.bottom });
      } else if (primary) {
        const rect = el.getBoundingClientRect();
        onJump(primary.id, { x: rect.left + rect.width / 2, y: rect.bottom });
      }
    };
    return (
      <span
        key={start}
        role={primary ? 'button' : run.kind === 'math' ? 'math' : undefined}
        tabIndex={
          primary ? (start === primary.anchor.start || anns.length > 1 ? 0 : -1) : undefined
        }
        aria-label={
          anns.length > 1
            ? `${run.text.slice(start - run.start, end - run.start)} (${anns.length} annotations)`
            : run.kind === 'math'
              ? run.text
              : undefined
        }
        aria-haspopup={anns.length > 1 ? 'dialog' : undefined}
        data-overlap-count={anns.length > 1 ? anns.length : undefined}
        data-annotation-ids={anns.length ? anns.map((a) => a.id).join(' ') : undefined}
        data-leaf="true"
        data-start={start}
        data-end={end}
        data-atomic={String(!!run.atomic)}
        className={`run ${run.style ?? ''} ${run.kind ?? ''} ${primary ? 'mark-' + primary.type.toLowerCase() : ''} ${anns.length > 1 ? 'mark-overlap' : ''} ${anns.some((a) => a.id === active) ? 'mark-active' : ''}`}
        title={
          anns.length
            ? anns.map((a) => `${a.type}: ${a.note || a.replacement || a.anchor.quote}`).join('\n')
            : undefined
        }
        onClick={(e) => {
          if (window.getSelection()?.isCollapsed) {
            e.currentTarget.focus({ preventScroll: true });
            activate(e.currentTarget);
          }
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (primary && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            e.stopPropagation();
            activate(e.currentTarget);
          }
        }}
      >
        {run.kind === 'math' ? (
          <MathRun run={run} />
        ) : run.kind === 'image' ? (
          <>
            <img
              className={run.image?.toLowerCase().endsWith('.pdf') ? 'pdf-figure' : undefined}
              draggable={false}
              src={doc.assets[run.image!]}
              alt={run.text}
            />
            <span className="image-caption">{run.text}</span>
          </>
        ) : (
          run.text.slice(start - run.start, end - run.start)
        )}
      </span>
    );
  });
}
// Delimiter runs remain in DOM order so a cross-cell selection keeps its exact
// normalized offsets. Cells change layout only; no text is re-created or searched.
function tableRows(runs: Run[]) {
  const rows: Run[][][] = [[[]]];
  for (const run of runs) {
    const row = rows.at(-1)!;
    row.at(-1)!.push(run);
    if (run.atomic && run.text === '\t') row.push([]);
    if (run.atomic && run.text === '\n') rows.push([[]]);
  }
  return rows.filter((row) => row.some((cell) => cell.some((run) => run.text.trim())));
}
export const Paper = memo(function Paper({
  doc,
  annotations,
  filters,
  active,
  onScope,
  onJump,
  onOverlap,
}: {
  doc: Doc;
  annotations: Annotation[];
  filters: Filters;
  active: string | null;
  onScope: (b: Block, scope: Scope) => void;
  onJump: (id: string, target: { x: number; y: number }) => void;
  onOverlap: (target: OverlapTarget) => void;
}) {
  const visible = annotations.filter((a) => a.scope !== 'document' && matches(a, filters));
  return (
    <article className={`paper paper-${doc.format}`} aria-label="Read-only document">
      {doc.blocks.map((b) => {
        const Tag = (
          b.kind === 'title' ? 'h1' : b.kind === 'heading' ? `h${headingLevel(doc, b)}` : 'p'
        ) as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p';
        const renderRun = (r: Run) => (
          <RunView
            key={r.start}
            run={r}
            doc={doc}
            annotations={visible}
            active={active}
            onJump={onJump}
            onOverlap={onOverlap}
          />
        );
        const rows = b.kind === 'table' ? tableRows(b.runs) : [];
        const columns = Math.max(1, ...rows.map((row) => row.length));
        return (
          <div
            className={`paper-block block-${b.kind} ${active && annotations.find((a) => a.id === active)?.anchor.start === b.start ? 'block-active' : ''}`}
            id={b.id}
            key={b.id}
            data-block={b.id}
          >
            <div className="block-controls">
              <button
                title={`Add ${b.kind === 'heading' ? 'section' : b.kind === 'title' ? 'title' : 'paragraph'} note`}
                aria-label={`Add ${b.kind === 'heading' ? 'section' : b.kind === 'title' ? 'title' : 'paragraph'} note ${b.id}`}
                onClick={() =>
                  onScope(
                    b,
                    b.kind === 'heading'
                      ? 'section'
                      : b.kind === 'title'
                        ? 'selection'
                        : 'paragraph',
                  )
                }
              >
                <MessageSquarePlus size={16} />
              </button>
              {b.kind !== 'heading' && b.kind !== 'title' && (
                <span aria-hidden="true">{b.paragraph}</span>
              )}
            </div>
            {b.kind === 'table' ? (
              <div className="paper-table-scroll" tabIndex={0} aria-label="Scrollable table">
                <div className="paper-table" role="table" aria-label="Document table">
                  {rows.map((row, rowIndex) => (
                    <div
                      className="paper-table-row"
                      role="row"
                      key={rowIndex}
                      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                    >
                      {row.map((cell, cellIndex) => (
                        <div
                          className="paper-table-cell"
                          role="cell"
                          key={cellIndex}
                          style={row.length === 1 ? { gridColumn: `span ${columns}` } : undefined}
                        >
                          {cell.map(renderRun)}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Tag data-list-marker={b.listMarker}>{b.runs.map(renderRun)}</Tag>
            )}
          </div>
        );
      })}
    </article>
  );
});
