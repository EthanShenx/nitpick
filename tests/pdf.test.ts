import 'fake-indexeddb/auto';
import { describe,it,expect,vi } from 'vitest';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { PDFDocument,PDFName,PDFDict,PDFHexString } from '@cantoo/pdf-lib';
vi.mock('../src/core/pdf-runtime',async()=>{
  const {getDocument,GlobalWorkerOptions}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  GlobalWorkerOptions.workerSrc=new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',import.meta.url).href;
  return {loadPdf:(bytes:Uint8Array)=>getDocument({data:bytes.slice(),useSystemFonts:true}),pdfBytes:(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0))};
});
import { findDocumentMatches } from '../src/core/search';
import { importDocument } from '../src/core/import';
import { newProject,defaultFilters } from '../src/core/types';
import type {Annotation} from '../src/core/types';
import { anchorAt,location,blockAnchor } from '../src/core/model';
import { annotationScope } from '../src/core/review';
import { pdfPoint,validPdfRects } from '../src/core/pdf-anchors';
import { parseProject,serializeProject,saveLocal,recentProjects } from '../src/core/storage';
import { listMarkdown,inlineExport,jsonExport } from '../src/core/export';
import { overlappingAnnotations } from '../src/core/overlap';
import { exportAnnotatedPdf } from '../src/core/pdf-export';
const bytes=readFileSync('samples/pdf/annotation-demo.pdf');
const load=()=>importDocument(new File([bytes],'annotation-demo.pdf',{type:'application/pdf'}));
const note=(d:Awaited<ReturnType<typeof load>>,start:number,end:number):Annotation=>({id:'E1',type:'Comment',scope:'selection',anchor:anchorAt(d,start,end),note:'Check precisely. 中文备注。',replacement:'',placement:'after',createdAt:1});
describe('original PDF documents',()=>{
 it('imports all original pages, exact repeated text offsets, rotation, crop, bookmarks and scans',async()=>{
  const d=await load(); expect(d.format).toBe('pdf');expect(findDocumentMatches(d,'no selectable text')).toEqual([]);expect(findDocumentMatches(d,'Repeated phrase')).toHaveLength(3);expect(d.pdf!.pages).toHaveLength(3);
  expect(d.pdf!.pages[1]).toMatchObject({rotation:90,width:720,height:560});
  expect(d.pdf!.outline[0]).toMatchObject({title:'Introduction',page:1});
  expect(d.original!.data).toBe(bytes.toString('base64'));
  const first=d.text.indexOf('Repeated phrase'),second=d.text.indexOf('Repeated phrase',first+1);
  const a=anchorAt(d,second,second+15);expect(a.quote).toBe('Repeated phrase');expect(a.start).toBe(second);expect(a.source).toEqual([]);
  expect(a.pdfRects).toHaveLength(1);expect(a.pdfRects![0].y).toBeGreaterThan(anchorAt(d,first,first+15).pdfRects![0].y);
  expect(location(a,d)).toBe('page 1');expect(d.warnings.join()).toContain('no selectable text');
 });
 it('round-trips immutable bytes, cross-page quotes, page rectangles, regions and unfinished settings',async()=>{
  const d=await load(),p=newProject(d,{defaultSuggestions:false});expect(p.version).toBe(2);
  const start=d.text.indexOf('second occurrence'),end=d.pdf!.pages[1].start+20;
  p.annotations=[note(d,start,end)];p.editingId='E1';p.pdfZoom=1.25;p.scroll=430;
  p.annotations.push({...note(d,d.pdf!.pages[2].start,d.pdf!.pages[2].start),id:'E2',anchor:{...anchorAt(d,d.pdf!.pages[2].start,d.pdf!.pages[2].start),region:true,pdfRects:[{page:3,x:10,y:20,width:100,height:50}]}});
  const restored=parseProject(serializeProject(p));expect(restored.doc).toEqual(d);expect(restored.annotations).toEqual(p.annotations);expect(restored.pdfZoom).toBe(1.25);expect(restored.editingId).toBe('E1');
  await saveLocal(restored);expect((await recentProjects()).find(x=>x.id===p.id)?.annotations).toEqual(p.annotations);
  const list=listMarkdown(p,p.exportSettings);expect(list).toContain(`"${d.text.slice(start,end)}" in pages 1–2`);expect(list).toContain('Selected area (10, 20, 100 × 50 pt) on page 3');
  expect(jsonExport(p,p.exportSettings)).toContain('pdfRects');expect(inlineExport(p,p.exportSettings)).toContain('Selected area');
 });
 it('validates geometry, versions and PDF payload before replacing work',async()=>{
  const p=newProject(await load(),{defaultSuggestions:false});p.annotations=[note(p.doc,0,10)];
  for(const corrupt of [(q:any)=>q.annotations[0].anchor.pdfRects[0].x=-500,(q:any)=>q.doc.pdf.pages[0].transform=[0,0,0,0,0,0],(q:any)=>q.doc.pdf.pages[1].start=0,(q:any)=>q.doc.original.data='invalid',(q:any)=>q.version=1]){
   const q=structuredClone(p);corrupt(q);expect(()=>parseProject(JSON.stringify(q))).toThrow('damaged');
  }
  expect(()=>parseProject(JSON.stringify({...p,version:4}))).toThrow('newer Nitpick');
 });
 it('supports global promotion, full page scope and spatial overlap for areas',async()=>{
  const d=await load(),p=newProject(d,{defaultSuggestions:false}),a=note(d,40,65);
  const area={...anchorAt(d,0,0),region:true,pdfRects:a.anchor.pdfRects};
  expect(validPdfRects(d,area)).toBe(true);expect(overlappingAnnotations(area,[a])).toHaveLength(1);
  const global=annotationScope(p,{...a,anchor:area},'document');expect(annotationScope(p,global,'selection').anchor).toEqual(area);
  const page=blockAnchor(d,d.blocks[0]);expect(location(page,d,'paragraph')).toBe('page 1');expect(page.quote).toBe(d.text.slice(d.blocks[0].start,d.blocks[0].end));
 });
 it('converts crop/rotation coordinates and exports real native annotations without rewriting pages',async()=>{
  const d=await load(),p=newProject(d,{defaultSuggestions:false}),original=await PDFDocument.load(bytes);
  const start=d.text.indexOf('Repeated phrase');p.annotations=[note(d,start,start+30)];
  p.annotations.push({...note(d,d.pdf!.pages[1].start,d.pdf!.pages[1].start+25),id:'E2',type:'Delete'});
  p.annotations.push({...note(d,d.pdf!.pages[2].start,d.pdf!.pages[2].start),id:'E3',anchor:{...anchorAt(d,d.pdf!.pages[2].start,d.pdf!.pages[2].start),region:true,pdfRects:[{page:3,x:55,y:100,width:180,height:120}]}});
  const point=pdfPoint(d.pdf!.pages[1],0,0);expect(point).toEqual([20,30]);
  const out=await exportAnnotatedPdf(p,p.exportSettings),pdf=await PDFDocument.load(out);expect(pdf.getPageCount()).toBe(3);
  for(let i=0;i<3;i++) expect(pdf.getPage(i).getRotation()).toEqual(original.getPage(i).getRotation());
  const a=pdf.context.lookup(pdf.getPage(0).node.Annots()!.get(0),PDFDict);
  expect(a.get(PDFName.of('Subtype'))!.toString()).toBe('/Highlight');
  expect((a.get(PDFName.of('Contents')) as PDFHexString).decodeText()).toContain('中文备注。');
  expect(a.get(PDFName.of('QuadPoints'))).toBeDefined();expect(a.get(PDFName.of('AP'))).toBeDefined();
  const filtered=await PDFDocument.load(await exportAnnotatedPdf(p,{...p.exportSettings,filters:{...defaultFilters,type:'Delete'}}));
  expect(filtered.getPage(0).node.Annots()?.size()??0).toBe(0);expect(filtered.getPage(1).node.Annots()?.size()).toBe(1);
  mkdirSync('tmp/pdfs',{recursive:true});writeFileSync('tmp/pdfs/annotation-demo-marked.pdf',out);
 });
});
