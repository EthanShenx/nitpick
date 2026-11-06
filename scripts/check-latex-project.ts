import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { zipSync } from 'fflate';
import { importDocument } from '../src/core/import';
import { anchorAt, sourceQuote } from '../src/core/model';
import { newProject } from '../src/core/types';
import { parseProject, serializeProject } from '../src/core/storage';
const root = process.argv[2];
if (!root)
  throw new Error(
    'Usage: node --import tsx scripts/check-latex-project.ts <project folder> [output folder]',
  );
function read(dir: string, prefix = ''): Record<string, Uint8Array> {
  return Object.fromEntries(
    readdirSync(dir, { withFileTypes: true })
      .filter((x) => !x.name.startsWith('.'))
      .flatMap((x) => {
        const path = prefix + x.name;
        return x.isDirectory()
          ? Object.entries(read(join(dir, x.name), path + '/'))
          : [[path, new Uint8Array(readFileSync(join(dir, x.name)))]];
      }),
  );
}
const entries = read(root);
const archive = zipSync(entries);
const doc = await importDocument(new File([archive], 'LaTeX-project.zip'));
let linear = 0,
  atomic = 0;
for (const run of doc.blocks.flatMap((b) => b.runs)) {
  assert(run.source, `Missing source: ${run.text}`);
  const source = run.source;
  assert(
    source.start >= 0 && source.end <= doc.files[source.file].length,
    `Invalid range in ${source.file}`,
  );
  if (!run.atomic) {
    assert.equal(doc.files[source.file].slice(source.start, source.end), run.text);
    linear++;
  } else {
    assert.equal(
      sourceQuote(doc, anchorAt(doc, run.start, run.end)),
      doc.files[source.file].slice(source.start, source.end),
    );
    atomic++;
  }
}
const p = newProject(doc);
const saved = serializeProject(p);
assert.deepEqual(parseProject(saved).doc, JSON.parse(JSON.stringify(doc)));
const report = {
  result: 'PASS',
  characters: doc.text.length,
  blocks: doc.blocks.length,
  linearRunsVerified: linear,
  atomicRunsVerified: atomic,
  files: Object.keys(doc.files).length,
  originalFiles: Object.keys(entries).length,
  images: Object.keys(doc.assets).length,
  tableBlocks: doc.blocks.filter((b) => b.kind === 'table').length,
  warnings: doc.warnings,
};
if (process.argv[3]) {
  mkdirSync(process.argv[3], { recursive: true });
  writeFileSync(join(process.argv[3], 'LaTeX-project.zip'), archive);
  writeFileSync(join(process.argv[3], 'LaTeX-project.nitpick'), saved);
  writeFileSync(
    join(process.argv[3], 'latex-compatibility-report.json'),
    JSON.stringify(report, null, 2),
  );
}
console.log(JSON.stringify(report, null, 2));
