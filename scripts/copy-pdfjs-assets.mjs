import { cpSync, mkdirSync } from 'node:fs';
for (const name of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  mkdirSync('public/pdfjs', { recursive: true });
  cpSync(`node_modules/pdfjs-dist/${name}`, `public/pdfjs/${name}`, { recursive: true });
}
