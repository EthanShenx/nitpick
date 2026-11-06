import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const text =
  '# Reading controls\n\n## Background\n\nRepeated **phrase**. The first occurrence stays here.\n\nRepeated phrase. The second occurrence stays here.\n\n中文文本。\n\n' +
  Array.from(
    { length: 25 },
    (_, i) =>
      `Paragraph ${i + 1} keeps its original wording and position in the immutable document.`,
  ).join('\n\n') +
  '\n\n## Conclusion\n\nNeedle near the end.\n\nrepeated phrase. A final occurrence.';
async function open(page: Page) {
  await page.goto('/');
  await page.getByLabel('Import document or project').setInputFiles({
    name: 'reading-controls.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(text),
  });
  await expect(page.getByRole('dialog', { name: 'Save project file' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue in browser', exact: true }).click();
  page.on('dialog', (dialog) => dialog.accept());
}
async function aligned(page: Page) {
  const measured = await page.evaluate(() => {
    const container = document.querySelector('.reading-area')!.getBoundingClientRect();
    const hits = [...document.querySelectorAll('.search-match-current')].map((e) =>
      e.getBoundingClientRect(),
    );
    const nodes = [...document.querySelectorAll<HTMLElement>('.paper [data-leaf]')].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.bottom > container.top && r.top < container.bottom;
    });
    return (
      hits.length > 0 &&
      hits.every((hit) =>
        nodes.some((node) => {
          const r = node.getBoundingClientRect();
          return (
            hit.left >= r.left - 1 &&
            hit.right <= r.right + 1 &&
            hit.top >= r.top - 1 &&
            hit.bottom <= r.bottom + 1
          );
        }),
      )
    );
  });
  expect(measured).toBe(true);
}
test('search follows exact words across formatting, navigation, zoom and pointer resizing; view settings survive reopening', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: 'Search document', exact: true }).click();
  const input = page.getByRole('searchbox', { name: 'Find words or sentences' });
  await input.fill('Repeated phrase.');
  const status = page.getByRole('search').getByRole('status');
  await expect(status).toHaveText('1 of 3');
  await expect(page.locator('.search-match-current').first()).toBeVisible();
  await aligned(page);
  await input.press('Enter');
  await expect(status).toHaveText('2 of 3');
  await input.press('Shift+Enter');
  await expect(status).toHaveText('1 of 3');
  await page.getByRole('button', { name: 'Match case', exact: true }).click();
  await expect(status).toHaveText('1 of 2');
  await input.fill('中文文本。');
  await expect(status).toHaveText('1 of 1');
  await input.evaluate((e) => {
    e.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    e.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, isComposing: true }),
    );
    e.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
  });
  await expect(input).toBeVisible();
  await input.fill('Needle near the end.');
  await expect(status).toHaveText('1 of 1');
  await expect
    .poll(() => page.locator('.reading-area').evaluate((e) => e.scrollTop))
    .toBeGreaterThan(500);
  await page.getByRole('combobox', { name: 'Document zoom', exact: true }).selectOption('150');
  await expect(page.locator('.document-content')).toHaveCSS('zoom', '1.5');
  await aligned(page);
  const left = page.getByRole('separator', { name: 'Resize document outline' }),
    right = page.getByRole('separator', { name: 'Resize annotations sidebar' });
  const beforeLeft = Number(await left.getAttribute('aria-valuenow'));
  const l = (await left.boundingBox())!;
  await page.mouse.move(l.x + l.width / 2, l.y + 90);
  await page.mouse.down();
  await page.mouse.move(l.x + l.width / 2 + 64, l.y + 90, { steps: 6 });
  await page.mouse.up();
  await expect(left).toHaveAttribute('aria-valuenow', String(beforeLeft + 64));
  const beforeRight = Number(await right.getAttribute('aria-valuenow'));
  const r = (await right.boundingBox())!;
  await page.mouse.move(r.x + r.width / 2, r.y + 90);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2 - 48, r.y + 90, { steps: 6 });
  await page.mouse.up();
  await expect(right).toHaveAttribute('aria-valuenow', String(beforeRight + 48));
  await input.fill('not present anywhere');
  await expect(status).toHaveText('No matches');
  await expect(page.getByRole('button', { name: 'Next search result' })).toBeDisabled();
  await input.press('Escape');
  await expect(input).toBeHidden();
  await page.keyboard.press('ControlOrMeta+f');
  await expect(input).toBeFocused();
  await input.press('Escape');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save options', exact: true }).click();
  await page.getByRole('button', { name: 'Download a copy', exact: true }).click();
  const path = await (await download).path();
  const saved = JSON.parse(await readFile(path!, 'utf8'));
  expect(saved.readerZoom).toBe(150);
  expect(saved.columnWidths).toEqual({ outline: beforeLeft + 64, annotations: beforeRight + 48 });
  expect(saved.doc.files[saved.doc.main]).toBe(text);
  expect(saved.annotations.every((a: any) => a.scope === 'document')).toBe(true);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Document zoom' })).toHaveValue('150');
  await expect(page.getByRole('separator', { name: 'Resize document outline' })).toHaveAttribute(
    'aria-valuenow',
    String(beforeLeft + 64),
  );
});
test('keyboard resizing and tablet search keep controls usable without overflowing the window', async ({
  page,
}) => {
  await open(page);
  const divider = page.getByRole('separator', { name: 'Resize document outline' });
  await divider.focus();
  await divider.press('ArrowRight');
  await expect(divider).toHaveAttribute('aria-valuenow', '256');
  await divider.press('Home');
  await expect(divider).toHaveAttribute('aria-valuenow', '150');
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(divider).toBeHidden();
  await expect(page.getByRole('separator', { name: 'Resize annotations sidebar' })).toBeVisible();
  await page.getByRole('button', { name: 'Search document', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find words or sentences' }).fill('Repeated phrase.');
  await expect(page.getByRole('search').getByRole('status')).toHaveText('1 of 3');
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page.getByRole('button', { name: 'Search document', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Document zoom' })).toBeInViewport();
    await expect(
      page.getByRole('button', { name: 'Search document', exact: true }),
    ).toBeInViewport();
  }
});
