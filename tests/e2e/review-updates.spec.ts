import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { wordCount } from '../../src/core/review';
const source =
  '# Workflow\n\n## Background\n\nOne two three four five six. Keep the original text.\n\n' +
  'A long quote should not hide the editor actions. '.repeat(80) +
  '\n\n## Conclusion\n\nEnd directly.';
async function open(page: Page) {
  await page.goto('/');
  await page
    .getByLabel('Import document or project')
    .setInputFiles({ name: 'workflow.md', mimeType: 'text/markdown', buffer: Buffer.from(source) });
  await expect(page.getByRole('dialog', { name: 'Save project file' })).toBeVisible();
}
async function select(page: Page, text: string) {
  await page.evaluate((text) => {
    const el = [...document.querySelectorAll<HTMLElement>('.paper [data-leaf]')].find((el) =>
      el.textContent!.includes(text),
    )!;
    const start = el.textContent!.indexOf(text),
      r = document.createRange();
    r.setStart(el.firstChild!, start);
    r.setEnd(el.firstChild!, start + text.length);
    (document.activeElement as HTMLElement)?.blur();
    const s = getSelection()!;
    s.removeAllRanges();
    s.addRange(r);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  }, text);
}
test('first-file binding, autosave, blank cleanup, global scope, word counts, unsure Move and Save As', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = { writes: [] as any[], pickers: 0 };
    (window as any).__saveTest = state;
    (window as any).showSaveFilePicker = async () => {
      const name = ++state.pickers === 1 ? 'review.nitpick' : 'review-copy.nitpick';
      return {
        name,
        queryPermission: async () => 'granted',
        requestPermission: async () => 'granted',
        createWritable: async () => {
          let text = '';
          return {
            write: async (s: string) => {
              text = s;
            },
            close: async () => {
              state.writes.push(JSON.parse(text));
            },
          };
        },
      };
    };
  });
  await open(page);
  await page.getByRole('button', { name: 'Choose project file', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Save project file' })).toBeHidden();
  await expect(page.locator('.annotation-card')).toHaveCount(2);
  await select(page, 'One two three four five six');
  await expect(page.getByLabel('Selected word count')).toHaveText('6 words');
  await page.getByRole('button', { name: 'Comment selection', exact: true }).click();
  await page.getByRole('button', { name: 'Close annotation editor', exact: true }).click();
  await expect(page.locator('.annotation-card')).toHaveCount(2);
  await select(page, 'One two three');
  await expect(page.getByLabel('Selected word count')).toHaveCount(0);
  await page.getByRole('button', { name: 'Comment selection', exact: true }).click();
  await page.getByLabel('Annotation note').fill('Use plain language throughout.');
  await page.getByLabel('Annotation scope').selectOption('document');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__saveTest.writes
            .at(-1)
            ?.annotations.filter((a: any) => a.scope === 'document').length,
      ),
    )
    .toBe(3);
  expect(await page.evaluate(() => (window as any).__saveTest.pickers)).toBe(1);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const preview = await page.getByLabel('Export preview').textContent();
  await expect(page.getByLabel('AI prompt word count')).toHaveText(
    `${wordCount(preview!).toLocaleString()} words`,
  );
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await select(page, 'four five six');
  await page.getByRole('button', { name: 'Move selection', exact: true }).click();
  await expect(page.getByLabel('Move destination')).toHaveValue('unsure');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.destination-info')).toContainText('Destination undecided');
  await expect(page.locator('.outline-links [aria-label="1 annotation"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Save as…', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__saveTest.pickers)).toBe(2);
  await expect
    .poll(() => page.evaluate(() => (window as any).__saveTest.writes.at(-1)?.projectFileName))
    .toBe('review-copy.nitpick');
  expect(await page.locator('.paper [title*="characters"]').count()).toBe(0);
  await page.setViewportSize({ width: 834, height: 500 });
  await select(page, 'A long quote should not hide the editor actions. '.repeat(80).trim());
  await page.getByRole('button', { name: 'Comment selection', exact: true }).click();
  const box = await page.getByRole('button', { name: 'Done', exact: true }).boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(500);
  await page.getByRole('button', { name: 'Close annotation editor', exact: true }).click();
});
test('removing a recent document can be undone and keeps the document', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Continue in browser', exact: true }).click();
  await page.getByRole('button', { name: 'Nitpick home', exact: true }).click();
  const remove = page.getByRole('button', {
    name: 'Remove workflow from recent documents',
    exact: true,
  });
  await remove.click();
  await expect(remove).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Removed “workflow”');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(remove).toBeVisible();
  await page.locator('.recent-item').click();
  // Reopening a document kept in the browser does not ask for a file again.
  await expect(page.getByRole('dialog', { name: 'Save project file' })).toHaveCount(0);
  await expect(page.locator('.paper')).toContainText('Keep the original text.');
  await expect(page.locator('.annotation-card')).toHaveCount(2);
});
