import { PDFDocument, StandardFonts, rgb, degrees, PDFName, PDFHexString } from '@cantoo/pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';
const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
const first = pdf.addPage([612,792]);
first.drawText('A paper, kept on the page', {x:60,y:710,size:24,font:bold});
const lines = ['Repeated phrase stays here. This is the first occurrence.',
 'Select this complete sentence to leave a comment.',
 '', 'The second paragraph stays in its original position.',
 'A long selection can cross lines and continue on the next page.',
 '', 'Repeated phrase stays here. This is the second occurrence.'];
lines.forEach((line,i)=>first.drawText(line,{x:60,y:650-i*25,size:13,font}));
first.drawRectangle({x:60,y:150,width:230,height:180,color:rgb(.85,.93,.98)});
first.drawText('Figure 1: original vector artwork',{x:70,y:235,size:12,font});
const second=pdf.addPage([612,792]);
second.drawText('Selections can cross page boundaries.',{x:60,y:700,size:18,font:bold});
second.drawText('Repeated phrase stays here. This is on page two.',{x:60,y:650,size:13,font});
second.drawText('Cropped and rotated pages retain their geometry.',{x:60,y:600,size:13,font});
second.setCropBox(20,30,560,720); second.setRotation(degrees(90));
pdf.addPage([500,650]).drawRectangle({x:55,y:80,width:380,height:470,color:rgb(.92,.88,.77)});
const ctx=pdf.context;
const outline=ctx.obj({Type:'Outlines',Count:1}); const ref=ctx.register(outline);
const item=ctx.register(ctx.obj({Title:PDFHexString.fromText('Introduction'),Parent:ref,Dest:[first.ref,PDFName.of('Fit')]}));
outline.set(PDFName.of('First'),item);outline.set(PDFName.of('Last'),item);pdf.catalog.set(PDFName.of('Outlines'),ref);
await mkdir('samples/pdf',{recursive:true});
await writeFile('samples/pdf/annotation-demo.pdf',await pdf.save());
