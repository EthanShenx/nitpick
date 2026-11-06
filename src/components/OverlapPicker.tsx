import { useEffect, useRef } from 'react';
import { X, Eraser } from 'lucide-react';
import type { Annotation, Doc } from '../core/types';
import { location } from '../core/model';
export interface OverlapTarget {
  ids: string[];
  x: number;
  y: number;
}
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export function OverlapPicker({
  target,
  annotations,
  doc,
  onChoose,
  onClose,
  onDelete,
}: {
  target: OverlapTarget;
  annotations: Annotation[];
  doc: Doc;
  onChoose: (a: Annotation) => void;
  onClose: () => void;
  onDelete?: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const notes = annotations.filter((a) => target.ids.includes(a.id));
  const pickerTop = Math.max(72, Math.min(window.innerHeight - 360, target.y + 8));
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.querySelector<HTMLElement>('[data-choose]')?.focus();
    const dismiss = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', dismiss);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      if (document.activeElement === document.body) previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Overlapping annotations"
      className="overlap-picker"
      style={{
        left: Math.max(12, Math.min(window.innerWidth - 352, target.x - 160)),
        top: pickerTop,
        maxHeight: `min(440px, calc(100dvh - ${pickerTop + 12}px))`,
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="overlap-picker-heading">
        <strong>{notes.length} notes on this text</strong>
        <button
          className="icon-button"
          aria-label="Close overlapping annotations"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <div className="overlap-picker-list">
        {notes.map((a) => (
          <div className="overlap-entry" key={a.id}>
            <button
              data-choose
              className={`overlap-option type-${a.type.toLowerCase()}`}
              onClick={() => onChoose(a)}
            >
              <span className="type-label">
                <span className="type-swatch" aria-hidden="true" />
                {a.type}
              </span>
              <span className="muted">{capitalize(location(a.anchor, doc, a.scope))}</span>
              <q>{a.anchor.quote}</q>
              {(a.note || a.replacement) && <span>{a.replacement || a.note}</span>}
            </button>
            {onDelete && (
              <button
                className="overlap-remove"
                aria-label={`Remove annotation ${a.id}`}
                onClick={() => onDelete(a.id)}
              >
                <Eraser size={16} aria-hidden="true" /> Remove
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
