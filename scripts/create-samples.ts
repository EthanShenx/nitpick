import { writeFile, readFile, readdir } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx';
import { sampleText } from '../src/sample';
await writeFile('samples/essay.md', sampleText);
const doc = new Document({
  sections: [
    {
      children: [
        new Paragraph({ text: 'The art of paying attention', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: 'Background', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('Repeated phrase. First occurrence.'),
        new Paragraph('Repeated phrase. Second occurrence. 中文文本：仔细阅读。'),
        new Paragraph({
          children: [
            new TextRun('We use '),
            new TextRun({ text: 'exact anchors', bold: true }),
            new TextRun(' to leave clear instructions.'),
          ],
        }),
        new Paragraph({ text: 'Conclusion', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('Keep the author’s voice. Make every change count.'),
      ],
    },
  ],
});
await writeFile('samples/essay.docx', await Packer.toBuffer(doc));
const entries: Record<string, Uint8Array> = {};
for (const file of await readdir('samples/latex'))
  if (/\.(tex|svg)$/.test(file))
    entries[`paper/${file}`] = new Uint8Array(await readFile(`samples/latex/${file}`));
await writeFile('samples/latex-project.zip', zipSync(entries));
await writeFile(
  'samples/ambiguous-latex.zip',
  zipSync({
    'one.tex': strToU8('\\documentclass{article}\\begin{document}One.\\end{document}'),
    'two.tex': strToU8('\\documentclass{article}\\begin{document}Two.\\end{document}'),
  }),
);
console.log('Created Markdown, Word and LaTeX ZIP samples.');

// A portable unfinished project can be reopened without any companion sample files.
const { parseLatex } = await import('../src/core/latex');
const { anchorAt } = await import('../src/core/model');
const { newProject } = await import('../src/core/types');
const { serializeProject } = await import('../src/core/storage');
const files = Object.fromEntries(
  await Promise.all(
    ['main.tex', 'conclusion.tex'].map(async (f) => [
      `paper/${f}`,
      await readFile(`samples/latex/${f}`, 'utf8'),
    ]),
  ),
);
const paper = parseLatex(
  files,
  'paper/main.tex',
  {
    'paper/diagram.svg': `data:image/svg+xml;base64,${(await readFile('samples/latex/diagram.svg')).toString('base64')}`,
  },
  'Careful reading.tex',
);
paper.original = {
  name: 'latex-project.zip',
  data: (await readFile('samples/latex-project.zip')).toString('base64'),
  encoding: 'base64',
};
const unfinished = newProject(paper);
unfinished.id = 'sample-unfinished-latex';
const math = paper.blocks.flatMap((b) => b.runs).find((r) => r.kind === 'math')!;
unfinished.annotations.push({
  id: 'E1',
  type: 'Verify',
  scope: 'selection',
  anchor: anchorAt(paper, math.start, math.end),
  note: 'Check the dimensions of the equation.',
  replacement: '',
  placement: 'after',
  createdAt: Date.now(),
});
const word = paper.text.indexOf('exact anchors');
unfinished.annotations.push({
  id: 'E2',
  type: 'Replace',
  scope: 'selection',
  anchor: anchorAt(paper, word, word + 'exact anchors'.length),
  note: 'A replacement in progress. Keep the intended meaning.',
  replacement: 'precise source',
  placement: 'after',
  createdAt: Date.now(),
});
unfinished.editingId = 'E2';
unfinished.scroll = 300;
unfinished.readingOffset = word;
unfinished.revision = 2;
await writeFile('samples/unfinished-latex.nitpick', serializeProject(unfinished));
