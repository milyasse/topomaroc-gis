// @ts-check
/** Exports XLSX (tableaux) et PDF (rapport de superficie, fiche de levé). Chargés à la demande. */
import * as crs from '../core/crs.js';
import { degToGrad } from '../core/angles.js';
import { formatHaACa } from '../core/units.js';
import { pointXY, verticesXY, analyze } from './common.js';

const APP = 'TopoMaroc GIS';
export const DISCLAIMER = 'Document technique établi à partir des données saisies ou levées par l’utilisateur. Il ne constitue pas, à lui seul, un document cadastral ou foncier officiel. Les positions issues d’un GPS de smartphone ont une précision métrique ; seul un levé réalisé par un ingénieur géomètre-topographe (station totale, GNSS RTK) rattaché au réseau géodésique fait foi.';

// ------------------------------------------------------------------ XLSX
/**
 * @param {any[]} features @param {string} crsId @param {any} project
 * @returns {Promise<Blob>}
 */
export async function toXLSX(features, crsId, project) {
  const { default: writeXlsxFile } = await import('../../vendor/xlsx.mjs');
  const c = crs.getCrs(crsId);
  const H = (/** @type {string} */ v) => ({ value: v, fontWeight: 'bold', backgroundColor: '#E8EEF5' });
  const N = (/** @type {number|null|undefined} */ v, fmt = '0.000') => (v == null || !Number.isFinite(v) ? null : { value: v, type: Number, format: fmt });
  const S = (/** @type {any} */ v) => ({ value: v == null ? '' : String(v), type: String });
  const [ax, ay] = c.kind === 'projected' ? ['X (m)', 'Y (m)'] : ['Longitude (°)', 'Latitude (°)'];
  const cf = c.unit === 'm' ? '0.000' : '0.00000000';

  /** @type {any[][]} */
  const points = [[H('N°'), H('Nom'), H('Code'), H(ax), H(ay), H('Latitude WGS 84'), H('Longitude WGS 84'), H('Précision (m)'), H('Source'), H('Date'), H('Description')]];
  for (const f of features.filter((x) => x.type === 'point')) {
    const [x, y] = pointXY(f, crsId);
    points.push([S(f.num), S(f.name), S(f.code), N(x, cf), N(y, cf), N(f.wgs84.lat, '0.00000000'), N(f.wgs84.lon, '0.00000000'), N(f.accuracy, '0.0'), S(f.source), S(f.takenAt ?? f.createdAt), S(f.description)]);
  }
  /** @type {any[][]} */
  const parcels = [[H('Parcelle'), H('Code'), H('Sommets'), H('Superficie (m²)'), H('Superficie (ha)'), H('ha a ca'), H('Périmètre (m)'), H('Méthode'), H('SRC de calcul'), H('Valide'), H('Remarques')]];
  /** @type {any[][]} */
  const verts = [[H('Parcelle'), H('Sommet'), H(ax), H(ay), H('Latitude WGS 84'), H('Longitude WGS 84'), H('Précision (m)')]];
  /** @type {any[][]} */
  const sides = [[H('Parcelle'), H('Côté'), H('Longueur plane (m)'), H('Gisement (gr)'), H('Gisement (°)'), H('Longueur géodésique (m)'), H('Azimut vrai (°)')]];
  for (const f of features.filter((x) => x.type === 'parcel')) {
    const a = analyze(f);
    parcels.push([S(f.name), S(f.code), N(f.vertices.length, '0'), a.valid ? N(a.area, '0.00') : null, a.valid ? N(a.area / 1e4, '0.0000') : null, S(a.valid ? formatHaACa(a.area).replace(/ /g, ' ') : ''), a.valid ? N(a.perimeter, '0.00') : null, S(a.valid ? (a.method === 'plane' ? 'Plane' : 'Géodésique') : ''), S(a.valid ? (a.method === 'plane' ? crs.getCrs(a.planeCrsId).name : 'Ellipsoïde WGS 84') : ''), S(a.valid ? 'Oui' : 'Non'), S(a.issues.map((/** @type {any} */ i) => i.message).join(' | '))]);
    const xy = verticesXY(f, crsId);
    f.vertices.forEach((/** @type {any} */ v, /** @type {number} */ i) => {
      const w = crs.toWGS84(f.crsId, [v.x, v.y]);
      verts.push([S(f.name), S(v.label ?? i + 1), N(xy[i][0], cf), N(xy[i][1], cf), N(w.lat, '0.00000000'), N(w.lon, '0.00000000'), N(v.accuracy, '0.0')]);
    });
    if (a.valid) {
      for (const s of a.sides) {
        const la = f.vertices[s.from].label ?? s.from + 1, lb = f.vertices[s.to].label ?? s.to + 1;
        sides.push([S(f.name), S(`${la}-${lb}`), N(s.gridLength, '0.000'), N(degToGrad(s.gridBearing), '0.0000'), N(s.gridBearing, '0.0000'), N(s.geodesicLength, '0.000'), N(s.trueAzimuth, '0.0000')]);
      }
    }
  }
  /** @type {any[][]} */
  const meta = [
    [H('Champ'), H('Valeur')],
    [S('Application'), S(APP)],
    [S('Projet'), S(project?.name)],
    [S('Date d’export'), S(new Date().toLocaleString('fr-MA'))],
    [S('SRC des colonnes X/Y'), S(`${c.name}${c.epsg ? ` (EPSG:${c.epsg})` : ''}`)],
    [S('Transformation vers WGS 84'), S(crs.datumInfo(crsId).transformation)],
    [S('Avertissement'), S(DISCLAIMER)],
  ];
  const widths = (/** @type {number[]} */ w) => w.map((width) => ({ width }));
  return writeXlsxFile([points, parcels, verts, sides, meta], {
    sheets: ['Points', 'Parcelles', 'Sommets', 'Côtés', 'Métadonnées'],
    columns: [widths([8, 16, 12, 15, 15, 14, 14, 11, 10, 22, 30]), widths([18, 10, 9, 15, 14, 18, 14, 12, 26, 8, 60]), widths([18, 9, 15, 15, 14, 14, 11]), widths([18, 10, 16, 14, 14, 18, 14]), widths([28, 100])],
  });
}

// ------------------------------------------------------------------ PDF
/** Texte compatible avec la police standard du PDF (WinAnsi). @param {any} s */
function pdfText(s) {
  return String(s ?? '').replace(/[  ]/g, ' ').replace(/[′’]/g, "'").replace(/″/g, '"').replace(/−/g, '-').replace(/≈/g, '~').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[«»]/g, '"').replace(/·/g, '-').replace(/φ/g, 'phi').replace(/λ/g, 'lambda').replace(/Δ/g, 'd');
}
const fnum = (/** @type {number} */ v, d = 2) => {
  const [i, dec] = v.toFixed(d).split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (dec ? ',' + dec : '');
};

/**
 * Dessine le plan d'une parcelle dans un cadre (coordonnées planes).
 * @param {any} doc @param {[number,number][]} pts @param {string[]} labels
 * @param {{x:number,y:number,w:number,h:number}} box @param {string} crsLabel
 */
function drawPlan(doc, pts, labels, box, crsLabel) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const dx = Math.max(maxX - minX, 1e-6), dy = Math.max(maxY - minY, 1e-6);
  const pad = 14;
  const s = Math.min((box.w - 2 * pad) / dx, (box.h - 2 * pad) / dy);
  const ox = box.x + (box.w - dx * s) / 2, oy = box.y + (box.h + dy * s) / 2;
  const P = (/** @type {[number,number]} */ p) => [ox + (p[0] - minX) * s, oy - (p[1] - minY) * s];
  doc.setDrawColor(200); doc.setLineWidth(0.2); doc.rect(box.x, box.y, box.w, box.h);
  // polygone
  doc.setDrawColor(20, 90, 160); doc.setFillColor(220, 234, 248); doc.setLineWidth(0.6);
  const sp = pts.map(P);
  const segs = sp.slice(1).map((p, i) => [p[0] - sp[i][0], p[1] - sp[i][1]]);
  segs.push([sp[0][0] - sp[sp.length - 1][0], sp[0][1] - sp[sp.length - 1][1]]);
  doc.lines(segs.slice(0, -1), sp[0][0], sp[0][1], [1, 1], 'FD', true);
  // sommets
  doc.setFontSize(8); doc.setTextColor(20, 20, 20);
  const cx = sp.reduce((a, p) => a + p[0], 0) / sp.length, cy = sp.reduce((a, p) => a + p[1], 0) / sp.length;
  sp.forEach((p, i) => {
    doc.setFillColor(214, 64, 40); doc.circle(p[0], p[1], 1.1, 'F');
    const vx = p[0] - cx, vy = p[1] - cy, n = Math.hypot(vx, vy) || 1;
    doc.text(pdfText(labels[i]), p[0] + (vx / n) * 4, p[1] + (vy / n) * 4 + 1, { align: 'center' });
  });
  // flèche du nord (grille)
  const nx = box.x + box.w - 10, ny = box.y + 8;
  doc.setDrawColor(30); doc.setFillColor(30, 30, 30); doc.setLineWidth(0.3);
  doc.triangle(nx, ny, nx - 2.5, ny + 7, nx + 2.5, ny + 7, 'F');
  doc.setFontSize(7); doc.text('Ng', nx, ny + 11, { align: 'center' });
  // échelle graphique
  const targetMm = box.w / 4;
  const raw = targetMm / s;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const nice = [1, 2, 5, 10].map((k) => k * pow).reduce((best, v) => (Math.abs(v - raw) < Math.abs(best - raw) ? v : best));
  const len = nice * s;
  const bx = box.x + 6, by = box.y + box.h - 7;
  doc.setDrawColor(30); doc.setLineWidth(0.5); doc.line(bx, by, bx + len, by); doc.line(bx, by - 1.5, bx, by + 1.5); doc.line(bx + len, by - 1.5, bx + len, by + 1.5);
  doc.setFontSize(7); doc.text(`${nice >= 1000 ? nice / 1000 + ' km' : fnum(nice, nice < 1 ? 2 : 0) + ' m'}`, bx + len / 2, by - 2, { align: 'center' });
  doc.text(pdfText(`Echelle approx. 1:${fnum(Math.round(1000 / s), 0)} - ${crsLabel}`), bx + len + 4, by + 1);
}

/**
 * Rapport PDF de superficie d'une parcelle.
 * @param {any} f parcelle @param {any} project @param {{ angleUnit?: 'grad'|'deg', reportCrsId?: string|null }} [opts]
 * @returns {Promise<Blob>}
 */
export async function parcelReportPDF(f, project, opts = {}) {
  const { jsPDF, autoTable } = await import('../../vendor/jspdf.mjs');
  const a = analyze(f, opts.reportCrsId ?? null);
  if (!a.valid) throw new Error('Parcelle invalide : corrigez les erreurs avant d’éditer le rapport.');
  const planeId = a.planeCrsId;
  const pc = crs.getCrs(planeId);
  const src = crs.getCrs(f.crsId);
  const labels = f.vertices.map((/** @type {any} */ v, /** @type {number} */ i) => String(v.label ?? i + 1));
  const doc = new (/** @type {any} */ (jsPDF))({ unit: 'mm', format: 'a4' });
  const W = 210, M = 14;
  const now = new Date();

  // En-tête
  doc.setFillColor(15, 61, 94); doc.rect(0, 0, W, 22, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text('Rapport de superficie', M, 10);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(pdfText(`${APP} - ${now.toLocaleDateString('fr-FR')} ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`), M, 16);
  doc.text(pdfText(`Projet : ${project?.name ?? '-'}`), W - M, 10, { align: 'right' });
  doc.text(pdfText(`Parcelle : ${f.name || '-'}`), W - M, 16, { align: 'right' });

  doc.setTextColor(20);
  // Bloc résultat
  let y = 28;
  doc.setDrawColor(15, 61, 94); doc.setLineWidth(0.4); doc.roundedRect(M, y, W - 2 * M, 24, 2, 2);
  doc.setFontSize(8); doc.setTextColor(90); doc.text('SUPERFICIE', M + 4, y + 6); doc.text('PERIMETRE', M + 100, y + 6);
  doc.setTextColor(15, 61, 94); doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
  doc.text(pdfText(`${fnum(a.area, 2)} m²`), M + 4, y + 14);
  doc.text(pdfText(`${fnum(a.perimeter, 2)} m`), M + 100, y + 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(40);
  doc.text(pdfText(`${formatHaACa(a.area)}  -  ${fnum(a.area / 1e4, 4)} ha`), M + 4, y + 20);
  doc.text(pdfText(`${a.n} sommets - orientation ${a.orientation}`), M + 100, y + 20);
  y += 30;

  // Plan
  drawPlan(doc, /** @type {[number,number][]} */ (a.plane), labels, { x: M, y, w: W - 2 * M, h: 92 }, pc.label);
  y += 98;

  // Méthode et référence
  doc.setFontSize(8.5); doc.setTextColor(30);
  const methodLines = [
    `Système de coordonnées de saisie : ${src.name}${src.epsg ? ` (EPSG:${src.epsg})` : ''}`,
    `Méthode : ${a.methodNote}`,
    `Contrôle : superficie plane ${pc.label} = ${fnum(a.planeArea, 2)} m² ; superficie ellipsoïdale WGS 84 = ${fnum(a.geodesicArea, 2)} m² (écart ${a.diffPercent.toFixed(3)} %).`,
    `Datum : ${a.datum.datum}. Transformation vers WGS 84 : ${a.datum.transformation}.`,
  ];
  for (const l of methodLines) {
    const wrapped = doc.splitTextToSize(pdfText(l), W - 2 * M);
    doc.text(wrapped, M, y); y += wrapped.length * 3.8;
  }

  // Tableau des sommets
  const showPlane = a.plane;
  autoTable(doc, {
    startY: y + 2, margin: { left: M, right: M },
    head: [['Sommet', `X ${pc.label} (m)`, `Y ${pc.label} (m)`, 'Latitude WGS 84', 'Longitude WGS 84', 'Précision']].map((r) => r.map(pdfText)),
    body: labels.map((l, i) => [l, fnum(showPlane[i][0], 3), fnum(showPlane[i][1], 3), a.wgs84[i].lat.toFixed(8), a.wgs84[i].lon.toFixed(8), f.vertices[i].accuracy != null ? `±${f.vertices[i].accuracy.toFixed(1)} m` : '-']).map((r) => r.map(pdfText)),
    styles: { fontSize: 8, cellPadding: 1.4 }, headStyles: { fillColor: [15, 61, 94] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
  });
  // Tableau des côtés
  const unit = opts.angleUnit ?? 'grad';
  // @ts-ignore
  y = doc.lastAutoTable.finalY + 4;
  autoTable(doc, {
    startY: y, margin: { left: M, right: M },
    head: [['Côté', 'Longueur plane (m)', unit === 'grad' ? 'Gisement (gr)' : 'Gisement (°)', 'Longueur géodésique (m)', 'Azimut vrai (°)'].map(pdfText)],
    body: a.sides.map((/** @type {any} */ s) => [`${labels[s.from]} - ${labels[s.to]}`, fnum(s.gridLength, 3), unit === 'grad' ? fnum(degToGrad(s.gridBearing), 4) : fnum(s.gridBearing, 4), fnum(s.geodesicLength, 3), fnum(s.trueAzimuth, 4)].map(pdfText)),
    styles: { fontSize: 8, cellPadding: 1.4 }, headStyles: { fillColor: [15, 61, 94] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
  });
  // @ts-ignore
  y = doc.lastAutoTable.finalY + 5;

  // Qualité
  const quality = [];
  quality.push(a.worstAccuracy != null
    ? `Précision GPS estimée la plus défavorable : ±${a.worstAccuracy.toFixed(1)} m (précision annoncée par l'appareil, non garantie).`
    : 'Sommets saisis ou importés : précision dépendant de la source des coordonnées.');
  for (const i of a.issues.filter((/** @type {any} */ x) => x.level !== 'info')) quality.push(`Avertissement : ${i.message}`);
  if (y > 250) { doc.addPage(); y = 20; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(15, 61, 94); doc.text('Qualité des mesures', M, y); y += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(30);
  for (const q of quality) { const w = doc.splitTextToSize(pdfText(q), W - 2 * M); if (y > 275) { doc.addPage(); y = 20; } doc.text(w, M, y); y += w.length * 3.8; }
  if (f.description) { const w = doc.splitTextToSize(pdfText(`Observations : ${f.description}`), W - 2 * M); doc.text(w, M, y + 1); y += w.length * 3.8 + 1; }

  addFooters(doc);
  return doc.output('blob');
}

/** @param {any} doc */
function addFooters(doc) {
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    doc.setDrawColor(200); doc.line(14, 279, 196, 279);
    doc.setFontSize(6.8); doc.setTextColor(110);
    doc.text(doc.splitTextToSize(pdfText(DISCLAIMER), 160), 14, 283);
    doc.text(`Page ${p}/${n}`, 196, 283, { align: 'right' });
  }
}

/**
 * Fiche de levé (liste des points d'un projet).
 * @param {any[]} features @param {any} project @param {string} crsId
 * @returns {Promise<Blob>}
 */
export async function surveySheetPDF(features, project, crsId) {
  const { jsPDF, autoTable } = await import('../../vendor/jspdf.mjs');
  const c = crs.getCrs(crsId);
  const doc = new (/** @type {any} */ (jsPDF))({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const W = 297, M = 12;
  doc.setFillColor(15, 61, 94); doc.rect(0, 0, W, 18, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text('Fiche de levé', M, 11);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(pdfText(`Projet : ${project?.name ?? '-'}  -  ${project?.date ?? ''}  -  Edité le ${new Date().toLocaleString('fr-FR')}`), W - M, 11, { align: 'right' });
  doc.setTextColor(30); doc.setFontSize(8.5);
  doc.text(pdfText(`Système : ${c.name}${c.epsg ? ` (EPSG:${c.epsg})` : ''} - ${crs.datumInfo(crsId).transformation}`), M, 25);
  if (project?.notes) doc.text(doc.splitTextToSize(pdfText(`Observations : ${project.notes}`), W - 2 * M), M, 30);
  const [ax, ay] = c.kind === 'projected' ? ['X (m)', 'Y (m)'] : ['Longitude', 'Latitude'];
  const pts = features.filter((f) => f.type === 'point');
  autoTable(doc, {
    startY: project?.notes ? 36 : 30, margin: { left: M, right: M, bottom: 22 },
    head: [['N°', 'Nom', 'Code', ax, ay, 'Lat. WGS 84', 'Lon. WGS 84', 'Précision', 'Source', 'Date / heure', 'Description'].map(pdfText)],
    body: pts.map((f) => {
      const [x, y] = pointXY(f, crsId);
      return [f.num ?? '', f.name ?? '', f.code ?? '', c.unit === 'm' ? fnum(x, 3) : x.toFixed(8), c.unit === 'm' ? fnum(y, 3) : y.toFixed(8), f.wgs84.lat.toFixed(8), f.wgs84.lon.toFixed(8), f.accuracy != null ? `±${f.accuracy.toFixed(1)} m` : '-', f.source ?? '', f.takenAt ? new Date(f.takenAt).toLocaleString('fr-FR') : '', f.description ?? ''].map(pdfText);
    }),
    styles: { fontSize: 7.5, cellPadding: 1.2 }, headStyles: { fillColor: [15, 61, 94] },
  });
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p); doc.setFontSize(6.8); doc.setTextColor(110);
    doc.text(doc.splitTextToSize(pdfText(DISCLAIMER), 250), M, 200);
    doc.text(`Page ${p}/${n}`, W - M, 200, { align: 'right' });
  }
  return doc.output('blob');
}
