import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const el = ref.current!;
    const timer = setTimeout(
      () => el.querySelector<HTMLElement>('button,input,select,textarea')?.focus(),
      0,
    );
    function key(e: KeyboardEvent) {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab') {
        const focus = [
          ...el.querySelectorAll<HTMLElement>(
            'button,input,select,textarea,summary,[tabindex="0"]',
          ),
        ].filter((x) => !x.hasAttribute('disabled'));
        const first = focus[0],
          last = focus.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    el.addEventListener('keydown', key);
    return () => {
      clearTimeout(timer);
      el.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? 'modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button aria-label="Close dialog" className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
