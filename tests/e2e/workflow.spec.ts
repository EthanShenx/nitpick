import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Document, Packer, Paragraph, HeadingLevel } from 'docx';
import { GLOBAL_SUGGESTIONS } from '../../src/core/review';
import { zipSync, strToU8 } from 'fflate';
const essay =
  '# Test essay\n\n## Background\n\nRepeated phrase. First occurrence.\n\nRepeated phrase. Second occurrence with 中文文本。\n\n' +
  'This is a deliberately long paragraph, with punctuation. '.repeat(30) +
  '\n\nLast paragraph. This is a destination.\n\n## Conclusion\n\nKeep the conclusion.\n';
// Legacy workflow fixtures intentionally start without the two writing defaults.
async function settleImport(page: Page) {
  await expect(page.locator('.loading-toast')).toBeHidden({ timeout: 30000 });
  const setup = page.getByRole('dialog', { name: 'Save project file' });
  if (await setup.isVisible())
    await setup.getByRole('button', { name: 'Continue in browser', exact: true }).click();
  for (const note of GLOBAL_SUGGESTIONS) {
    const card = page.locator('.annotation-card').filter({ hasText: note });
    if (await card.count()) await card.getByRole('button', { name: /Remove annotation/ }).click();
  }
}
async function importText(page: Page) {
  await page.goto('/');
  await page
    .getByLabel('Import document or project')
    .setInputFiles({ name: 'essay.md', mimeType: 'text/markdown', buffer: Buffer.from(essay) });
  await settleImport(page);
  await expect(page.getByRole('article', { name: 'Read-only document' })).toBeVisible();
}
async function select(page: Page, text: string, occurrence = 0, endText?: string) {
  await settleImport(page);
  await page.evaluate(
    ({ text, occurrence, endText }) => {
      const leaves = [...document.querySelectorAll<HTMLElement>('.paper [data-leaf]')];
      const normalized = leaves.map((e) => e.textContent ?? '').join('');
      // Match actual normalized model offsets, not a search in browser innerText.
      let start = -1;
      let end = -1;
      let count = 0;
      for (const leaf of leaves) {
        const content = leaf.textContent ?? '';
        let local = -1;
        while ((local = content.indexOf(text, local + 1)) >= 0) {
          if (count++ === occurrence) {
            start = Number(leaf.dataset.start) + local;
            break;
          }
        }
        if (start >= 0) break;
      }
      if (start < 0) throw new Error(`Text not found: ${text}`);
      end = start + text.length;
      if (endText) {
        const leaf = leaves.find((e) => (e.textContent ?? '').includes(endText));
        if (!leaf) throw new Error('end missing');
        end =
          Number(leaf.dataset.start) + (leaf.textContent ?? '').indexOf(endText) + endText.length;
      }
      const first = leaves.find(
        (e) => Number(e.dataset.start) <= start && Number(e.dataset.end) > start,
      )!;
      const last = [...leaves]
        .reverse()
        .find((e) => Number(e.dataset.start) < end && Number(e.dataset.end) >= end)!;
      first.scrollIntoView({ block: 'center' });
      const range = document.createRange();
      const firstText = document.createTreeWalker(first, NodeFilter.SHOW_TEXT).nextNode()!;
      const lastText = document.createTreeWalker(last, NodeFilter.SHOW_TEXT).nextNode()!;
      range.setStart(firstText, start - Number(first.dataset.start));
      range.setEnd(lastText, end - Number(last.dataset.start));
      const s = window.getSelection()!;
      s.removeAllRanges();
      s.addRange(range);
      document.activeElement instanceof HTMLElement && document.activeElement.blur();
      first.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    },
    { text, occurrence, endText },
  );
  await expect(page.getByRole('toolbar', { name: 'Annotate selection' })).toBeVisible();
}
async function annotate(page: Page, type: string, note = 'Test note', replacement = '') {
  await page.getByRole('button', { name: `${type} selection`, exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Annotation editor' });
  if (['Delete', 'Keep', 'Verify'].includes(type)) {
    if (!note) return;
    await page
      .locator('.annotation-card')
      .last()
      .getByRole('button', { name: /Edit annotation/ })
      .click();
  }
  await expect(editor).toBeVisible();
  if (replacement)
    await editor
      .getByLabel(type === 'Insert' ? 'Insertion text' : 'Replacement text')
      .fill(replacement);
  if (note) await editor.getByLabel('Annotation note').fill(note);
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(editor).toBeHidden();
}
async function downloadProject(page: Page, path: string) {
  await settleImport(page);
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save options' }).click();
  await page.getByRole('button', { name: 'Download a copy' }).click();
  const dl = await event;
  await dl.saveAs(path);
  await expect(page.getByRole('status')).toContainText('Saved to file');
}
test('import → repeated-phrase annotation → autosave → portable fresh-profile reopen → continue → export', async ({
  page,
  browser,
}, info) => {
  await importText(page);
  await select(page, 'Repeated phrase.', 1);
  await annotate(page, 'Replace', 'Be specific.', 'This exact occurrence.');
  await expect(page.locator('.annotation-card')).toHaveCount(1);
  await expect(page.locator('.annotation-card')).toContainText('Paragraph 2');
  await page.locator('.reading-area').evaluate((e) => {
    e.scrollTop = 390;
  });
  await expect
    .poll(() => page.locator('.reading-area').evaluate((e) => e.scrollTop))
    .toBeGreaterThan(300);
  await page.waitForTimeout(250);
  await page.reload();
  await expect(page.locator('.annotation-card')).toHaveCount(1);
  await expect
    .poll(() => page.locator('.reading-area').evaluate((e) => e.scrollTop))
    .toBeGreaterThan(300);
  const path = info.outputPath('half-finished.nitpick');
  await downloadProject(page, path);
  const p = JSON.parse(await readFile(path, 'utf8'));
  expect(p.annotations[0].anchor.source[0].start).toBe(essay.lastIndexOf('Repeated phrase.'));
  expect(p.doc.files['essay.md']).toBe(essay);
  const fresh = await browser.newContext();
  const second = await fresh.newPage();
  await second.goto('/');
  await expect(second.getByRole('button', { name: 'Open document' })).toBeVisible();
  await second.getByLabel('Import document or project').setInputFiles(path);
  await settleImport(second);
  await expect(second.locator('.annotation-card')).toHaveCount(1);
  await expect
    .poll(() => second.locator('.reading-area').evaluate((e) => e.scrollTop))
    .toBeGreaterThan(300);
  await select(second, 'Last paragraph.');
  await annotate(second, 'Verify', '');
  await expect(second.locator('.annotation-card')).toHaveCount(2);
  await expect(second.getByRole('status')).toContainText('Unsaved changes to file');
  await downloadProject(second, info.outputPath('continued.nitpick'));
  await second.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(second.getByLabel('Export preview')).toContainText(
    '"Repeated phrase." in paragraph 2, section 1 ("Background")',
  );
  await expect(second.getByLabel('Export preview')).toContainText('Context:');
  const event = second.waitForEvent('download');
  await second.getByRole('button', { name: 'Download', exact: true }).click();
  const dl = await event;
  await dl.saveAs(info.outputPath('revisions.md'));
  expect(await readFile(info.outputPath('revisions.md'), 'utf8')).toContain(
    'This exact occurrence.',
  );
  await fresh.close();
});
test('all actions, keyboard/IME, every scope, undo/redo, move and filters', async ({ page }) => {
  await importText(page);
  for (const [key, type] of [
    ['d', 'Delete'],
    ['r', 'Replace'],
    ['i', 'Insert'],
    ['m', 'Move'],
    ['c', 'Comment'],
    ['k', 'Keep'],
    ['v', 'Verify'],
  ]) {
    await select(page, 'Repeated phrase.');
    await page.keyboard.press(key);
    if (['Delete', 'Keep', 'Verify'].includes(type)) continue;
    if (type === 'Move') {
      await page.getByLabel('Move destination').selectOption('choose');
      await page.getByRole('button', { name: 'Done', exact: true }).click();
      await selectDestination(page);
      continue;
    }
    await expect(page.getByRole('dialog', { name: 'Annotation editor' })).toBeVisible();
    await expect(page.getByLabel('Annotation type')).toHaveValue(type);
    if (type === 'Replace') await page.getByLabel('Replacement text').fill('改写');
    if (type === 'Insert') await page.getByLabel('Insertion text').fill('插入');
    await page.getByLabel('Annotation note').fill('Note');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
  }
  await expect(page.locator('.annotation-card')).toHaveCount(7);
  await select(page, 'First occurrence.');
  await page.evaluate(() =>
    document.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })),
  );
  await page.keyboard.press('d');
  await expect(page.getByRole('dialog', { name: 'Annotation editor' })).toBeHidden();
  await page.evaluate(() =>
    document.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })),
  );
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Undo annotation change' }).click();
  await expect(page.locator('.annotation-card')).toHaveCount(6);
  await page.getByRole('button', { name: 'Redo annotation change' }).click();
  await expect(page.locator('.annotation-card')).toHaveCount(7);
  await page.getByLabel('Filter annotations').selectOption({ label: 'Small edits' });
  await expect(page.locator('.annotation-card')).toHaveCount(3);
  await page.getByLabel('Filter annotations').selectOption({ label: 'All annotations' });
  await page.locator('#b2').hover();
  await page.getByRole('button', { name: 'Add paragraph note b2', exact: true }).click();
  await page.getByLabel('Annotation note').fill('Whole paragraph');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator('#b1').hover();
  await page.getByRole('button', { name: 'Add section note b1', exact: true }).click();
  await page.getByLabel('Annotation note').fill('Whole section');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Whole document', exact: true }).click();
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await page.getByLabel('Annotation note').fill('Whole document');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Annotations 10', exact: true }).click();
  await expect(page.locator('.annotation-card')).toHaveCount(10);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: 'For people', exact: true }).click();
  await expect(page.getByLabel('Export preview')).not.toContainText('[E1]');
  await page.locator('#export-format').selectOption('docx');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  expect((await dl).suggestedFilename()).toMatch(/\.docx$/);
});
async function selectDestination(page: Page) {
  await page.evaluate(() => {
    const span = [...document.querySelectorAll<HTMLElement>('[data-leaf]')].find((e) =>
      e.textContent?.includes('Last paragraph.'),
    )!;
    const range = document.createRange();
    range.selectNodeContents(span);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    span.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.getByRole('button', { name: 'Move here' }).click();
}
test('long multi-paragraph quotes survive both list audiences and export presets', async ({
  page,
}) => {
  await importText(page);
  await select(page, 'First occurrence.', 0, 'Last paragraph.');
  const quote = await page.evaluate(() => {
    const s = window.getSelection()!;
    return s.toString();
  });
  await annotate(page, 'Comment', 'Review the argument.');
  await page.getByRole('button', { name: /Show full quote/ }).click();
  await expect(page.locator('.annotation-card blockquote')).toContainText('Last paragraph.');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const preview = page.getByLabel('Export preview');
  await expect(preview).toContainText('paragraphs 1-4');
  await expect(preview).toContainText(
    'This is a deliberately long paragraph, with punctuation. '.repeat(30).trim(),
  );
  await page.getByRole('button', { name: 'For people', exact: true }).click();
  await expect(preview).toContainText('paragraphs 1-4');
  await page.getByRole('button', { name: 'Marked-up text' }).click();
  await expect(page.getByTitle('Printable export preview')).toBeVisible();
});
test('Word and LaTeX project imports, atomic math mapping, unknown placeholders and main choice', async ({
  page,
}, info) => {
  await page.goto('/');
  const word = await Packer.toBuffer(
    new Document({
      sections: [
        {
          children: [
            new Paragraph({ text: 'Word paper', heading: HeadingLevel.HEADING_1 }),
            new Paragraph('A Word paragraph with 中文 text.'),
          ],
        },
      ],
    }),
  );
  await page.getByLabel('Import document or project').setInputFiles({
    name: 'paper.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: word,
  });
  await settleImport(page);
  await expect(page.locator('.paper')).toContainText('A Word paragraph with 中文 text.');
  await select(page, '中文');
  await annotate(page, 'Keep', 'Keep this wording.');
  const main = await readFile('samples/latex/main.tex', 'utf8'),
    conclusion = await readFile('samples/latex/conclusion.tex', 'utf8'),
    svg = await readFile('samples/latex/diagram.svg');
  const zip = zipSync({
    'paper/main.tex': strToU8(main),
    'paper/conclusion.tex': strToU8(conclusion),
    'paper/diagram.svg': svg,
  });
  await page
    .getByLabel('Import document or project')
    .setInputFiles({ name: 'paper.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) });
  await settleImport(page);
  await expect(page.locator('.paper')).toContainText(
    'Included text has its own source coordinates.',
  );
  await expect(page.locator('.paper img')).toBeVisible();
  await expect(page.locator('.paper')).toContainText('First item.');
  await expect(page.locator('.paper')).toContainText('Second item with bold text.');
  await expect(page.locator('.placeholder')).toContainText([
    'Unsupported environment: tikzpicture',
    'Unsupported command: \\mystery{content}',
  ]);
  await expect(page.locator('.katex')).toHaveCount(2);
  await page.locator('.run.math').first().click();
  await page.evaluate(() => {
    const el = document.querySelector('.run.math')!;
    const leaf = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode()!;
    const r = document.createRange();
    r.setStart(leaf, 0);
    r.setEnd(leaf, Math.min(1, leaf.textContent!.length));
    const s = window.getSelection()!;
    s.removeAllRanges();
    s.addRange(r);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await annotate(page, 'Verify', 'Check this equation.');
  await downloadProject(page, info.outputPath('latex.nitpick'));
  const saved = JSON.parse(await readFile(info.outputPath('latex.nitpick'), 'utf8'));
  expect(saved.annotations[0].anchor.source).toEqual([
    {
      file: 'paper/main.tex',
      start: main.indexOf('$E='),
      end: main.indexOf('$E=') + '$E=mc^2$'.length,
    },
  ]);
  expect(Object.keys(saved.doc.assets)).toContain('paper/diagram.svg');
  const ambiguous = zipSync({
    'one.tex': strToU8('\\documentclass{article}\\begin{document}One.\\end{document}'),
    'two.tex': strToU8('\\documentclass{article}\\begin{document}Two.\\end{document}'),
  });
  await page.getByLabel('Import document or project').setInputFiles({
    name: 'ambiguous.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(ambiguous),
  });
  await settleImport(page);
  await expect(page.getByRole('dialog', { name: 'Choose the main LaTeX file' })).toBeVisible();
  await page.getByRole('button', { name: 'two.tex' }).click();
  await settleImport(page);
  await expect(page.locator('.paper')).toContainText('Two.');
});
test('invalid project is isolated and desktop/tablet/mobile have no horizontal overflow', async ({
  page,
}, info) => {
  await importText(page);
  await page.getByLabel('Import document or project').setInputFiles({
    name: 'future.nitpick',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":"nitpick","version":99}'),
  });
  await settleImport(page);
  await expect(page.getByRole('alert')).toContainText('newer');
  await expect(page.locator('.paper')).toContainText('Repeated phrase.');
  await page.getByLabel('Dismiss error').click();
  for (const [name, width, height] of [
    ['desktop', 1440, 1000],
    ['tablet', 834, 1112],
    ['mobile', 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  }
});

test('keyboard selection and an open draft persist through refresh and portable saving', async ({
  page,
}, info) => {
  await importText(page);
  const reader = page.getByLabel('Document text. Shift plus arrow keys selects text.');
  await reader.focus();
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('r');
  await page.getByLabel('Replacement text').fill('Unfinished replacement 中文');
  await page.getByLabel('Annotation note').fill('Draft still open.');
  await expect(page.locator('.annotation-card')).toContainText('Unfinished replacement 中文');
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Annotation editor' })).toBeVisible();
  await expect(page.getByLabel('Replacement text')).toHaveValue('Unfinished replacement 中文');
  await downloadProject(page, info.outputPath('open-draft.nitpick'));
  const saved = JSON.parse(await readFile(info.outputPath('open-draft.nitpick'), 'utf8'));
  expect(saved.editingId).toBe(saved.annotations[0].id);
  expect(saved.annotations[0].replacement).toBe('Unfinished replacement 中文');
});

test('overlapping word ranges stay exact, offer every note, and survive deleting one', async ({
  page,
}) => {
  await importText(page);
  const start = Number(await page.locator('#b2 [data-leaf]').first().getAttribute('data-start'));
  const selectRange = async (from: number, to: number) =>
    page.evaluate(
      ({ from, to }) => {
        const spans = [...document.querySelectorAll<HTMLElement>('.paper [data-leaf]')];
        const a = spans.find(
          (e) => Number(e.dataset.start) <= from && Number(e.dataset.end) > from,
        )!;
        const b = [...spans]
          .reverse()
          .find((e) => Number(e.dataset.start) < to && Number(e.dataset.end) >= to)!;
        const range = document.createRange();
        range.setStart(a.firstChild!, from - Number(a.dataset.start));
        range.setEnd(b.firstChild!, to - Number(b.dataset.start));
        const selected = window.getSelection()!;
        selected.removeAllRanges();
        selected.addRange(range);
        a.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      },
      { from, to },
    );
  await selectRange(start, start + 15);
  await annotate(page, 'Delete', '');
  await selectRange(start + 9, start + 25);
  await page.getByRole('button', { name: 'Comment selection', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Annotation editor' })).toContainText(
    'Overlaps 1 other note',
  );
  await page.getByLabel('Annotation note').fill('Another note on shared text.');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.annotation-card')).toHaveCount(2);
  await expect(page.locator('.mark-overlap')).toHaveCount(1);
  await page.locator('.mark-overlap').press('Enter');
  const chooser = page.getByRole('dialog', { name: 'Overlapping annotations' });
  await expect(chooser.locator('[data-choose]')).toHaveCount(2);
  await chooser.locator('[data-choose]').filter({ hasText: 'Comment' }).click();
  await expect(page.locator('.annotation-card.active')).toContainText(
    'Another note on shared text.',
  );
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByLabel('Export preview')).toContainText('Overlaps:');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page
    .locator('.annotation-card')
    .filter({ hasText: 'Another note on shared text.' })
    .getByRole('button', { name: /Remove annotation/ })
    .click();
  await expect(page.locator('.annotation-card')).toHaveCount(1);
  await expect(page.locator('.mark-overlap')).toHaveCount(0);
  await expect(page.locator('.annotation-card blockquote')).toHaveText('Repeated phrase');
});

test('selection ending at a shared-highlight boundary does not include adjacent atomic content', async ({
  page,
}) => {
  await importText(page);
  await page.evaluate(async () => {
    const { readSelection } = await import(/* @vite-ignore */ '/src/core/selection.ts' as string);
    const root = document.createElement('div');
    root.innerHTML =
      '<span data-leaf="true" data-start="0" data-end="5">alpha</span><span data-leaf="true" data-start="5" data-end="9" data-atomic="true">math</span>';
    document.body.append(root);
    const spans = root.querySelectorAll('span');
    const range = document.createRange();
    range.setStart(spans[0].firstChild!, 1);
    range.setEnd(spans[1].firstChild!, 0);
    const selected = window.getSelection()!;
    selected.removeAllRanges();
    selected.addRange(range);
    const { parseMarkdown } = await import(/* @vite-ignore */ '/src/core/markdown.ts' as string);
    const result = readSelection(root, parseMarkdown('alphamath'));
    if (result?.anchor.quote !== 'lpha' || result.anchor.end !== 5)
      throw new Error('Selection leaked across an atomic boundary');
    selected.removeAllRanges();
    root.remove();
  });
});

test('a dependent main.tex guides folder import and retains table selections in portable exports', async ({
  page,
}, info) => {
  await page.goto('/');
  await page
    .getByLabel('Import document or project')
    .setInputFiles('samples/latex-compatibility/main.tex');
  await settleImport(page);
  await expect(page.getByRole('dialog', { name: 'Open the complete LaTeX project' })).toContainText(
    'sections/essay',
  );
  const { resolve } = await import('node:path');
  await page
    .getByLabel('Import LaTeX project folder')
    .setInputFiles(resolve('samples/latex-compatibility'));
  await settleImport(page);
  await expect(page.getByRole('dialog', { name: 'Open the complete LaTeX project' })).toBeHidden();
  const paper = page.getByRole('article', { name: 'Read-only document' });
  await expect(paper).toContainText('Reading the Cell: A Review');
  await expect(paper).toContainText('Reader et al. (2025)');
  await expect(paper).toContainText('A complete figure caption.');
  await expect(paper).not.toContainText('Unsupported');
  await expect(paper.getByRole('table')).toContainText('Independent evidence with 中文 text.');
  await page.evaluate(() => {
    const row = [...document.querySelectorAll<HTMLElement>('.paper-table [role="row"]')].find((r) =>
      r.textContent?.includes('Lineage tracing supports'),
    )!;
    const leaves = [...row.querySelectorAll<HTMLElement>('[data-leaf]')].filter((el) =>
      el.textContent?.trim(),
    );
    const first = leaves[0],
      last = leaves.at(-1)!;
    first.scrollIntoView({ block: 'center' });
    const range = document.createRange();
    range.setStart(first.firstChild!, 0);
    range.setEnd(last.firstChild!, last.textContent!.length);
    const selected = window.getSelection()!;
    selected.removeAllRanges();
    selected.addRange(range);
    first.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await annotate(page, 'Comment', 'Check both cells together.');
  await expect(page.locator('.annotation-card blockquote')).toContainText(
    'Lineage tracing supports a reversible programme.',
  );
  await downloadProject(page, info.outputPath('academic-project.nitpick'));
  const saved = JSON.parse(await readFile(info.outputPath('academic-project.nitpick'), 'utf8'));
  expect(saved.annotations[0].anchor.source[0].file).toMatch(/sections\/tables.tex$/);
  expect(saved.doc.original.data).toBeTruthy();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByLabel('Export preview')).toContainText(
    '\\cite{reader2025} & Lineage tracing supports a reversible programme.',
  );
  await page.getByRole('button', { name: 'Close dialog' }).click();
  const context = await page.context().browser()!.newContext();
  const fresh = await context.newPage();
  await fresh.goto('/');
  await fresh
    .getByLabel('Import document or project')
    .setInputFiles(info.outputPath('academic-project.nitpick'));
  await settleImport(fresh);
  await expect(fresh.getByRole('table')).toContainText(
    'Lineage tracing supports a reversible programme.',
  );
  await expect(fresh.locator('.annotation-card')).toContainText('Check both cells together.');
  await context.close();
});

test('labeled toolbar and direct highlight removal preserve the document, Undo, overlaps and IME', async ({
  page,
}) => {
  await importText(page);
  const original = await page.locator('.paper [data-leaf]').allTextContents();
  await select(page, 'Repeated phrase.');
  const toolbar = page.getByRole('toolbar', { name: 'Annotate selection' });
  for (const action of ['Delete', 'Replace', 'Insert', 'Move', 'Comment', 'Keep', 'Verify']) {
    const button = toolbar.getByRole('button', { name: `${action} selection`, exact: true });
    await expect(button).toHaveText(action);
    await expect(button.locator('svg')).toBeVisible();
  }
  await page.keyboard.press('k');
  const mark = page.locator('.paper .mark-keep').first();
  await mark.click();
  await expect(page.getByRole('toolbar', { name: 'Highlight actions' })).toBeVisible();
  expect(await mark.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.locator('.annotation-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo annotation change' }).click();
  await expect(page.locator('.annotation-card')).toHaveCount(1);
  await page.locator('.paper .mark-keep').first().press('Backspace');
  await expect(page.locator('.annotation-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo annotation change' }).click();
  await select(page, 'phrase.');
  await page.keyboard.press('Delete');
  await expect(page.locator('.annotation-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo annotation change' }).click();
  await select(page, 'phrase.');
  await annotate(page, 'Comment', 'Keep this independent note.');
  await page.locator('.paper .mark-overlap').first().click();
  const chooser = page.getByRole('dialog', { name: 'Overlapping annotations' });
  await expect(chooser.locator('.overlap-entry')).toHaveCount(2);
  await chooser
    .locator('.overlap-entry')
    .filter({ hasText: 'Keep' })
    .filter({ hasNotText: 'Comment' })
    .getByRole('button', { name: /^Remove annotation/ })
    .click();
  await expect(page.locator('.annotation-card')).toHaveCount(1);
  await expect(page.locator('.annotation-card')).toContainText('Keep this independent note.');
  await page.locator('.paper .mark-comment').first().focus();
  await page.evaluate(() => {
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Delete', isComposing: true, bubbles: true }),
    );
  });
  await expect(page.locator('.annotation-card')).toHaveCount(1);
  expect((await page.locator('.paper [data-leaf]').allTextContents()).join('')).toBe(
    original.join(''),
  );
});

test('bundled PDF figures show every page, retain source anchors, and reopen with nested headings', async ({
  page,
}, info) => {
  const main = await readFile('samples/pdf-figures/main.tex');
  const pdf = await readFile('samples/pdf-figures/figures/two-pages.pdf');
  const zip = zipSync({ 'paper/main.tex': main, 'paper/figures/two-pages.pdf': pdf });
  await page.goto('/');
  await page
    .getByLabel('Import document or project')
    .setInputFiles({ name: 'figures.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) });
  await settleImport(page);
  const image = page.locator('.paper img.pdf-figure');
  await expect(image).toBeVisible();
  const pixels = await image.evaluate((el: HTMLImageElement) => {
    const c = document.createElement('canvas');
    c.width = el.naturalWidth;
    c.height = el.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(el, 0, 0);
    return {
      first: [...ctx.getImageData(100, 150, 1, 1).data],
      second: [...ctx.getImageData(100, 442, 1, 1).data],
    };
  });
  expect(pixels).toEqual({ first: [255, 0, 0, 255], second: [0, 0, 255, 255] });
  await expect(page.locator('.paper')).not.toContainText('Unsupported command');
  await expect(page.locator('.outline-children .outline-children')).toContainText('1.1.1');
  await page.locator('.outline-links button').filter({ hasText: 'Details' }).click();
  await expect(page.locator('.paper h4')).toBeInViewport();
  await page.evaluate(() => {
    const leaf = document
      .querySelector('.paper img.pdf-figure')!
      .closest<HTMLElement>('[data-leaf]')!;
    leaf.scrollIntoView({ block: 'center' });
    const r = document.createRange();
    r.selectNodeContents(leaf);
    const s = getSelection()!;
    s.removeAllRanges();
    s.addRange(r);
    leaf.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await annotate(page, 'Comment', 'Review the complete figure.');
  await downloadProject(page, info.outputPath('figures.nitpick'));
  const saved = JSON.parse(await readFile(info.outputPath('figures.nitpick'), 'utf8'));
  expect(saved.doc.assets['paper/figures/two-pages.pdf']).toMatch(/^data:image\/png;base64,/);
  const anchor = saved.annotations[0].anchor;
  expect(
    saved.doc.files[anchor.source[0].file].slice(anchor.source[0].start, anchor.source[0].end),
  ).toBe('\\includegraphics[width=\\textwidth]{two-pages.pdf}');
  const context = await page.context().browser()!.newContext();
  const fresh = await context.newPage();
  await fresh.goto('/');
  await fresh
    .getByLabel('Import document or project')
    .setInputFiles(info.outputPath('figures.nitpick'));
  await settleImport(fresh);
  await expect(fresh.locator('.paper img.pdf-figure')).toBeVisible();
  await expect(fresh.locator('.outline-children .outline-children')).toContainText('Details');
  await expect(fresh.locator('.annotation-card')).toContainText('Review the complete figure.');
  await context.close();
});
