// Génère docs/TESTS.md à partir de l'exécution réelle des tests unitaires et du fichier
// tests/e2e/results.json (tests navigateur). Usage : node tools/tests-report.mjs [results.json ...]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const files = fs.readdirSync(path.join(root, 'tests/unit')).filter((f) => f.endsWith('.test.mjs')).map((f) => path.join('tests/unit', f));
const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], { cwd: root, encoding: 'utf8' });
const unit = [];
for (const line of r.stdout.split('\n')) {
  const m = line.match(/^(\s*)(ok|not ok) \d+ - (.+?)(\s+#.*)?$/);
  if (m && m[1].length === 0 && !/\.test\.mjs$/.test(m[3])) unit.push({ ok: m[2] === 'ok', name: m[3] });
}
const ref = JSON.parse(fs.readFileSync(path.join(root, 'tests/reference/proj_reference.json'), 'utf8'));
const e2eRuns = process.argv.slice(2).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));

let md = `# Résultats des tests — TopoMaroc GIS\n\nGénéré le ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC par \`tools/tests-report.mjs\` à partir d'exécutions réelles. Aucun test n'est déclaré réussi sans avoir été exécuté.\n\n`;
md += `## 1. Tests unitaires (Node ${process.version}, \`node --test\`)\n\n`;
md += `Références indépendantes : PROJ ${ref.proj} (pyproj ${ref.pyproj}), GeographicLib-C (pyproj.Geod), Shapely, NOAA WMM 2025 (pygeomag), générées dans GitHub Actions par \`tools/reference/make_reference.py\`.\n\n`;
md += `**${unit.filter((u) => u.ok).length} réussi(s), ${unit.filter((u) => !u.ok).length} échoué(s).**\n\n| Résultat | Test |\n|---|---|\n`;
for (const u of unit) md += `| ${u.ok ? '✅ réussi' : '❌ échoué'} | ${u.name} |\n`;
md += `\n### Principales valeurs vérifiées\n\n| Cas | Attendu | Méthode de contrôle |\n|---|---|---|\n`;
md += `| Carré 10 m × 10 m (Lambert Nord) | 100 m² (écart < 1e-9 m²) | formule de Gauss ; ellipsoïde vs GeographicLib-C < 0,1 mm² |\n`;
md += `| Rectangle 20 m × 30 m (Lambert Sud) | 600 m² | idem |\n| Triangle base 40 m, hauteur 25 m | 500 m² | idem, Shapely |\n`;
md += `| Parcelle irrégulière 6 sommets | ${ref.polygons.find((p) => p.name === 'parcelle_irreguliere_lambert_nord').plane_area.toFixed(4)} m² (Shapely) | écart < 1e-6 m² |\n`;
md += `| Polygone WGS 84 0,01° × 0,01° (Rabat) | ${ref.polygons.find((p) => p.name === 'wgs84_0.01deg_rabat').geodesic_area.toFixed(3)} m² (pyproj.Geod) | écart < 1 mm² |\n`;
md += `| Parcelle saisie en WGS 84, contrôle en Lambert | 100 m² plan | aller-retour PROJ, écart < 1e-4 m² |\n`;
md += `| Sommets en double / auto-intersection | erreur détectée | — |\n`;
md += `| WGS 84 → Lambert Nord/Sud, UTM 28-30, Merchich (${ref.forward.length} points) | valeurs PROJ | écart < 1 mm |\n`;
md += `| Lambert (4 zones) → Merchich géographique | valeurs PROJ | écart < 0,1 mm |\n`;
md += `| Origines Lambert (X0, Y0) | (−5,4° ; φ0) exactement | < 1e-9° |\n`;
md += `| Déclinaison WMM 2025 (4 points) | valeurs NOAA | < 1e-6° |\n\n`;
md += `Constat documenté : PROJ n'applique pas EPSG:1166 dans les zones Sahara Nord/Sud (hors domaine de validité) ; l'application applique la même transformation par extrapolation et l'**affiche comme telle**. Les quatre zones Lambert ont des plages X/Y qui se recouvrent : une confusion de zone n'est pas détectable par les seules valeurs (test dédié).\n\n`;
for (const run of e2eRuns) {
  md += `## ${run.base.includes('127.0.0.1') || run.base.includes('localhost') ? '2' : '3'}. Tests navigateur — ${run.base}\n\nChromium (Playwright), viewport mobile 390×844 tactile, tablette 820×1180, ordinateur 1440×900 ; GPS simulé. Exécution du ${run.date.slice(0, 16).replace('T', ' ')} UTC.\n\n`;
  md += `**${run.passed} réussi(s), ${run.failed} échoué(s), ${run.skipped} non exécuté(s).**\n\n| Résultat | Scénario | Détail |\n|---|---|---|\n`;
  for (const t of run.results) md += `| ${t.status === 'réussi' ? '✅ réussi' : t.status === 'échoué' ? '❌ échoué' : '⏸ non exécuté'} | ${t.name} | ${String(t.detail ?? '').replace(/\|/g, '/').replace(/\n/g, ' ').slice(0, 220)} |\n`;
  md += '\n';
}
md += `## Non couvert par l'automatisation\n\n- Appareils physiques iOS (Safari) et Android (Chrome) : précision réelle du GPS, boussole, installation PWA, comportement en plein soleil — à valider sur le terrain.\n- Comparaison avec QGIS : remplacée par PROJ (bibliothèque utilisée par QGIS pour les mêmes transformations) et Shapely/GeographicLib pour les superficies.\n`;
fs.writeFileSync(path.join(root, 'docs/TESTS.md'), md);
console.log(`docs/TESTS.md : ${unit.length} tests unitaires, ${e2eRuns.length} exécution(s) navigateur`);
