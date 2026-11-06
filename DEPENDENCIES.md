# Dependency review

Reviewed 2026-11-02 against current npm metadata, installed package licenses, and the projects' primary documentation/repositories. Installed releases are pinned; the install audit reported zero known vulnerabilities. This records the build-time review and is not a promise about future releases.

| Runtime dependency | Pinned version | License | Purpose / primary source |
| --- | --- | --- | --- |
| React / React DOM | 19.3.1 | MIT | Maintained UI runtime — https://github.com/facebook/react |
| unified-latex util-parse | 1.8.4 | MIT | LaTeX AST with original positions — https://github.com/siefkenj/unified-latex |
| KaTeX | 0.19.1 | MIT | Browser math rendering — https://katex.org/docs/browser |
| Mammoth | 1.13.0 | BSD-2-Clause | Browser-side Word conversion — https://github.com/mwilliamson/mammoth.js |
| mdast-util-from-markdown | 2.1.0 | MIT | CommonMark AST/source positions — https://github.com/syntax-tree/mdast-util-from-markdown |
| micromark-util-decode-string | 2.0.1 | MIT | Entity and escape decoding with per-token mapping — https://github.com/micromark/micromark |
| fflate | 0.8.3 | MIT | Browser ZIP extraction — https://github.com/101arrowz/fflate |
| idb | 8.0.4 | ISC | IndexedDB promise wrapper — https://github.com/jakearchibald/idb |
| docx | 9.15.1 | MIT | Word list export — https://github.com/dolanmiu/docx |
| PDF.js (`pdfjs-dist`) | 6.5.438 | Apache-2.0 | Original PDF pages, text layers, and bundled figure previews — https://mozilla.github.io/pdf.js/ |
| parse5 | 8.1.0 | MIT | Inert HTML parsing — https://github.com/inikulin/parse5 |
| @cantoo/pdf-lib | 2.11.1 | MIT | Native annotated PDF export — https://github.com/cantoo-scribe/pdf-lib |
| lucide-react | 1.66.0 | ISC | Consistent interface icons — https://github.com/lucide-icons/lucide |

Vite 8.3.5, TypeScript 7.0.2, Vitest 5.0.5, Playwright 1.64.1, and Prettier are development dependencies. The chosen libraries have maintained upstream repositories and published releases; unified-latex is a smaller specialist project, so its behavior is bounded by explicit fixtures and its exact version is pinned. KaTeX, Mammoth, and docx are loaded on demand to keep the initial reader bundle smaller.

These permissive dependency licenses suit a local, private application and allow later distribution provided attribution/notice requirements are kept. `public/THIRD-PARTY-NOTICES.txt` includes the installed package license texts, including development packages for completeness. No project distribution license has been chosen.

PDF.js was added on 2026-11-03 after checking the official stable release and Apache-2.0 license. Its worker is an on-demand Vite asset. `scripts/copy-pdfjs-assets.mjs` copies required CMaps, standard fonts, colour profiles, decoders and their notices into generated `public/pdfjs/` during install/dev/build. These assets are served by the same local/static origin. Optional Node canvas binaries are not bundled into the browser app. The install audit reports zero known vulnerabilities.

HTML and PDF export packages were added after the initial review. Their exact releases are pinned, their installed MIT license texts are included in the bundled notices, and they are loaded on demand.
