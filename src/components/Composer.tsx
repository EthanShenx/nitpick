import { useState, useEffect } from 'react';
import { BookmarkPlus, X } from 'lucide-react';
import type { Action, Anchor, Annotation, Project, Scope } from '../core/types';
import { ACTIONS } from '../core/types';
import { overlappingAnnotations } from '../core/overlap';
import { location } from '../core/model';
import { annotationScope } from '../core/review';
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export interface Draft {
  type: Action;
  scope: Scope;
  anchor: Anchor;
  editing?: Annotation;
  created?: boolean;
  rect?: { x: number; y: number };
}
export interface DraftValues {
  type: Action;
  scope: Scope;
  note: string;
  replacement: string;
  placement: 'before' | 'after';
  destinationMode: 'unsure' | 'choose' | 'known';
}
export function Composer({
  draft,
  project,
  onSave,
  onClose,
  onSaveNote,
  onRemoveNote,
  onChange,
}: {
  draft: Draft;
  project: Project;
  onSave: (values: DraftValues) => void;
  onClose: (values: DraftValues) => void;
  onSaveNote: (s: string) => void;
  onRemoveNote: (s: string) => void;
  onChange: (values: DraftValues) => void;
}) {
  const [type, setType] = useState(draft.type),
    [scope, setScope] = useState(draft.scope),
    [note, setNote] = useState(draft.editing?.note ?? ''),
    [replacement, setReplacement] = useState(draft.editing?.replacement ?? ''),
    [placement, setPlacement] = useState<'before' | 'after'>(draft.editing?.placement ?? 'after'),
    [destinationMode, setDestinationMode] = useState<DraftValues['destinationMode']>(
      draft.editing?.destination
        ? 'known'
        : draft.created || draft.editing?.destinationUncertain
          ? 'unsure'
          : 'choose',
    );
  const values = { type, scope, note, replacement, placement, destinationMode };
  useEffect(() => {
    onChange(values);
  }, [type, scope, note, replacement, placement, destinationMode]);
  const local = draft.editing?.localAnchor ?? draft.anchor;
  const anchor = draft.editing
    ? annotationScope(project, draft.editing, scope).anchor
    : draft.anchor;
  const overlaps =
    scope === 'document'
      ? []
      : overlappingAnnotations(anchor, project.annotations, draft.editing?.id);
  const rect = draft.rect;
  const top = rect ? Math.max(12, Math.min(window.innerHeight - 420, rect.y + 12)) : undefined;
  const style = rect
    ? {
        left: Math.max(12, Math.min(window.innerWidth - 392, rect.x - 190)),
        top,
        maxHeight: `calc(100dvh - ${top! + 12}px)`,
      }
    : undefined;
  const savedNote = note.trim() && project.notes.includes(note.trim());
  return (
    <div
      className={`composer ${!rect ? 'composer-centered' : ''}`}
      style={style}
      role="dialog"
      aria-label="Annotation editor"
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose(values);
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') onSave(values);
      }}
    >
      <div className="composer-top">
        <select
          aria-label="Annotation type"
          className={`type-${type.toLowerCase()}`}
          value={type}
          onChange={(e) => setType(e.target.value as Action)}
        >
          {ACTIONS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <button
          className="icon-button"
          aria-label="Close annotation editor"
          onClick={() => onClose(values)}
        >
          <X size={18} />
        </button>
      </div>
      <div className="composer-body">
        <label className="field">
          Applies to
          <select
            aria-label="Annotation scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as Scope)}
          >
            <option value="selection" disabled={local.start === local.end && !local.region}>
              {local.region ? 'Selected area' : 'Selected text'}
            </option>
            <option value="paragraph" disabled={local.start === local.end && !local.region}>
              {project.doc.pdf ? 'Page' : 'Paragraph'}
            </option>
            <option value="section" disabled={!local.section}>
              Section
            </option>
            <option value="document">Whole document</option>
          </select>
        </label>
        <p className="composer-location">
          {scope === 'document'
            ? 'Whole document'
            : capitalize(location(anchor, project.doc, scope))}
        </p>
        {scope !== 'document' && <blockquote>{anchor.region ? 'Selected area on the PDF' : anchor.quote}</blockquote>}
        {overlaps.length > 0 && (
          <p className="overlap-notice" role="status">
            Overlaps {overlaps.length} other note{overlaps.length === 1 ? '' : 's'}.
          </p>
        )}
        {(type === 'Insert' || type === 'Move') && (
          <label className="field">
            Placement
            <select
              aria-label="Placement"
              value={placement}
              onChange={(e) => setPlacement(e.target.value as 'before' | 'after')}
            >
              <option value="before">Before{type === 'Move' ? ' destination' : ''}</option>
              <option value="after">After{type === 'Move' ? ' destination' : ''}</option>
            </select>
          </label>
        )}
        {type === 'Move' && (
          <label className="field">
            Destination
            <select
              aria-label="Move destination"
              value={destinationMode}
              onChange={(e) => setDestinationMode(e.target.value as DraftValues['destinationMode'])}
            >
              <option value="unsure">Decide later</option>
              <option value="choose">Select in the document</option>
              {draft.editing?.destination && <option value="known">Keep current</option>}
            </select>
          </label>
        )}
        {(type === 'Replace' || type === 'Insert') && (
          <label className="field">
            {type === 'Replace' ? 'Replace with' : 'Text to insert'}
            <textarea
              autoFocus
              aria-label={type === 'Replace' ? 'Replacement text' : 'Insertion text'}
              rows={3}
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
            />
          </label>
        )}
        <label className="field">
          {type === 'Comment' ? 'Comment' : 'Note'}
          <textarea
            autoFocus={type !== 'Replace' && type !== 'Insert'}
            aria-label="Annotation note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={type === 'Verify' ? 'Find a source; if none exists, flag it.' : 'Optional'}
          />
        </label>
        {project.notes.length > 0 && (
          <details>
            <summary>Saved notes</summary>
            <div className="note-chips" aria-label="Saved notes">
              {project.notes.map((n) => (
                <span className="note-chip" key={n}>
                  <button onClick={() => setNote(n)} title={n}>
                    {n}
                  </button>
                  <button
                    className="chip-remove"
                    aria-label={`Remove saved note ${n}`}
                    onClick={() => onRemoveNote(n)}
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          </details>
        )}
      </div>
      <div className="composer-footer">
        <button
          className="icon-button"
          title="Add to saved notes"
          aria-label="Add to saved notes"
          disabled={!note.trim() || !!savedNote}
          onClick={() => onSaveNote(note.trim())}
        >
          <BookmarkPlus size={18} />
        </button>
        <button className="button primary" onClick={() => onSave(values)}>
          Done
        </button>
      </div>
    </div>
  );
}
