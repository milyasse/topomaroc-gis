// Mise en page du manuel : docs/manuel/manuel.html (+ captures) → PDF A4 via Chromium.
// Usage : node tools/manual/build-pdf.mjs [sortie.pdf]
// 1er passage : repérage des pages des chapitres ; 2e passage : sommaire avec numéros de page.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

let pw;
try { pw = await import('playwright'); } catch {
  pw = (await import('/home/claude/.npm-global/lib/node_modules/playwright/index.js')).default;
}
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const HTML = path.join(ROOT, 'docs/manuel/manuel.html');
const CAP = path.join(ROOT, 'docs/manuel/captures');
const OUT = path.resolve(process.argv[2] ?? path.join(ROOT, 'docs/manuel/TopoMaroc-GIS-manuel-utilisation.pdf'));
const exe = fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined;

// Première page des rapports PDF générés par l'application → images
for (const name of ['44-rapport-parcelle', '45-rapport-partage']) {
  const pdf = path.join(CAP, `${name}.pdf`);
  if (fs.existsSync(pdf)) execFileSync('pdftoppm', ['-png', '-r', '110', '-f', '1', '-l', '1', '-singlefile', pdf, path.join(CAP, `${name}-p1`)]);
}

// Images allégées pour le PDF (JPEG ~300 dpi à la taille d'impression) : copie de travail du HTML
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'manuel-'));
execFileSync('python3', ['-c', `
import sys, glob, os
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
for f in glob.glob(os.path.join(src, '*.png')):
    im = Image.open(f).convert('RGB')
    w = 1300 if '46-' in os.path.basename(f) or '-p1' in f else 640
    if im.width > w: im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    im.save(os.path.join(dst, os.path.basename(f)[:-4] + '.jpg'), quality=84, optimize=True, progressive=True)
`, CAP, WORK]);
const html = fs.readFileSync(HTML, 'utf8')
  .replace(/src="captures\/([^"]+)\.png"/g, (m, n) => `src="${pathToFileURL(path.join(WORK, n + '.jpg')).href}"`)
  .replace(/src="\.\.\/\.\.\/icons\//g, `src="${pathToFileURL(path.join(ROOT, 'icons')).href}/`);
const WORK_HTML = path.join(WORK, 'manuel.html');
fs.writeFileSync(WORK_HTML, html);

const browser = await pw.chromium.launch({ executablePath: exe });
const footer = `<div style="width:100%;font:7.5pt Inter,sans-serif;color:#6b7b8b;padding:0 16mm;display:flex;justify-content:space-between">
  <span>TopoMaroc GIS — Manuel d’utilisation · version 1.4.0</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;

async function render(file, pages) {
  const page = await browser.newPage();
  if (pages) await page.addInitScript((p) => { window.__TOC_PAGES = p; }, pages);
  await page.goto(pathToFileURL(WORK_HTML).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const missing = await page.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).map((i) => i.getAttribute('src')));
  if (missing.length) console.warn('Images manquantes :', missing.join(', '));
  await page.pdf({ path: file, format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: footer });
  // couverture sans pied de page : page 1 rendue seule puis substituée
  if (pages) {
    const cover = file.replace(/\.pdf$/, '.cover.pdf');
    await page.pdf({ path: cover, format: 'A4', printBackground: true, preferCSSPageSize: true, pageRanges: '1' });
    const merged = file.replace(/\.pdf$/, '.merged.pdf');
    execFileSync('qpdf', ['--empty', '--pages', cover, file, '2-z', '--', merged]);
    execFileSync('python3', ['-c', `
import sys
from pypdf import PdfReader, PdfWriter
r = PdfReader(sys.argv[1]); w = PdfWriter(clone_from=r)
w.add_metadata({'/Title': 'TopoMaroc GIS — Manuel d’utilisation (version 1.4.0)', '/Subject': 'Manuel utilisateur avec captures d’écran', '/Creator': 'TopoMaroc GIS — tools/manual/build-pdf.mjs'})
w.write(sys.argv[2])
`, merged, file]);
    fs.unlinkSync(merged); fs.unlinkSync(cover);
  }
  const titles = await page.evaluate(() => [...document.querySelectorAll('section.chap .chap-head h1')].map((h) => h.textContent.trim()));
  await page.close();
  return titles;
}

const tmp = OUT.replace(/\.pdf$/, '.pass1.pdf');
const titles = await render(tmp);
const n = Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [tmp]).toString())[1]);
const pages = {};
const norm = (s) => s.replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
for (let p = 3; p <= n; p++) {
  // en-tête de chapitre : « N   Titre » sur une des premières lignes de la page
  const lines = execFileSync('pdftotext', ['-f', String(p), '-l', String(p), '-layout', tmp, '-']).toString().split('\n').filter((l) => l.trim()).slice(0, 4).map(norm);
  titles.forEach((t, i) => { if (!pages[i + 1] && lines.some((l) => l.startsWith(`${i + 1} ${norm(t)}`))) pages[i + 1] = p; });
}
fs.unlinkSync(tmp);
await render(OUT, pages);
await browser.close();
fs.rmSync(WORK, { recursive: true, force: true });
console.log(`${OUT} : ${n} pages ; chapitres →`, JSON.stringify(pages));
