import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronUp, ChevronDown, X, CaseSensitive } from 'lucide-react';
import type { Doc } from '../core/types';
import { findDocumentMatches, nextMatch } from '../core/search';
import { leafRange } from '../core/dom-ranges';
type Box = { x: number; y: number; width: number; height: number; current: boolean };
export function DocumentSearch({
  doc,
  reader,
  paper,
  disabled = false,
}: {
  doc: Doc;
  reader: RefObject<HTMLDivElement | null>;
  paper: RefObject<HTMLDivElement | null>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [matchCase, setMatchCase] = useState(false),
    [index, setIndex] = useState(0),
    [boxes, setBoxes] = useState<Box[]>([]),
    [navigation, setNavigation] = useState(0);
  const deferred = useDeferredValue(query);
  const matches = useMemo(
    () => findDocumentMatches(doc, deferred, matchCase),
    [doc, deferred, matchCase],
  );
  const active = Math.min(index, Math.max(0, matches.length - 1));
  const input = useRef<HTMLInputElement>(null),
    button = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null);
  const composing = useRef(false),
    jump = useRef(false),
    pageJumped = useRef(false);
  const close = () => {
    setOpen(false);
    button.current?.focus({ preventScroll: true });
  };
  const navigate = (direction: number) => {
    setNavigation((v) => v + 1);
    setIndex(nextMatch(active, matches.length, direction));
    jump.current = true;
    pageJumped.current = false;
  };
  useEffect(() => {
    const start = () => {
        composing.current = true;
      },
      end = () => {
        composing.current = false;
      };
    const key = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229 || composing.current || disabled) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setOpen(true);
        input.current?.focus();
        input.current?.select();
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', key);
    window.addEventListener('compositionstart', start);
    window.addEventListener('compositionend', end);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('compositionstart', start);
      window.removeEventListener('compositionend', end);
    };
  }, [open, disabled]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    jump.current = true;
    pageJumped.current = false;
  }, [active, matches, open, navigation]);
  useEffect(() => {
    const container = reader.current,
      content = paper.current;
    if (!open || !container || !content) {
      setBoxes([]);
      return;
    }
    let frame = 0;
    function calculate() {
      frame = 0;
      const target = matches[active];
      const leaves = [...content!.querySelectorAll<HTMLElement>('[data-leaf]')];
      if (jump.current && target) {
        const leaf = leaves.find(
          (el) => Number(el.dataset.end) > target.start && Number(el.dataset.start) < target.end,
        );
        const rect = leaf && leafRange(leaf, target)?.getBoundingClientRect();
        if (rect && rect.height) {
          container!.scrollTo({
            top:
              container!.scrollTop +
              rect.top -
              container!.getBoundingClientRect().top -
              container!.clientHeight / 2 +
              rect.height / 2,
            behavior: 'instant',
          });
          const bounds = container!.getBoundingClientRect();
          if (rect.left < bounds.left + 24) container!.scrollLeft += rect.left - bounds.left - 24;
          else if (rect.right > bounds.right - 24)
            container!.scrollLeft += rect.right - bounds.right + 24;
          jump.current = false;
        } else if (!pageJumped.current) {
          const block = doc.blocks.find((b) => b.end > target.start);
          if (block)
            content!
              .querySelector(`#${block.id}`)
              ?.scrollIntoView({ block: 'center', behavior: 'instant' });
          pageJumped.current = true;
        }
      }
      const bounds = container!.getBoundingClientRect(),
        result: Box[] = [];
      let cursor = 0;
      for (const leaf of leaves) {
        const leafStart = Number(leaf.dataset.start),
          leafEnd = Number(leaf.dataset.end),
          rect = leaf.getBoundingClientRect();
        if (
          rect.bottom < bounds.top ||
          rect.top > bounds.bottom ||
          rect.right < bounds.left ||
          rect.left > bounds.right
        )
          continue;
        while (cursor < matches.length && matches[cursor].end <= leafStart) cursor++;
        for (let i = cursor; i < matches.length && matches[i].start < leafEnd; i++) {
          const range = leafRange(leaf, matches[i]);
          if (!range) continue;
          for (const r of range.getClientRects()) {
            if (r.width > 0 && r.height > 0)
              result.push({
                x: r.left - bounds.left + container!.scrollLeft,
                y: r.top - bounds.top + container!.scrollTop,
                width: r.width,
                height: r.height,
                current: i === active,
              });
          }
        }
      }
      setBoxes(result);
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(calculate);
    };
    schedule();
    const relayout = () => {
      if (matches.length) {
        jump.current = true;
        pageJumped.current = false;
      }
      schedule();
    };
    const resize = new ResizeObserver(relayout);
    resize.observe(container);
    resize.observe(content);
    const styles = new MutationObserver(relayout);
    styles.observe(content, { attributes: true, attributeFilter: ['style'] });
    const mutation = new MutationObserver(schedule);
    mutation.observe(content, { childList: true, subtree: true, characterData: true });
    container.addEventListener('scroll', schedule, { passive: true });
    content.addEventListener('load', schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      styles.disconnect();
      mutation.disconnect();
      container.removeEventListener('scroll', schedule);
      content.removeEventListener('load', schedule, true);
    };
  }, [open, matches, active, doc, reader, paper, navigation]);
  const status = deferred.trim()
    ? matches.length
      ? `${active + 1} of ${matches.length}`
      : 'No matches'
    : 'Type to search';
  return (
    <div className="document-search">
      <button
        ref={button}
        className="icon-button"
        aria-label="Search document"
        aria-expanded={open}
        aria-controls="document-search-panel"
        title="Search document (Ctrl/Cmd+F)"
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        <Search size={18} />
      </button>
      {open && (
        <div
          className="document-search-panel"
          id="document-search-panel"
          ref={panel}
          role="search"
          aria-label="Find in document"
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229 || composing.current) return;
            if (e.key === 'Escape') {
              e.stopPropagation();
              e.preventDefault();
              close();
            }
            if (e.key === 'Enter' && e.target === input.current) {
              e.preventDefault();
              navigate(e.shiftKey ? -1 : 1);
            }
          }}
        >
          <div className="document-search-row">
            <Search size={16} aria-hidden="true" />
            <input
              ref={input}
              type="search"
              aria-label="Find words or sentences"
              placeholder="Find words or sentences…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIndex(0);
              }}
            />
            <button
              className="icon-button"
              aria-label="Match case"
              aria-pressed={matchCase}
              title="Match case"
              onClick={() => {
                setMatchCase((v) => !v);
                setIndex(0);
              }}
            >
              <CaseSensitive size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Close document search"
              title="Close (Esc)"
              onClick={close}
            >
              <X size={17} />
            </button>
          </div>
          <div className="document-search-footer">
            <span role="status" aria-live="polite">
              {status}
            </span>
            <div>
              <button
                className="icon-button"
                aria-label="Previous search result"
                title="Previous (Shift+Enter)"
                disabled={!matches.length}
                onClick={() => navigate(-1)}
              >
                <ChevronUp size={17} />
              </button>
              <button
                className="icon-button"
                aria-label="Next search result"
                title="Next (Enter)"
                disabled={!matches.length}
                onClick={() => navigate(1)}
              >
                <ChevronDown size={17} />
              </button>
            </div>
          </div>
          {doc.pdf && (
            <p className="document-search-help">
              Search uses embedded PDF text. Scanned images have no searchable text.
            </p>
          )}
        </div>
      )}
      {open &&
        reader.current &&
        createPortal(
          <div className="search-overlays" aria-hidden="true">
            {boxes.map((box, i) => (
              <span
                key={i}
                className={`search-match ${box.current ? 'search-match-current' : ''}`}
                style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
              />
            ))}
          </div>,
          reader.current,
        )}
    </div>
  );
}
