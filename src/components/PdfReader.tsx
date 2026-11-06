import { useEffect, useLayoutEffect, useRef, useState, memo } from 'react';
import { TextLayer } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Scan, TextSelect, MessageSquarePlus } from 'lucide-react';
import type { Anchor, Annotation, Doc, Filters, PdfPage, PdfRect, Scope } from '../core/types';
import { loadPdf, pdfBytes } from '../core/pdf-runtime';
import { anchorAt, blockAnchor, matches } from '../core/model';
import type { OverlapTarget } from './OverlapPicker';

export interface PdfReaderProps {
  doc: Doc; annotations: Annotation[]; filters: Filters; active: string | null;
  onScope: (scope: Scope, anchor: Anchor) => void;
  onJump: (id: string, target: { x: number; y: number }) => void;
  onOverlap: (target: OverlapTarget) => void;
  onSelect: (selection: { anchor: Anchor; rect: { x: number; y: number } }) => void;
  hideZoom?: boolean;
  zoom?: number | 'fit'; onZoom?: (zoom: number | 'fit') => void;
}
export default function PdfReader(props: PdfReaderProps) {
  const { doc } = props;
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [error, setError] = useState('');
  const [area, setArea] = useState(false);
  const [width, setWidth] = useState(600);
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = root.current!;
    const resize = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    resize.observe(el); return () => resize.disconnect();
  }, []);
  useEffect(() => {
    setPdf(undefined); setError('');
    const task = loadPdf(pdfBytes(doc.original!.data));
    let alive = true;
    task.promise.then(p => { if (alive) setPdf(p); }).catch(e => { if (alive) setError(`The PDF could not be displayed. ${e.message}`); });
    return () => { alive = false; void task.destroy(); };
  }, [doc]);
  return <div className="pdf-reader" ref={root}>
    <div className="pdf-tools" role="toolbar" aria-label="PDF tools">
      <div className="segmented">
        <button aria-pressed={!area} onClick={() => setArea(false)}><TextSelect size={16} /> Select text</button>
        <button aria-pressed={area} onClick={() => { window.getSelection()?.removeAllRanges(); setArea(true); }}><Scan size={16} /> Select area</button>
      </div>
      {!props.hideZoom && <label>Zoom <select aria-label="PDF zoom" value={props.zoom ?? 'fit'} onChange={e => props.onZoom?.(e.target.value === 'fit' ? 'fit' : Number(e.target.value))}>
        <option value="fit">Fit width</option>{[.75,1,1.25,1.5,2].map(n => <option key={n} value={n}>{n*100}%</option>)}
      </select></label>}
    </div>
    <p className="pdf-help">{area ? 'Drag a box around a figure, scan, or any part of a page.' : 'Select words on the original PDF to add a revision. Use Select area for figures or scans.'}</p>
    {error && <p role="alert" className="pdf-error">{error}</p>}
    {doc.pdf!.pages.map(page => <Page key={page.number} {...props} pdf={pdf} page={page} area={area}
      scale={props.zoom && props.zoom !== 'fit' ? props.zoom : Math.max(.1, Math.min(1.6, (width - 32) / page.width))} />)}
  </div>;
}
const Page = memo(function Page({ page, pdf, area, scale, ...props }: PdfReaderProps & {page: PdfPage; pdf?: PDFDocumentProxy; area: boolean; scale: number}) {
  const surface = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), text = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false), [ready, setReady] = useState(false), [error, setError] = useState('');
  const [drag, setDrag] = useState<PdfRect>();
  const origin = useRef<{x: number; y: number; id: number} | undefined>(undefined);
  const visible = props.annotations.filter(a => a.scope !== 'document' && matches(a, props.filters));
  useEffect(() => {
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { setNear(true); observer.disconnect(); } }, { rootMargin: '1200px' });
    observer.observe(surface.current!); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!pdf || !near) return;
    let cancelled = false;
    let render: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    let layer: TextLayer | undefined;
    setReady(false); setError('');
    const c = canvas.current!, container = text.current!;
    container.replaceChildren();
    (async () => {
      const p = await pdf.getPage(page.number);
      if (cancelled) return;
      const viewport = p.getViewport({scale});
      const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(12_000_000/(viewport.width*viewport.height)));
      c.width = Math.ceil(viewport.width*ratio); c.height = Math.ceil(viewport.height*ratio);
      render = p.render({ canvas: c, viewport, transform: [ratio,0,0,ratio,0,0], background:'#fff' });
      const content = await p.getTextContent();
      if (cancelled) return;
      layer = new TextLayer({ textContentSource: content, container, viewport });
      await layer.render();
      if (cancelled) return;
      for (const [index, div] of layer.textDivs.entries()) {
        const item = page.items[index];
        if (!item || item.start === item.end) continue;
        div.dataset.leaf = ''; div.dataset.start = String(item.start); div.dataset.end = String(item.end);
      }
      await render.promise;
      if (!cancelled) setReady(true);
    })().catch(e => { if (!cancelled && e.name !== 'RenderingCancelledException') setError(`Page ${page.label} could not be rendered: ${e.message}`); });
    return () => { cancelled = true; render?.cancel(); layer?.cancel(); };
  }, [pdf, near, page, scale]);
  const point = (e: {clientX: number; clientY: number}) => {
    const r = surface.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(page.width, (e.clientX-r.left)/scale)), y: Math.max(0, Math.min(page.height, (e.clientY-r.top)/scale)) };
  };
  const open = (ids: string[], x: number, y: number) => ids.length > 1 ? props.onOverlap({ids,x,y}) : ids.length && props.onJump(ids[0], {x,y});
  return <section id={`pdf-page-${page.number}`} className="pdf-page" aria-label={`PDF page ${page.label}`} style={{width: page.width*scale}}>
    <header className="pdf-page-heading"><span>Page {page.label}{page.label !== String(page.number) ? ` · ${page.number} of ${props.doc.pdf!.pages.length}` : ` of ${props.doc.pdf!.pages.length}`}</span>
      <button className="text-button" aria-label={`Add page ${page.label} note`} onClick={() => props.onScope('paragraph', blockAnchor(props.doc, props.doc.blocks[page.number-1]))}><MessageSquarePlus size={15} /> Page note</button>
    </header>
    <div ref={surface} data-pdf-page={page.number} className={`pdf-page-surface ${area ? 'area-mode' : ''}`} style={{width:page.width*scale,height:page.height*scale,'--total-scale-factor':scale} as React.CSSProperties}
      onClick={e => {
        if (area || !window.getSelection()?.isCollapsed) return;
        const p = point(e);
        const hits = visible.filter(a => a.anchor.pdfRects?.some(r => r.page === page.number && p.x >= r.x && p.x <= r.x+r.width && p.y >= r.y && p.y <= r.y+r.height));
        if (hits.length) open(hits.map(a => a.id), e.clientX,e.clientY);
      }}>
      <canvas ref={canvas} aria-hidden="true" />
      {!ready && !error && <span className="pdf-page-loading">Rendering page {page.label}…</span>}
      {error && <p role="alert" className="pdf-error">{error}</p>}
      <div className="pdf-highlights" aria-label={`Annotations on page ${page.label}`}>
        {visible.flatMap(a => (a.anchor.pdfRects ?? []).filter(r => r.page === page.number).map((r,i) => <span key={`${a.id}-${i}`} className={`pdf-mark type-${a.type.toLowerCase()} ${a.id === props.active ? 'is-active' : ''}`} style={{left:r.x*scale,top:r.y*scale,width:r.width*scale,height:r.height*scale}} />))}
      </div>
      <div className="textLayer" ref={text} />
      {visible.filter(a => a.anchor.pdfRects?.some(r => r.page === page.number)).map((a,i) => {
        const r = a.anchor.pdfRects!.find(r => r.page === page.number)!;
        return <button key={a.id} className={`pdf-note-pin type-${a.type.toLowerCase()}`} data-annotation-ids={a.id} aria-label={`${a.type}: ${a.note || a.anchor.quote || 'Selected area'}`} style={{left:Math.min(page.width*scale-24,(r.x+r.width)*scale),top:Math.min(page.height*scale-24,r.y*scale)}} onClick={e => {e.stopPropagation(); open([a.id],e.clientX,e.clientY);}}><span>{i+1}</span></button>;
      })}
      {area && <div className="pdf-area-tool" aria-label="Drag to select an area" onPointerDown={e => {
        if (e.button !== 0) return;
        e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
        origin.current = {...point(e), id:e.pointerId}; setDrag(undefined);
      }} onPointerMove={e => {
        if (!origin.current || e.pointerId !== origin.current.id) return;
        const p = point(e), o = origin.current;
        setDrag({page:page.number,x:Math.min(o.x,p.x),y:Math.min(o.y,p.y),width:Math.abs(p.x-o.x),height:Math.abs(p.y-o.y)});
      }} onPointerCancel={() => {origin.current = undefined; setDrag(undefined);}} onPointerUp={e => {
        if (!origin.current || e.pointerId !== origin.current.id) return;
        const o = origin.current, p = point(e); origin.current = undefined;
        const box = {page:page.number,x:Math.min(o.x,p.x),y:Math.min(o.y,p.y),width:Math.abs(p.x-o.x),height:Math.abs(p.y-o.y)};
        if (box.width*scale > 5 && box.height*scale > 5) props.onSelect({anchor:{...anchorAt(props.doc,page.start,page.start),region:true,pdfRects:[box]},rect:{x:e.clientX,y:e.clientY}});
        setDrag(undefined);
      }}>{drag && <span className="pdf-drag-box" style={{left:drag.x*scale,top:drag.y*scale,width:drag.width*scale,height:drag.height*scale}} />}</div>}
    </div>
  </section>;
});
