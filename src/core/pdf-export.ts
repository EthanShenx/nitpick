import { PDFDocument, PDFName, PDFHexString } from '@cantoo/pdf-lib';
import type { ExportSettings, Project, PdfRect } from './types';
import { filteredAnnotations, listMarkdown } from './export';
import { pdfPoint } from './pdf-anchors';
const COLORS: Record<string, number[]> = { Delete:[.9,.2,.22],Replace:[.9,.45,.1],Insert:[.15,.65,.3],Move:[.6,.3,.8],Comment:[1,.76,.1],Keep:[.1,.65,.6],Verify:[.15,.5,.95] };
/** Standard native PDF annotations. Original page streams and existing markup stay intact. */
export async function exportAnnotatedPdf(project: Project, settings: ExportSettings): Promise<Uint8Array> {
  if (!project.doc.pdf || !project.doc.original) throw new Error('This document is not a PDF.');
  const bytes = Uint8Array.from(atob(project.doc.original.data),c=>c.charCodeAt(0));
  const pdf = await PDFDocument.load(bytes);
  const ctx = pdf.context;
  for (const a of filteredAnnotations(project,settings)) {
    const notes = listMarkdown({...project,annotations:[a]}, {...settings,audience:'people',layout:'list',format:'md'});
    const boxes = a.scope === 'document' ? [{page:1,x:18,y:18+(project.annotations.indexOf(a)%12)*24,width:18,height:18}] : a.anchor.pdfRects ?? [];
    const byPage = new Map<number,PdfRect[]>();
    for (const box of boxes) byPage.set(box.page,[...(byPage.get(box.page) ?? []),box]);
    for (const [number, rects] of byPage) {
      const info = project.doc.pdf.pages[number-1], page = pdf.getPage(number-1);
      const quads=rects.map(box=>[pdfPoint(info,box.x,box.y),pdfPoint(info,box.x+box.width,box.y),pdfPoint(info,box.x,box.y+box.height),pdfPoint(info,box.x+box.width,box.y+box.height)]);
      const corners=quads.flat(), xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]);
      const rect=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
      const color=COLORS[a.type], global=a.scope==='document', region=a.anchor.region;
      const subtype = global ? 'Text' : region ? 'Square' : ['Delete','Replace'].includes(a.type) ? 'StrikeOut' : 'Highlight';
      let appearance = `${color.join(' ')} rg ${color.join(' ')} RG /GS gs 1 w `;
      for (const [tl,tr,bl,br] of quads) {
        const path = `${tl.join(' ')} m ${tr.join(' ')} l ${br.join(' ')} l ${bl.join(' ')} l h`;
        appearance += subtype === 'StrikeOut' ? `${(tl[0]+bl[0])/2} ${(tl[1]+bl[1])/2} m ${(tr[0]+br[0])/2} ${(tr[1]+br[1])/2} l S\n` : `${path} ${region || global ? 'B' : 'f'}\n`;
      }
      const stream = ctx.flateStream(appearance, {Type:'XObject',Subtype:'Form',BBox:rect,
        Resources:{ExtGState:{GS:{Type:'ExtGState',ca:global ? .9 : .27,CA:subtype==='StrikeOut' ? 1 : .9,BM:'Multiply'}}}});
      const dict = ctx.obj({ Type:'Annot',Subtype:subtype,Rect:rect,P:page.ref,
        Contents:PDFHexString.fromText(notes),T:PDFHexString.fromText('Nitpick'),
        Subj:PDFHexString.fromText(a.type),NM:PDFHexString.fromText(`nitpick-${a.id}-${number}`),
        C:color,F:4,AP:{N:ctx.register(stream)},
        ...(global ? {Name:'Comment',Open:false} : region ? {BS:{W:1,S:'S'},IC:color} : {QuadPoints:quads.flat(2)}),
      });
      const annots=page.node.Annots(), ref=ctx.register(dict);
      if (annots) annots.push(ref); else page.node.set(PDFName.of('Annots'),ctx.obj([ref]));
    }
  }
  return pdf.save();
}
