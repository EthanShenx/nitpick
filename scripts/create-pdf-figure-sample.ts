import { writeFileSync } from 'node:fs';
const content = (rgb: string, text: string) =>
  `q 1 1 1 rg 0 0 240 140 re f ${rgb} rg 20 20 200 70 re f Q BT /F1 16 Tf 20 110 Td (${text}) Tj ET`;
const one = content('1 0 0', 'First page - red'),
  two = content('0 0 1', 'Second page - blue');
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 140] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',
  `<< /Length ${one.length} >>\nstream\n${one}\nendstream`,
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 140] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
  `<< /Length ${two.length} >>\nstream\n${two}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
];
let pdf = '%PDF-1.4\n',
  offsets = [0];
for (const [i, object] of objects.entries()) {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
}
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
  .slice(1)
  .map((n) => String(n).padStart(10, '0') + ' 00000 n \n')
  .join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
writeFileSync('samples/pdf-figures/figures/two-pages.pdf', pdf);
