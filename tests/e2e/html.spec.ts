import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const sample = 'samples/html/essay.html';
async function settle(page: Page) {
  await expect(page.locator('.loading-toast')).toBeHidden();
  const setup = page.getByRole('dialog', { name: 'Save project file' });
  if (await setup.isVisible())
    await setup.getByRole('button', { name: 'Continue in browser', exact: true }).click();
}
async function selectSecond(page: Page) {
  await page.evaluate(() => {
    const block = [...document.querySelectorAll<HTMLElement>('.paper-block')].find((e) =>
      e.textContent!.includes('second occurrence'),
    )!;
    const leaves = [...block.querySelectorAll<HTMLElement>('[data-leaf]')],
      start = Number(leaves[0].dataset.start),
      end = start + 16;
    const last = leaves.find((e) => Number(e.dataset.end) >= end)!;
    const range = document.createRange();
    range.setStart(leaves[0].firstChild!, 0);
    range.setEnd(last.firstChild!, end - Number(last.dataset.start));
    (document.activeElement as HTMLElement)?.blur();
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    block.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
}
test('HTML import, precise annotations, refresh, portable fresh-context reopening and exports', async ({
  page,
  browser,
}) => {
  await page.goto('/');
  await page.getByLabel('Import document or project').setInputFiles(sample);
  await settle(page);
  await expect(page.locator('.paper-html')).toContainText('中文文本');
  await expect(page.getByRole('navigation', { name: 'Document outline' })).toContainText('Details');
  expect(
    await page
      .locator('.paper-html .image img')
      .evaluate((img: HTMLImageElement) => img.src.startsWith('data:image/png;')),
  ).toBe(true);
  await selectSecond(page);
  await page.getByRole('button', { name: 'Comment selection', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Annotation note', exact: true })
    .fill('Check the second occurrence. 中文备注。');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(
    page.locator('.annotation-card').filter({ hasText: 'Check the second occurrence' }),
  ).toContainText('Paragraph 2');
  await page.reload();
  await settle(page);
  await expect(
    page.locator('.annotation-card').filter({ hasText: 'Check the second occurrence' }),
  ).toBeVisible();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save options', exact: true }).click();
  await page.getByRole('button', { name: 'Download a copy', exact: true }).click();
  const path = await (await dl).path();
  const saved = JSON.parse(await readFile(path!, 'utf8'));
  expect(saved.version).toBe(3);
  expect(saved.doc.format).toBe('html');
  expect(saved.doc.original.data).toBe((await readFile(sample)).toString('base64'));
  const local = saved.annotations.find((a: any) => a.note.includes('Check the second occurrence'));
  expect(local.anchor.quote).toBe('Repeated phrase.');
  expect(local.anchor.start).toBe(
    saved.doc.text.indexOf('Repeated phrase.', saved.doc.text.indexOf('Repeated phrase.') + 1),
  );
  const fresh = await browser.newContext();
  const reopened = await fresh.newPage();
  await reopened.goto('/');
  await reopened
    .getByLabel('Import document or project')
    .setInputFiles({
      name: 'html-review.nitpick',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(saved)),
    });
  await settle(reopened);
  await expect(reopened.locator('.paper-html')).toContainText('中文文本');
  await expect(
    reopened.locator('.annotation-card').filter({ hasText: 'Check the second occurrence' }),
  ).toBeVisible();
  await reopened.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(reopened.getByLabel('Export preview', { exact: true })).toContainText(
    '"Repeated phrase." in paragraph 2',
  );
  await reopened.getByRole('button', { name: 'For people', exact: true }).click();
  await reopened.getByRole('button', { name: 'Marked-up text', exact: true }).click();
  await expect(reopened.getByTitle('Printable export preview')).toBeVisible();
  const exported = reopened.waitForEvent('download');
  await reopened.getByRole('button', { name: 'Download', exact: true }).click();
  expect((await exported).suggestedFilename()).toMatch(/\.html$/);
  await fresh.close();
});
test('HTML import cannot execute scripts or request linked resources; failed imports preserve existing work', async ({
  page,
}) => {
  const outbound: string[] = [];
  page.on('request', (r) => {
    if (r.url().startsWith('https://example.invalid/')) outbound.push(r.url());
  });
  await page.goto('/');
  const source =
    '<h1>Safe content</h1><p>Annotate this document.</p><script>window.__htmlExecuted=true</script><img src="https://example.invalid/pixel" onerror="window.__htmlExecuted=true" alt="Remote figure"><style>@import url(https://example.invalid/style);</style><iframe src="https://example.invalid/frame"></iframe>';
  await page
    .getByLabel('Import document or project')
    .setInputFiles({ name: 'safety.HTM', mimeType: 'text/html', buffer: Buffer.from(source) });
  await settle(page);
  expect(await page.evaluate(() => (window as any).__htmlExecuted)).toBeUndefined();
  expect(outbound).toEqual([]);
  await expect(page.locator('.paper-html')).toContainText('[Image unavailable: Remote figure]');
  await page
    .getByLabel('Import document or project')
    .setInputFiles({
      name: 'empty.html',
      mimeType: 'text/html',
      buffer: Buffer.from('<script>bad()</script>'),
    });
  await expect(page.getByRole('alert')).toContainText('no readable text');
  await expect(page.locator('.paper-html')).toContainText('Annotate this document.');
});
