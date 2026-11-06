# Verification

## Automated checks

The local suite currently contains 71 passing unit tests across ten files. TypeScript checks and the production build pass. Coverage includes document imports, exact and overlapping anchors, Unicode and source mapping, portable project validation, IndexedDB and file-handle save behavior, exports, search, and column sizing.

The LaTeX source-mapping spike and synthetic fixtures are reproducible with `npm run spike` and the scripts in `scripts/`.

## Browser checks

The Playwright specifications in `tests/e2e/` cover import, annotate, save, reopen, export, search, zoom, and responsive layout. The dedicated `npm run screenshots:readme` script imports the actual Romeo and Juliet Word example, creates notes through the app, and captures the reading, search, and export views. The documentation workflow runs in an isolated Linux browser and publishes review artifacts.

Local Chromium execution has been restricted by the macOS command sandbox. Earlier browser checks verified core Markdown, Word, and LaTeX reading and annotation flows; this does not establish that every current end-to-end specification passes. Consult the workflow run for the checks actually executed.

## Remaining limits

- Native file-dialog completion and writable-file reuse have not been fully verified across real browsers. File-handle success, failure, and permission behavior are covered by unit tests.
- PDF import and annotated-PDF export are experimental. Their text, coordinates, rotation, crop, and portable data paths have unit coverage; a broad real-world PDF compatibility review remains outstanding.
- Complex document layout is intentionally simplified for text formats. See the user guide for format-specific limits.

Run the full browser suite with:

```sh
npx playwright install chromium
npm run test:e2e
```
