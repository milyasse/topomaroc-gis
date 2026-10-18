// Génère sw-precache.js : liste des fichiers de l'application et version (empreinte du contenu).
// Usage : node tools/gen-precache.mjs   (option --check : échoue si le fichier n'est pas à jour)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const include = ['index.html', 'manifest.webmanifest', 'src', 'styles', 'icons', 'vendor'];
const exclude = [/^vendor\/licenses\//, /\.map$/];
const files = [];
const walk = (rel) => {
  const abs = path.join(root, rel);
  const st = fs.statSync(abs);
  if (st.isDirectory()) { for (const f of fs.readdirSync(abs).sort()) walk(path.posix.join(rel, f)); return; }
  if (exclude.some((r) => r.test(rel))) return;
  files.push(rel);
};
include.forEach(walk);
const hash = crypto.createHash('sha256');
for (const f of files) { hash.update(f); hash.update(fs.readFileSync(path.join(root, f))); }
const version = hash.digest('hex').slice(0, 12);
const out = `// Fichier généré par tools/gen-precache.mjs — ne pas modifier à la main.\nself.PRECACHE = ${JSON.stringify({ version, files: ['./', ...files.map((f) => `./${f}`)] }, null, 1)};\n`;
const target = path.join(root, 'sw-precache.js');
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (cur !== out) { console.error('sw-precache.js n’est pas à jour : exécutez node tools/gen-precache.mjs'); process.exit(1); }
  console.log(`sw-precache.js à jour (${files.length} fichiers, version ${version})`);
} else {
  fs.writeFileSync(target, out);
  console.log(`sw-precache.js : ${files.length} fichiers, version ${version}`);
}
