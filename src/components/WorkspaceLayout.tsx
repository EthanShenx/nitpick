import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, PointerEvent } from 'react';
import { COLUMN_LIMITS, defaultColumns, fitColumns, resizeColumn } from '../core/layout';
import type { ColumnWidths } from '../core/layout';
export function WorkspaceLayout({
  children,
  widths,
  sidebar,
  onChange,
  onResizeStart,
}: {
  children: ReactNode;
  widths?: ColumnWidths;
  sidebar: boolean;
  onChange: (widths: ColumnWidths) => void;
  onResizeStart?: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(typeof window === 'undefined' ? 1440 : window.innerWidth);
  const [draft, setDraft] = useState<ColumnWidths>();
  const drag = useRef<{
    side: keyof ColumnWidths;
    x: number;
    initial: ColumnWidths;
    last: ColumnWidths;
  } | null>(null);
  const effective = fitColumns(width, draft ?? widths, sidebar);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(root.current!);
    return () => observer.disconnect();
  }, []);
  function move(e: PointerEvent) {
    const state = drag.current;
    if (!state) return;
    const delta = (e.clientX - state.x) * (state.side === 'outline' ? 1 : -1);
    state.last = resizeColumn(
      state.side,
      state.initial[state.side] + delta,
      width,
      state.initial,
      sidebar,
    );
    setDraft(state.last);
  }
  function finish() {
    if (
      drag.current &&
      (drag.current.last.outline !== drag.current.initial.outline ||
        drag.current.last.annotations !== drag.current.initial.annotations)
    )
      onChange(drag.current.last);
    drag.current = null;
    setDraft(undefined);
  }
  const separator = (side: keyof ColumnWidths) => {
    const value = effective[side];
    const max = resizeColumn(side, COLUMN_LIMITS[side].max, width, effective, sidebar)[side];
    return (
      <div
        key={side}
        role="separator"
        aria-orientation="vertical"
        aria-label={side === 'outline' ? 'Resize document outline' : 'Resize annotations sidebar'}
        aria-valuemin={COLUMN_LIMITS[side].min}
        aria-valuemax={max}
        aria-valuenow={value}
        tabIndex={0}
        className={`column-divider divider-${side}`}
        title="Drag to resize. Double-click to reset. Arrow keys also resize."
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          onResizeStart?.();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { side, x: e.clientX, initial: effective, last: effective };
          setDraft(effective);
        }}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
        onDoubleClick={() => onChange({ ...effective, [side]: defaultColumns(width)[side] })}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
          e.preventDefault();
          e.stopPropagation();
          const step = (e.shiftKey ? 32 : 16) * (side === 'outline' ? 1 : -1);
          const target =
            e.key === 'Home'
              ? COLUMN_LIMITS[side].min
              : e.key === 'End'
                ? max
                : value + (e.key === 'ArrowRight' ? step : -step);
          onResizeStart?.();
          onChange(resizeColumn(side, target, width, effective, sidebar));
        }}
      />
    );
  };
  return (
    <div
      ref={root}
      className={`workspace-body ${!sidebar ? 'without-sidebar' : ''} ${draft ? 'is-resizing' : ''}`}
      style={
        {
          '--outline-width': `${effective.outline}px`,
          '--notes-width': `${effective.annotations}px`,
        } as CSSProperties
      }
    >
      {children}
      {separator('outline')}
      {sidebar && separator('annotations')}
    </div>
  );
}
