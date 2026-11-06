import type { Doc, Annotation, PdfBookmark } from '../core/types';
import { documentOutline, headingLevel } from '../core/outline';
import type { OutlineEntry } from '../core/outline';
export function DocumentOutline({
  doc,
  onNavigate,
  annotations = [],
}: {
  doc: Doc;
  annotations?: Annotation[];
  onNavigate: (id: string) => void;
}) {
  function list(entries: OutlineEntry[], nested = false) {
    return (
      <ol className={nested ? 'outline-children' : 'outline-links'}>
        {entries.map(({ block, number, children }) => {
          const sectionEnd =
            doc.blocks.find(
              (b) =>
                b.start > block.start &&
                b.kind === 'heading' &&
                headingLevel(doc, b) <= headingLevel(doc, block),
            )?.start ?? doc.text.length;
          const count = annotations.filter(
            (a) =>
              a.scope !== 'document' && a.anchor.start < sectionEnd && a.anchor.end > block.start,
          ).length;
          return (
            <li key={block.id}>
              <button onClick={() => onNavigate(block.id)}>
                <span className="outline-number">{number}</span>
                <span>{block.heading}</span>
                {count > 0 && (
                  <span
                    className="outline-count"
                    aria-label={`${count} annotation${count === 1 ? '' : 's'}`}
                  >
                    {count}
                  </span>
                )}
              </button>
              {children.length > 0 && list(children, true)}
            </li>
          );
        })}
      </ol>
    );
  }
  if (doc.pdf) {
    const pageList = doc.pdf.pages.map(p => ({title:`Page ${p.label}`,page:p.number,children:[]}));
    const render = (entries: PdfBookmark[], nested = false): React.ReactNode => <ol className={nested ? 'outline-children' : 'outline-links'}>{entries.map((entry, i) => {
      const count = annotations.filter(a => a.scope !== 'document' && (a.anchor.pdfRects?.some(r => r.page === entry.page) || (!a.anchor.region && a.anchor.start < doc.pdf!.pages[entry.page-1].end && a.anchor.end > doc.pdf!.pages[entry.page-1].start))).length;
      return <li key={`${entry.page}-${i}`}><button onClick={() => onNavigate(`pdf-page-${entry.page}`)}><span>{entry.title}</span>{count > 0 && <span className="outline-count" aria-label={`${count} annotation${count === 1 ? '' : 's'}`}>{count}</span>}</button>{entry.children.length > 0 && render(entry.children,true)}</li>;
    })}</ol>;
    return <>{doc.pdf.outline.length > 0 && render(doc.pdf.outline)}{render(pageList)}</>;
  }
  return list(documentOutline(doc));
}
