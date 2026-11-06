import fs from 'node:fs';
import path from 'node:path';
const directories = [];
for (const name of fs.readdirSync('node_modules')) {
  if (name.startsWith('.')) continue;
  if (name.startsWith('@'))
    for (const child of fs.readdirSync(path.join('node_modules', name)))
      directories.push(path.join('node_modules', name, child));
  else directories.push(path.join('node_modules', name));
}
const notices = [];
const licenses = new Map();
for (const dir of directories) {
  if (!fs.existsSync(path.join(dir, 'package.json'))) continue;
  const p = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const candidates = fs
    .readdirSync(dir)
    .filter(
      (f) =>
        (/^licen[cs]e(?:[._-].*)?$/i.test(f) || /^notice(?:[._-].*)?$/i.test(f)) &&
        fs.statSync(path.join(dir, f)).isFile(),
    );
  licenses.set(p.license, (licenses.get(p.license) || 0) + 1);
  notices.push(
    `\n${'='.repeat(70)}\n${p.name} ${p.version}\nLicense: ${p.license || 'See package repository'}\n${p.repository?.url || p.homepage || ''}\n\n${candidates.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n')}`,
  );
}
fs.writeFileSync(
  'public/THIRD-PARTY-NOTICES.txt',
  'Nitpick dependency notices\nIncludes build and test dependencies for completeness.\n' +
    notices.sort().join('\n'),
);
console.log(Object.fromEntries(licenses));
