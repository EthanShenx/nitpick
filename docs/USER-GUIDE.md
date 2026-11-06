# Nitpick

A private reading and revision workspace built with TypeScript, React, and Vite. Import an essay, mark it up in a locked reading copy, and export instructions for a person or an AI. Nitpick never edits the imported source and never calls an AI or uploads a document.

## Run locally

Node **22.18+** is required by the pinned Vite release.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/**. To build static files:

```sh
npm run build
```

Serve `dist/` with any static HTTP server. There is no application server, API, database service, account system, analytics, CDN font dependency, or AI integration. A static host only delivers the application assets. Document processing and persistence happen on the device. Use a consistent origin: browser storage belongs to that scheme, hostname, and port. File System Access and clipboard features require HTTPS or localhost.

## Use

- Open `.html` / `.htm`, `.md`, `.docx`, `.tex`, `.zip` (LaTeX project), `.pdf`, or `.nitpick`. Use **Open LaTeX folder** for projects with multiple files; the browser reads only the folder you choose. Opening a dependent `main.tex` alone prompts for its containing folder or a ZIP before replacing your current work. A folder or ZIP with multiple possible roots asks you to select the main file.
- Select text with the mouse or focus the document using Tab and extend a selection with **Shift + arrow keys**. Use the floating toolbar’s icon-and-word actions or **D, R, I, M, C, K, V** for Delete, Replace, Insert, Move, Comment, Keep, Verify.
- Delete, Keep, and Verify add an annotation immediately. Replace, Insert, Comment, and Move open an inline editor. A selection of more than three Unicode words shows its word count before Delete. Everything typed into that editor is autosaved, even before **Done**; the open editor restores on refresh. Move offers **Not sure where yet**, **Choose text in the document**, or retaining an existing destination. An uncertain destination exports as an explicit question for review. Empty Comment/Replace/Insert drafts are discarded when closed; typed unfinished notes survive. The editor body scrolls while its header and Done button remain visible.
- Use the margin controls for paragraph and section annotations. The **Whole document** sidebar tab holds notes on the essay as a whole, with an **Add note** control that needs no text selection. Every scope supports every action through the annotation editor. Change **Applies to** to promote a detail note to Whole document. Its stable ID, instruction and original anchor are preserved; a promoted note can return to its original selected text. New projects start with the two supplied writing suggestions about transitions/rhetorical contrasts and prose punctuation. Existing projects receive them once, without replacing custom notes; deleting a default keeps it deleted.
- Sidebar cards show their complete quote, with an expand control for long quotes. Click a location to jump to the text; click highlighted text to find its card. A single filter (size, type, or scope) applies to both cards and highlights. Overlapping annotations are retained independently. Shared text has a double underline: click it (or focus it and press Enter/Space) to choose any of its notes. Cards also link to other notes on the same range. Click a highlight to use **Remove highlight**, or focus/select it and press **Delete** or **Backspace**; this removes its annotation while preserving the document text. With shared text, choose the individual note to remove. Removal autosaves and supports Undo/Redo. The editor warns when a new selection overlaps existing notes; touching boundaries do not count as overlaps.
- **Ctrl/Cmd + Z**, **Ctrl/Cmd + Shift + Z** (or Ctrl/Cmd + Y) undo and redo annotation changes. Text fields retain their normal text undo. Undo history lasts for the current session; all annotations themselves persist.
- Saved notes are reusable instructions shown as chips in the annotation editor. Add the current note with the bookmark button; remove one with its ×. They travel with the project.
- The first document opening asks you to choose a **.nitpick project file**. In Chrome/Edge with File System Access, later changes autosave to that same file, including unfinished notes, filters, settings and reading position. File writes are debounced over 350 ms and serialized. **Save As**, **Ctrl/Cmd + S**, and **Ctrl/Cmd + Shift + S** choose a new destination. **Download a copy** always downloads. Other browsers retain IndexedDB autosave and offer manual downloads; they cannot silently update an existing local file. If file permission expires, reconnect it with the explicit setup button.
- Recent documents show the available source filename or relative folder path. **View location** shows that location and the chosen project filename. Web browsers do not reveal full absolute filesystem paths. Removing a recent document moves its browser copy into **Recently removed**, where it can be restored; original documents and project files on disk are untouched.
- The TOC shows revision counts for each section, including child sections and cross-section notes. Whole-document suggestions are excluded from section counts. Counts describe all revision points, independently of the active reader filter.

All shortcuts are suppressed during IME composition. Unicode text, including Chinese, is preserved. A math expression, macro expansion, image, footnote, citation, or unsupported LaTeX construct is an atomic source-backed selection unit. Ordinary prose can be selected across any number of paragraphs.

## Search, zoom, and column widths

Use the **Search document** magnifying glass in the upper-right header or **Ctrl/Cmd + F** to find a word or a sentence. Matches are highlighted in the reading copy, with a count, previous/next buttons, optional case sensitivity, **Enter** / **Shift + Enter** navigation, and **Escape** to close. Search is literal, supports Unicode, and can match a sentence across line or paragraph breaks and inline formatting. It uses the displayed text; PDF searches use embedded text and cannot search image-only scans. Search highlights are temporary overlays, independent of revision annotations, and are excluded from exports. Search and annotation shortcuts are suppressed during IME composition.

The header’s **Document zoom** selector changes the reading copy from 50% to 200% without changing its text, annotations, exports, or the size of the app controls. PDFs retain their Fit width / 75–200% page-rendering controls in the header. Narrow reading columns scroll horizontally when necessary instead of crushing the paper’s text area.

Drag either vertical divider to resize the outline, document, and annotations columns. The center column uses the remaining space. Focus a divider with Tab and use **Left/Right** (or **Shift + Left/Right** for larger steps); **Home/End** choose its minimum/maximum width, and a double-click restores the default. Minimum sizes keep each visible column usable. On tablets the outline becomes a drawer and the annotations divider remains available; on phones both side panels are drawers.

`Project.readerZoom` (50–200) and `Project.columnWidths` (`outline`, `annotations`, in CSS pixels) are optional portable fields. They autosave locally and to a connected project file, survive refresh and reopening, and are validated before importing a project. Existing projects without these fields retain the default view. Saved widths adapt to smaller windows without overwriting the saved preference. Divider drags persist when released. These view settings do not enter annotation undo history.

## Autosave and portable projects

The IndexedDB database `nitpick` contains a `projects` object store and an optional `handles` store. Recoverable recent-document removal uses `nitpick-trash`; older stored trash entries are also recognized. Existing database revisions remain readable without resetting user work. Writes are serialized so an older snapshot cannot overwrite a newer change. The home screen lists recent documents with annotation counts and last-edited times. The active document, filters, reading position, and unfinished editor restore after refresh. Reading position writes are coalesced over 120 ms. Along with the pixel scroll, a normalized reading offset preserves the passage when opening on a different screen width; restoration waits for image/math layout changes.

The save indicator distinguishes:

- **Saved in browser** — locally stored; a portable file has not been saved yet.
- **Saved to file** — the current revision has been written to the chosen file, or handed to the browser's download manager.
- **Unsaved changes to file** — newer changes are locally autosaved but have not been written to the portable file.

A `beforeunload` handler requests the browser's normal warning while the active project differs from its last portable save. Browsers decide when to display that warning. Browser downloads may require the user to finish their normal Save dialog; the app cannot inspect the download manager or verify a downloaded file after handoff.

A `.nitpick` file is UTF-8 JSON, not a ZIP. Text-source projects use **format version 1**, PDF projects use **version 2**, and HTML projects use **version 3**. This app reads all three; older apps report a newer format when opening a project they cannot support. A version-1 example follows:

```json
{
  "format": "nitpick",
  "version": 1,
  "id": "project UUID",
  "title": "Essay title",
  "doc": {
    "name": "essay.tex",
    "format": "tex",
    "main": "paper/main.tex",
    "files": {"paper/main.tex": "original source", "paper/end.tex": "included source"},
    "assets": {"paper/diagram.png": "data:image/png;base64,..."},
    "original": {"name": "paper.zip", "encoding": "base64", "data": "original archive bytes"},
    "text": "immutable normalized text",
    "blocks": ["positioned paragraphs, headings, and source-backed runs"],
    "warnings": []
  },
  "annotations": ["actions with full anchors, notes, replacements, and optional move destinations"],
  "notes": ["reusable notes"],
  "filters": {"preset": "Everything", "type": "all", "scope": "all"},
  "exportSettings": {"audience": "ai", "layout": "list", "format": "md", "instructions": "...", "filters": {}},
  "editingId": "optional ID of the unfinished annotation editor",
  "scroll": 0,
  "readingOffset": 0,
  "updatedAt": 0,
  "revision": 0,
  "fileRevision": 0
}
```

The example abbreviates the block and annotation schemas; see `src/core/types.ts` for the exact TypeScript definitions. Word originals are retained as base64 in `doc.files[doc.main]`. LaTeX ZIP originals are also retained byte for byte in `doc.original`, including entries that are not interpreted by the renderer. Folder imports create an archive containing every selected non-hidden project file (including fonts and PDF figures); that archive is retained in the same field. Referenced image data and all text needed for rendering are included independently, so reopening does not depend on the original files or a rerun of the importer.

Anchors use **UTF-16 code-unit offsets**, matching DOM Range and JavaScript string slicing. They contain the complete displayed quote, 80 code units before and after, start/end paragraphs and sections, section heading, and zero or more `{file,start,end}` source ranges. Source ends are exclusive. Blocks are joined with exactly two line feeds in normalized text. Plain source text is mapped linearly; transformed constructs use an atomic invocation range. Included-file boundaries retain distinct source ranges. No text search is used to locate an annotation, so repeated phrases do not drift to another occurrence.

Invalid JSON, unsupported newer versions, malformed block models, inconsistent anchors, missing images, and invalid settings are rejected before replacing active work. The format is unencrypted, so treat a project like its original document. Browser storage is subject to the browser's own retention and capacity; portable files provide the cross-device copy.

## Exports

The export dialog has a live preview, Copy, and Download. For AI, the total Unicode word count of the complete prompt appears beside Preview and updates with instructions, layout, format and filters. This is a word count, not a model-token estimate. Its filters are saved separately from the reader's filters.

| Audience | List | Inline |
| --- | --- | --- |
| AI | Markdown or JSON, stable IDs, editable instructions, grouped Document → Section → Paragraph → Specific Edits | Full text with CriticMarkup; Move, Keep, Verify use explicit comments |
| People | Markdown or Word, readable section groups, no machine IDs | Standalone printable HTML with visible revisions and notes |

Everything, Small edits (selected-text Delete/Replace/Insert), and Larger changes (the complement) can be combined with type and scope filters. Export small edits inline for manual work, then larger changes as an AI list.

List exports never abbreviate a quote. They retain paragraph breaks, quote entire paragraphs for paragraph notes and complete selected sections for section notes, state paragraph ranges, and give Move destinations with adjacent text. AI selected-text items include a complete containing sentence; whole-sentence selections include neighboring sentences. LaTeX AI exports quote original source; people exports quote displayed text.

Overlapping inline edits are grouped over their complete shared passage and expressed as explicit labeled review comments rather than conflicting nested replacement syntax. Nested and partially overlapping quotes and instructions are all retained; list and JSON exports identify related notes. Repeated LaTeX inputs that refer to overlapping source ranges are also flagged for joint review. The original text remains present once. Cross-file LaTeX edits use labeled comments alongside intact source files. List and JSON exports preserve all overlapping instructions independently. Unfinished replacements, comments, and moves are labeled; an incomplete request is never guessed.

## HTML import

Open an `.html` or `.htm` file using **Open document** or drag it into the home screen. HTML documents and fragments are parsed with **parse5 8.1.0** (MIT), loaded on demand. The importer produces the same immutable, selectable document model as other text formats. It retains headings and their nesting, paragraphs, line breaks, emphasis, strong text, code, ordered and unordered lists, tables, captions, and embedded raster images. `<del>`/`<s>` and `<ins>` retain their strike-through and underline styling. UTF-8, UTF BOMs, and browser-supported legacy encodings declared in an HTML meta charset are decoded before parsing.

Imported markup is parsed as data and is never mounted in the page. Scripts, event handlers, links, refresh directives, original styles and interactive behavior do not execute. Hidden elements and document metadata are omitted from the reading copy. Original CSS layout is not reproduced. Form controls, media, SVG and MathML receive selectable labeled placeholders. Merged table cells are flattened to a grid with a notice. Relative and remote images are never fetched; they receive labeled placeholders. Embed PNG, JPEG, GIF, WebP or AVIF images as base64 data URLs to make them portable. CSS-generated content and content requiring JavaScript cannot be recovered from a saved static HTML file.

HTML projects retain the decoded original source in `doc.files` and the exact original file bytes in `doc.original`, plus the normalized reading copy, embedded images, every annotation, saved notes and settings. They reopen without the HTML file. Anchors use normalized offsets, complete quotes and adjacent text, so repeated phrases remain distinct. Unchanged text also retains source ranges where available; decoded entities use display offsets. List/JSON, CriticMarkup, Word and printable HTML exports work with the displayed text and its section/paragraph locations. Importing a previously exported revision HTML does not reconstruct its original Nitpick annotations; use `.nitpick` to continue editing those notes.

A sample is included at `samples/html/essay.html`. `tests/html.test.ts` checks parsing, safe rendering, Unicode and legacy encodings, exact occurrence anchors, long cross-section quotes, portable/IndexedDB round trips, all annotation types, scopes and export modes. `tests/e2e/html.spec.ts` covers import, annotation, refresh, portable save and fresh-context reopening, exports, blocked external resources, and safe handling of a failed import.

## LaTeX spike and support

A ready-to-reopen unfinished portable example is included at `samples/unfinished-latex.nitpick`, with original ZIP, image, source files, math review, and an open replacement editor. Run `npm run samples` to regenerate all fixtures.

Run `npm run spike`. The fixture is `samples/latex/main.tex` with an included file and SVG image. The machine-readable result is `samples/latex/spike-result.json`; the assessment is in [LATEX-SPIKE.md](../LATEX-SPIKE.md).

The essay renderer uses **unified-latex 1.8.4** AST positions and **KaTeX 0.19.1**, directly to selectable HTML. Bundled PDF figures use **PDF.js 6.5.438** for local previews. Separate PDF document imports retain their original page layout, with selectable text and area annotations. PDF import and native PDF export are experimental; the LaTeX reading view continues to render directly to HTML. Supported reading-copy features include:

- Titles, sections, subsections, subsubsections and paragraph headings, basic emphasis and bold/code spans. The outline is nested and numbered hierarchically (for example 2 → 2.1 → 2.1.1), and the reading copy uses matching semantic heading levels. Exported section labels match the outline; stored ordinal section anchors remain stable. A parent-section note includes its child headings and paragraphs.
- Inline and display math, including common math environments supported by unified-latex/KaTeX.
- Common biblatex/natbib citations (`cite`, `parencite`, `textcite`, `autocite`, `citep`, `citet`, including optional notes) use author/year data from bundled `.bib` files. `printbibliography` displays cited entries in a simplified author–year reference list; each reference maps to its complete `.bib` entry. Missing entries remain labeled with their keys. Full footnote text is retained as an atomic inline unit.
- Itemize/enumerate/description item contents, tabular and longtable rows/columns, `multicolumn` text, figure captions including `captionof`, minipages, and bundled browser-readable images resolved through `graphicspath`. Longtable page headers/footers remain visible as rows, with an import notice. Column spans and custom column specifications are simplified.
- Cover pages (`titlepage`), `textsc`, simple font-family switches, and common layout commands. Font options, running heads/feet, spacing (including `linespread`/`setstretch`), font selection (`selectfont`) and row-colour commands are recognized without leaking their arguments into the reading copy. Cover metadata remains ordinary text. TeX dashes, paired quotes and nonbreaking spaces render as atomic source-backed substitutions.
- Figure/table label references resolve to their caption numbers. Referenced PDF figures in ZIP/folder imports are rendered entirely in the browser, with every page retained in a single preview, up to 24 pages and bounded canvas dimensions. Previews are saved in `doc.assets` under the original PDF path; the original PDF bytes remain in the archive. The entire figure is one selectable unit mapped to its `includegraphics` invocation. Invalid, encrypted, missing, or oversized figures retain labeled placeholders and full captions. CMaps, fonts, colour profiles and worker/decoder assets are bundled locally; no CDN or document upload is used.
- Simple `newcommand`/`renewcommand`/`providecommand` expansions with required braced arguments. Expanded macros map to the invocation, not their definitions.
- Relative `input` and `include` resolution, nested files, missing-file notices and circular-input placeholders.

**This is a conservative paper-style reading view, not a TeX engine.** It does not reproduce page breaks, floats, document-class styling, bibliography styles, automatic citation numbering, complex tabular layouts, arbitrary package behavior, general counter logic, conditionals, optional/default macro arguments, or general TeX expansion. Unknown commands/environments (including TikZ), missing inputs, unsupported images, and unsupported math remain visibly labeled and selectable. Their original source stays in the project. TeX is never executed and external image/document URLs are never fetched.

Markdown uses CommonMark. Remote/referenced Markdown images and raw HTML appear as source-backed placeholders. Decoded entities and escapes map independently to their source tokens. Rare normalized code/text fragments without a reliable direct mapping retain display anchors and an import notice; their original Markdown source is still included. Word is converted with Mammoth: content and common semantic formatting are retained, but pagination, fonts, tracked changes and some formatting may differ. Import notices explain those differences.

Files are limited to 50 MB and expanded ZIP contents to 100 MB. ZIP entries containing `..` and macOS metadata are ignored for interpretation; the full original ZIP is still preserved.

## Validation

```sh
npm run spike
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

If a dev server is already running and the test environment cannot probe or start one, use `NITPICK_EXTERNAL_SERVER=1 npm run test:e2e`. To use an installed Chromium executable, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its absolute path. Tests use isolated temporary browser contexts and only synthetic fixture documents.

To check another multi-file LaTeX project locally without changing its files:

```sh
node --import tsx scripts/check-latex-project.ts /path/to/latex-project /optional/output-folder
```

This verifies source ranges and portable round-trip fidelity. An output folder also receives the complete ZIP, `.nitpick` project, and a JSON report. The synthetic `samples/latex-compatibility/` fixture covers the academic-project conventions above.

Unit tests cover repeated-occurrence and multi-paragraph anchors, Unicode sentence context, LaTeX source positions near math/macros and inside included files, list content retention, atomic placeholders, project validation and round trips, IndexedDB, repeated writes to a file handle, denied/failed saves, every export action/scope/filter/audience/layout, and real Word archive generation. Playwright specifications cover import → annotate → autosave → save → fresh-context reopen → continue → export, all actions/scopes, keyboard and IME suppression, unfinished editor recovery, Word/LaTeX imports, ambiguous main files, long quotes, and responsive layouts.

**Verification:** unit tests and the production build run locally. See [the verification record](../VERIFICATION.md) for current checks and limits. Browser specifications are included; run them in an environment that permits Chromium to launch.

## Dependencies and licenses

Versions are pinned in `package.json` and `package-lock.json`. Direct runtime dependencies use MIT, ISC, BSD-2-Clause, or Apache-2.0 licenses, compatible with private or permissively licensed distribution when their notices are preserved. Review [DEPENDENCIES.md](../DEPENDENCIES.md) for package purposes and maintenance evidence. Bundled notices are available in `public/THIRD-PARTY-NOTICES.txt` (also copied to `dist/`). Regenerate with `node scripts/license-notices.mjs` after dependency changes. The project itself has not been assigned a distribution license.

After changing importer support, reopen the original folder/ZIP to create a new reading copy. Existing annotated projects retain their normalized text and anchors; they are never silently reparsed. Older saved headings can recover their hierarchy from retained LaTeX source. The synthetic `samples/pdf-figures/` project covers PDF figures and all three section levels; regenerate its two-page vector PDF with `node --import tsx scripts/create-pdf-figure-sample.ts`.

The current optional version-1 fields include `Project.sourcePath`, `projectFileName`, and `defaultSuggestionsVersion`, plus `Annotation.localAnchor` for promoted notes and `destinationUncertain` for unresolved Moves. Native file handles stay in browser storage and are never serialized into portable files.

## Logo assets

The user-supplied logo sources live at `public/nitpick-mark.svg` and `public/word_logo.pdf`. The word logo is displayed using the vector conversion `public/word-logo.svg`, so loading the app does not require PDF.js. Both source assets were synchronized from the supplied `dist/` edits. Future asset updates should target `public/`: `dist/` is generated and replaced by builds. To regenerate the wordmark after editing its PDF, run `pdftocairo -svg public/word_logo.pdf public/word-logo.svg` (Poppler is needed only for this asset conversion).
