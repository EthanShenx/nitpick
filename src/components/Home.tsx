import { useState } from 'react';
import { Upload, X } from 'lucide-react';
import type { Project } from '../core/types';
export function Brand({ onClick }: { onClick: () => void }) {
  return (
    <button className="brand" onClick={onClick} aria-label="Nitpick home">
      <img
        className="brand-mark"
        src={`${import.meta.env.BASE_URL}nitpick-mark.svg`}
        alt=""
        aria-hidden="true"
      />
      <img
        className="brand-wordmark"
        src={`${import.meta.env.BASE_URL}word-logo.svg?v=a8f99962bb1c`}
        alt=""
        aria-hidden="true"
      />
    </button>
  );
}
const edited = (t: number) =>
  new Date(t).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
export function Home({
  recent,
  onImport,
  onFolder,
  onOpen,
  onSample,
  onFile,
  onRemove,
}: {
  recent: Project[];
  onImport: () => void;
  onFolder: () => void;
  onOpen: (p: Project) => void;
  onSample: () => void;
  onFile: (file: File) => void;
  onRemove: (p: Project) => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={`home ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
    >
      <header className="home-header">
        <div className="page-width">
          <Brand onClick={() => {}} />
        </div>
      </header>
      <main>
        <section className="home-hero">
          <div className="page-width">
            <h1>A little more precise.</h1>
            <p>
              Annotate an essay and export clear revision instructions for a person or an AI. Your
              documents never leave this browser.
            </p>
            <div className="hero-actions">
              <button className="button primary large" onClick={onImport}>
                Open document
              </button>
              <button className="button large" onClick={onFolder}>
                Open LaTeX folder
              </button>
              <button className="button large" onClick={onSample}>
                Try an example
              </button>
            </div>
            <p className="formats">
              HTML (.html or .htm), PDF, Markdown, Word, LaTeX (.tex, folder, or .zip), or a .nitpick project
            </p>
          </div>
        </section>
        <section className="documents page-width" aria-labelledby="recent-heading">
          <h2 id="recent-heading">Recent documents</h2>
          {recent.length ? (
            <ul className="recent-list">
              {recent.map((p) => (
                <li key={p.id} className="recent-row">
                  <button onClick={() => onOpen(p)} className="recent-item">
                    <strong>{p.title}</strong>
                    <span>
                      {p.annotations.length} annotation{p.annotations.length === 1 ? '' : 's'}
                    </span>
                    <span>{edited(p.updatedAt)}</span>
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Remove ${p.title} from recent documents`}
                    title="Remove from recent documents"
                    onClick={() => onRemove(p)}
                  >
                    <X size={18} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <button className="drop-zone" onClick={onImport}>
              <Upload size={20} aria-hidden="true" />
              Drop a file here or browse
            </button>
          )}
        </section>
      </main>
    </div>
  );
}
