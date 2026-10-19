// Mise en page du manuel : docs/manuel/manuel.html (+ captures) → PDF A4 via Chromium.
// Usage : node tools/manual/build-pdf.mjs [sortie.pdf]
// 1er passage : repérage des pages des chapitres ; 2e passage : sommaire avec numéros de page.
import fs from 'node:fs';
import path from 'node:path';
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

const browser = await pw.chromium.launch({ executablePath: exe });
const footer = `<div style="width:100%;font:7.5pt Inter,sans-serif;color:#6b7b8b;padding:0 16mm;display:flex;justify-content:space-between">
  <span>TopoMaroc GIS — Manuel d’utilisation · version 1.4.0</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;

async function render(file, pages) {
  const page = await browser.newPage();
  if (pages) await page.addInitScript((p) => { window.__TOC_PAGES = p; }, pages);
  await page.goto(pathToFileURL(HTML).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const missing = await page.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).map((i) => i.getAttribute('src')));
  if (missing.length) console.warn('Images manquantes :', missing.join(', '));
  await page.pdf({ path: file, format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: footer });
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
console.log(`${OUT} : ${n} pages ; chapitres →`, JSON.stringify(pages));
