import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { GLOBAL_SUGGESTIONS } from '../src/core/review';
async function select(page: Page, phrase: string) {
  await page.evaluate((phrase) => {
    const leaves = [...document.querySelectorAll<HTMLElement>('.paper [data-leaf]')];
    const leaf = leaves.find((e) => e.textContent!.includes(phrase));
    if (!leaf) throw new Error(`Passage not found: ${phrase}`);
    const start = leaf.textContent!.indexOf(phrase),
      range = document.createRange();
    range.setStart(leaf.firstChild!, start);
    range.setEnd(leaf.firstChild!, start + phrase.length);
    (document.activeElement as HTMLElement)?.blur();
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    leaf.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  }, phrase);
}
async function comment(page: Page, phrase: string, note: string) {
  await select(page, phrase);
  await page.getByRole('button', { name: 'Comment selection', exact: true }).click();
  await page.getByRole('textbox', { name: 'Annotation note', exact: true }).fill(note);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
}
test('capture real Word import, annotation, search, and export screens', async ({ page }) => {
  await mkdir('docs/screenshots', { recursive: true });
  await page.goto('/');
  await page
    .getByLabel('Import document or project')
    .setInputFiles('samples/Romeo and Juliet.docx');
  await page.getByRole('button', { name: 'Continue in browser', exact: true }).click();
  await expect(page.locator('.paper-docx')).toContainText('Two households, both alike in dignity,');
  for (const note of GLOBAL_SUGGESTIONS) {
    const card = page.locator('.annotation-card').filter({ hasText: note });
    await card.getByRole('button', { name: /Remove annotation/ }).click();
  }
  await select(page, 'Two households, both alike in dignity,');
  await page.getByRole('button', { name: 'Keep selection', exact: true }).click();
  await comment(
    page,
    'Where civil blood makes civil hands unclean.',
    'Explain the repetition of “civil” in a note; preserve the original line.',
  );
  await comment(
    page,
    'A pair of star-cross’d lovers take their life;',
    'Add a brief note on how fate is introduced here. Keep Shakespeare’s wording.',
  );
  await page.getByRole('button', { name: 'Whole document', exact: true }).click();
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Annotation note', exact: true })
    .fill(
      'Preserve Shakespeare’s verse, speaker labels, and dramatic structure. Put explanations in notes rather than rewriting the dialogue.',
    );
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: /^Annotations/ }).click();
  await page.locator('.reading-area').evaluate((e) => e.scrollTo({ top: 0, behavior: 'instant' }));
  await page
    .locator('.annotation-list')
    .count()
    .then(async (count) => {
      if (count)
        await page
          .locator('.annotation-list')
          .evaluate((e) => e.scrollTo({ top: 0, behavior: 'instant' }));
    });
  await expect(page.locator('.paper h1')).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/word-annotations.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Search document', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find words or sentences' }).fill('wherefore');
  await expect(page.getByRole('search').getByRole('status')).toHaveText('1 of 1');
  await expect(page.locator('.search-match-current').first()).toBeInViewport();
  await page.screenshot({ path: 'docs/screenshots/document-search.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Close document search', exact: true }).click();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Export revisions' })).toBeVisible();
  await expect(page.getByLabel('Export preview', { exact: true })).toContainText(
    'star-cross’d lovers',
  );
  await page.screenshot({ path: 'docs/screenshots/export-preview.png', animations: 'disabled' });
});
