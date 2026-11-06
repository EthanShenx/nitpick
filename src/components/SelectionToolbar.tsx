import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/** Clamp the measured toolbar, including its single action row, inside the viewport. */
export function FloatingToolbar({
  x,
  y,
  label,
  children,
  className = '',
  onClose,
}: {
  x: number;
  y: number;
  label: string;
  children: ReactNode;
  className?: string;
  onClose?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 12, top: 72 });
  useLayoutEffect(() => {
    const el = ref.current!;
    const position = () => {
      const box = el.getBoundingClientRect();
      setPosition({
        left: Math.max(12, Math.min(innerWidth - box.width - 12, x - box.width / 2)),
        top: Math.max(12, Math.min(innerHeight - box.height - 12, y + 10)),
      });
    };
    position();
    const resize = new ResizeObserver(position);
    resize.observe(el);
    window.addEventListener('resize', position);
    const outside = (e: PointerEvent) => {
      if (!el.contains(e.target as Node)) onClose?.();
    };
    document.addEventListener('pointerdown', outside);
    return () => {
      resize.disconnect();
      window.removeEventListener('resize', position);
      document.removeEventListener('pointerdown', outside);
    };
  }, [x, y, onClose]);
  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={label}
      className={`selection-toolbar ${className}`}
      style={position}
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
}
