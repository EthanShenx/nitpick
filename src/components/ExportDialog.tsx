import { useMemo, useState, useCallback, useEffect } from 'react';
import { Copy, Download, Check } from 'lucide-react';
import type { Project, ExportSettings } from '../core/types';
import { exportText, filteredAnnotations, exportDocx } from '../core/export';
import { download } from '../core/storage';
import { wordCount } from '../core/review';
import { Modal } from './Modal';
import { FilterControls } from './FilterControls';
const FORMAT_LABELS: Record<ExportSettings['format'], string> = {
  md: 'Markdown (.md)',
  json: 'JSON (.json)',
  docx: 'Word (.docx)',
  html: 'HTML (.html)',
  pdf: 'Annotated PDF (.pdf)',
};
export function ExportDialog({
  project,
  onChange,
  onClose,
  onError,
}: {
  project: Project;
  onChange: (s: ExportSettings) => void;
  onClose: () => void;
  onError: (s: string) => void;
}) {
  const s = project.exportSettings;
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const pdfMode = !!project.doc.pdf && s.layout === 'inline' && s.audience === 'people';
  const [pdfUrl,setPdfUrl] = useState('');
  const [pdfError,setPdfError] = useState('');
  useEffect(() => {
    if (!pdfMode) { setPdfUrl(''); return; }
    let cancelled = false, url = '';
    setPdfUrl(''); setPdfError('');
    const timer = setTimeout(async () => {
      try {
        const {exportAnnotatedPdf} = await import('../core/pdf-export');
        const bytes = await exportAnnotatedPdf(project,s);
        if (cancelled) return;
        url = URL.createObjectURL(new Blob([bytes as BlobPart],{type:'application/pdf'}));
        setPdfUrl(url);
      } catch(e) { if (!cancelled) setPdfError(String(e)); }
    },200);
    return () => {cancelled = true; clearTimeout(timer); if(url) URL.revokeObjectURL(url);};
  },[project,s,pdfMode]);
  const preview = useMemo(() => exportText(project, pdfMode ? {...s, format:'pdf'} : s), [project, s, pdfMode]);
  const count = filteredAnnotations(project, s).length;
  const update = (v: Partial<ExportSettings>) => onChange({ ...s, ...v });
  const close = useCallback(() => onClose(), [onClose]);
  const formats: ExportSettings['format'][] =
    s.layout === 'inline'
      ? s.audience === 'people'
        ? project.doc.pdf ? ['pdf'] : ['html']
        : ['md']
      : s.audience === 'ai'
        ? ['md', 'json']
        : ['md', 'docx'];
  const format = formats.includes(s.format) ? s.format : formats[0];
  return (
    <Modal title="Export revisions" onClose={close} wide>
      <div className="export-grid">
        <div className="export-options">
          <fieldset className="field">
            <legend>Audience</legend>
            <div className="segmented">
              <button
                aria-pressed={s.audience === 'ai'}
                onClick={() => update({ audience: 'ai', format: 'md' })}
              >
                For AI
              </button>
              <button
                aria-pressed={s.audience === 'people'}
                onClick={() =>
                  update({ audience: 'people', format: s.layout === 'inline' ? project.doc.pdf ? 'pdf' : 'html' : 'md' })
                }
              >
                For people
              </button>
            </div>
          </fieldset>
          <fieldset className="field">
            <legend>Layout</legend>
            <div className="segmented">
              <button
                aria-pressed={s.layout === 'list'}
                onClick={() => update({ layout: 'list', format: 'md' })}
              >
                Revision list
              </button>
              <button
                aria-pressed={s.layout === 'inline'}
                onClick={() =>
                  update({ layout: 'inline', format: s.audience === 'people' ? project.doc.pdf ? 'pdf' : 'html' : 'md' })
                }
              >
                {project.doc.pdf ? s.audience === 'people' ? 'Marked-up PDF' : 'Extracted text' : 'Marked-up text'}
              </button>
            </div>
          </fieldset>
          <label className="field" htmlFor="export-filter">
            Include
            <FilterControls
              pdf={!!project.doc.pdf}
              id="export-filter"
              label="Annotations to include"
              value={s.filters}
              onChange={(filters) => update({ filters })}
            />
          </label>
          {formats.length > 1 && (
            <label className="field" htmlFor="export-format">
              Format
              <select
                id="export-format"
                value={format}
                onChange={(e) => update({ format: e.target.value as ExportSettings['format'] })}
              >
                {formats.map((x) => (
                  <option key={x} value={x}>
                    {FORMAT_LABELS[x]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {s.audience === 'ai' && (
            <details className="instructions">
              <summary>Instructions for the AI</summary>
              <textarea
                id="instructions"
                aria-label="Instructions for the AI"
                rows={7}
                value={s.instructions}
                onChange={(e) => update({ instructions: e.target.value })}
              />
            </details>
          )}
        </div>
        <div className="preview-pane">
          <div className="preview-heading">
            <div className="preview-title">
              <strong>Preview</strong>
              {s.audience === 'ai' && (
                <span className="prompt-count" aria-label="AI prompt word count">
                  {wordCount(preview).toLocaleString()} words
                </span>
              )}
            </div>
            <span className="muted">
              {count} annotation{count === 1 ? '' : 's'}
            </span>
          </div>
          {pdfMode ? (pdfError ? <p role="alert" className="pdf-error">{pdfError}</p> : pdfUrl ? <iframe className="pdf-export-preview" title="Marked-up PDF preview" src={`${pdfUrl}#toolbar=0`} /> : <p className="pdf-help" role="status">Preparing marked-up PDF…</p>) : s.layout === 'inline' && s.audience === 'people' ? (
            <iframe title="Printable export preview" sandbox="" srcDoc={preview} />
          ) : (
            <pre tabIndex={0} aria-label="Export preview">
              {preview}
            </pre>
          )}
        </div>
      </div>
      <div className="modal-footer">
        <button
          className="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(preview);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            } catch {
              onError('Copying is unavailable in this browser. Download the file instead.');
            }
          }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : pdfMode ? 'Copy revision list' : 'Copy'}
        </button>
        <button
          className="button primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              download(
                format === 'pdf' ? new Blob([await (await import('../core/pdf-export')).exportAnnotatedPdf(project,s) as BlobPart],{type:'application/pdf'}) : format === 'docx' ? await exportDocx(project, s) : preview,
                `${project.title}-revisions.${format}`,
                format === 'html' ? 'text/html;charset=utf-8' : 'text/plain;charset=utf-8',
              );
            } catch (e) {
              onError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Download size={16} />
          {busy ? 'Preparing…' : 'Download'}
        </button>
      </div>
    </Modal>
  );
}
