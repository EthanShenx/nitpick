import { useState } from 'react';
import { Plus, Trash2, Pencil, ChevronDown, ChevronUp } from 'lucide-react';
import type { Annotation, Project, Filters } from '../core/types';
import { defaultFilters } from '../core/types';
import type { OverlapTarget } from './OverlapPicker';
import { overlappingAnnotations } from '../core/overlap';
import { location, matches } from '../core/model';
import { FilterControls } from './FilterControls';
export type SidebarTab = 'Annotations' | 'Whole document';
const TABS: SidebarTab[] = ['Annotations', 'Whole document'];
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export function Sidebar({
  project,
  active,
  tab,
  onTabChange,
  onOverlap,
  onJump,
  onEdit,
  onDelete,
  onFilters,
  onDocument,
  onDestination,
}: {
  project: Project;
  active: string | null;
  tab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onOverlap: (target: OverlapTarget) => void;
  onJump: (a: Annotation) => void;
  onEdit: (a: Annotation) => void;
  onDelete: (id: string) => void;
  onFilters: (f: Filters) => void;
  onDocument: () => void;
  onDestination: (id: string) => void;
}) {
  const visible = project.annotations
    .filter((a) => matches(a, project.filters))
    .sort((a, b) => a.anchor.start - b.anchor.start || a.createdAt - b.createdAt);
  const documentNotes = project.annotations.filter((a) => a.scope === 'document');
  const card = (a: Annotation) => (
    <AnnotationCard
      key={a.id}
      a={a}
      project={project}
      active={active === a.id}
      onJump={() => onJump(a)}
      onOverlap={onOverlap}
      onEdit={() => onEdit(a)}
      onDelete={() => onDelete(a.id)}
      onDestination={() => onDestination(a.id)}
    />
  );
  return (
    <aside className="annotation-sidebar" aria-label="Annotations">
      <div className="sidebar-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            aria-pressed={tab === t}
            className={tab === t ? 'active' : ''}
            onClick={() => onTabChange(t)}
          >
            {t}
            {t === 'Annotations' && (
              <>
                {' '}
                <span className="tab-count">{project.annotations.length}</span>
              </>
            )}
          </button>
        ))}
      </div>
      {tab === 'Annotations' ? (
        <>
          {project.annotations.length > 0 && (
            <div className="sidebar-filter">
              <FilterControls value={project.filters} onChange={onFilters} />
              <span className="muted">
                {visible.length} of {project.annotations.length}
              </span>
            </div>
          )}
          <div className="annotation-list">
            {visible.length ? (
              visible.map(card)
            ) : project.annotations.length ? (
              <div className="empty-notes">
                <p>No annotations match this filter.</p>
                <button className="text-button" onClick={() => onFilters({ ...defaultFilters })}>
                  Show all
                </button>
              </div>
            ) : (
              <div className="empty-notes">
                <p>
                  <strong>No annotations yet</strong>
                </p>
                <p>Select text in the document to add one.</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="annotation-list" aria-label="Whole-document notes">
          <div className="panel-top">
            {!documentNotes.length && <p>Notes on voice, structure, or argument.</p>}
            <button className="button" onClick={onDocument}>
              <Plus size={16} aria-hidden="true" /> Add note
            </button>
          </div>
          {documentNotes.map(card)}
        </div>
      )}
    </aside>
  );
}
function AnnotationCard({
  a,
  project,
  active,
  onJump,
  onEdit,
  onDelete,
  onDestination,
  onOverlap,
}: {
  a: Annotation;
  project: Project;
  active: boolean;
  onJump: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDestination: () => void;
  onOverlap: (target: OverlapTarget) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const long = a.anchor.quote.length > 170;
  const overlaps = overlappingAnnotations(a.anchor, project.annotations, a.id);
  return (
    <article
      className={`annotation-card type-${a.type.toLowerCase()} ${active ? 'active' : ''}`}
      data-annotation={a.id}
    >
      <div className="card-top">
        <span className="type-label">
          <span className="type-swatch" aria-hidden="true" />
          {a.type}
        </span>
        <div className="card-actions">
          <button className="icon-button" aria-label={`Edit annotation ${a.id}`} onClick={onEdit}>
            <Pencil size={16} />
          </button>
          <button
            className="icon-button"
            aria-label={`Remove annotation ${a.id}`}
            onClick={onDelete}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <button className="card-location" onClick={onJump}>
        {a.scope === 'document'
          ? 'Whole document'
          : capitalize(location(a.anchor, project.doc, a.scope))}
      </button>
      {a.scope !== 'document' && (
        <>
          <blockquote className={long && !expanded ? 'collapsed-quote' : ''}>
            {a.anchor.region ? 'Selected area on the PDF' : a.anchor.quote}
          </blockquote>
          {long && (
            <button className="text-button expand-quote" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              {expanded ? 'Show less' : 'Show full quote'}
            </button>
          )}
        </>
      )}
      {(a.type === 'Replace' || a.type === 'Insert') && (
        <p className="replacement">
          <span className="replacement-label">{a.type === 'Replace' ? 'With' : 'Text'}</span>
          {a.replacement || <span className="unfinished">Unfinished</span>}
        </p>
      )}
      {a.note && <p className="card-note">{a.note}</p>}
      {a.type === 'Comment' && !a.note && <p className="unfinished">Unfinished</p>}
      {a.type === 'Verify' && !a.note && (
        <p className="card-note">Find a source; if none exists, flag it.</p>
      )}
      {a.type === 'Move' && (
        <div className="destination-info">
          <span>
            {a.destination
              ? `Move ${a.placement} “${a.destination.quote}” in ${location(a.destination, project.doc)}`
              : a.destinationUncertain
                ? 'Destination undecided'
                : 'No destination yet'}
          </span>
          <button className="text-button" onClick={onDestination}>
            {a.destination ? 'Change' : 'Choose destination'}
          </button>
        </div>
      )}
      {overlaps.length > 0 && (
        <button
          className="text-button"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onOverlap({ ids: [a.id, ...overlaps.map((x) => x.id)], x: r.left, y: r.bottom });
          }}
        >
          Overlaps {overlaps.length} other note{overlaps.length === 1 ? '' : 's'}
        </button>
      )}
    </article>
  );
}
