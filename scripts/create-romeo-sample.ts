import { readFile, writeFile } from 'node:fs/promises';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
const source = JSON.parse(await readFile('samples/romeo-and-juliet.json', 'utf8'));
const verse = (text: string) =>
  text
    .split('\n')
    .flatMap((line, i) =>
      i ? [new TextRun({ break: 1 }), new TextRun(line)] : [new TextRun(line)],
    );
const body = [
  new Paragraph({ text: source.title, heading: HeadingLevel.HEADING_1 }),
  new Paragraph({ text: source.author }),
  new Paragraph({ text: 'Selected passages from the Prologue and the balcony scene.' }),
  new Paragraph({ text: 'Prologue', heading: HeadingLevel.HEADING_2 }),
  new Paragraph({
    children: [
      new TextRun({ text: 'CHORUS.', bold: true }),
      new TextRun({ break: 1 }),
      ...verse(source.prologue),
    ],
  }),
  new Paragraph({ text: 'Act II', heading: HeadingLevel.HEADING_2, pageBreakBefore: true }),
  new Paragraph({ text: 'Scene II Capulet’s Garden', heading: HeadingLevel.HEADING_3 }),
];
for (const stanza of source.balcony.split('\n\n')) {
  const lines = stanza.split('\n'),
    speaker = lines[0];
  body.push(
    new Paragraph({
      keepLines: true,
      children: /^[A-Z]+\.$/.test(speaker)
        ? [
            new TextRun({ text: speaker, bold: true }),
            new TextRun({ break: 1 }),
            ...verse(lines.slice(1).join('\n')),
          ]
        : verse(stanza),
    }),
  );
}
const doc = new Document({
  creator: 'Nitpick',
  title: source.title,
  description: 'Public-domain literary example for the Nitpick documentation.',
  styles: {
    default: {
      document: {
        run: { font: 'Georgia', size: 24 },
        paragraph: { spacing: { after: 160, line: 288 } },
      },
    },
    paragraphStyles: [
      {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { font: 'Georgia', size: 44, bold: true, color: '202020' },
        paragraph: { spacing: { before: 0, after: 240 } },
      },
      {
        id: 'Heading2',
        name: 'Heading 2',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { font: 'Georgia', size: 30, bold: true, color: '202020' },
        paragraph: { spacing: { before: 240, after: 200 } },
      },
      {
        id: 'Heading3',
        name: 'Heading 3',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { font: 'Georgia', size: 26, bold: true, color: '202020' },
        paragraph: { spacing: { before: 160, after: 160 } },
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
        },
      },
      children: body,
    },
  ],
});
await writeFile('samples/Romeo and Juliet.docx', await Packer.toBuffer(doc));
console.log('Created samples/Romeo and Juliet.docx');
