// @ts-check
/**
 * Assistant « Partager la parcelle entre personnes » :
 *  1. personnes et quotes-parts (%, ou fractions comme 1/8) ;
 *  2. propositions de découpage (bandes à superficie exacte) + réglage manuel ;
 *  3. génération des sous-parcelles, chacune associée à une personne, avec sa couleur.
 */
import * as crs from '../core/crs.js';
import { analyzeParcel } from '../core/parcel.js';
import { OWNER_COLORS, parseShare, checkShares, divideByStrips, proposeDivisions } from '../core/division.js';
import { formatArea, formatLength } from '../core/units.js';
import { formatPercent } from '../core/units.js';
import { degToGrad } from '../core/angles.js';
import { polygonArea } from '../core/geodesy.js';
import { state, addFeature, updateFeature, removeFeature } from '../state.js';
import * as M from '../map/map.js';
import { h, icon, btn, mount, toast, field, select, confirmDialog, shareOrSave } from './dom.js';
import { anim } from './anim.js';
import { safeName } from '../io/common.js';

const L = M.L;

/** @param {HTMLElement} root @param {string} pid */
export function renderShare(root, pid) {
  const parcel = state.features.find((f) => f.id === pid);
  if (!parcel) { mount(root, h('p.empty', null, 'Parcelle introuvable.')); return; }
  const back = h('button.link-btn.back', { type: 'button', onclick: () => { location.hash = `#/parcels/${pid}`; } }, icon('back'), parcel.name || 'Parcelle');
  if (parcel.parentId) { mount(root, back, h('p.empty', null, 'Cette parcelle est déjà issue d’un partage. Ouvrez la parcelle d’origine pour refaire le partage.')); return; }
  let a;
  try { a = analyzeParcel(parcel.vertices, parcel.crsId, { method: 'plane' }); } catch { a = null; }
  if (!a?.valid) { mount(root, back, h('p.err', null, 'La parcelle doit être valide (au moins 3 sommets, sans croisement) avant d’être partagée.')); return; }
  const planeId = a.planeCrsId;
  /** @type {[number,number][]} */ const ring = a.plane;
  const children = () => state.features.filter((f) => f.parentId === pid);
  const labels = parcel.vertices.map((/** @type {any} */ v, /** @type {number} */ i) => v.label || String(i + 1));

  // ---------------------------------------------------------- 1. Personnes
  /** @type {{name:string, share:string, color:string}[]} */
  let owners = (parcel.shareOwners ?? []).map((/** @type {any} */ o, /** @type {number} */ i) => ({ name: o.name, share: String(o.input ?? o.percent), color: o.color ?? OWNER_COLORS[i % OWNER_COLORS.length] }));
  if (!owners.length) owners = [{ name: '', share: '50', color: OWNER_COLORS[0] }, { name: '', share: '50', color: OWNER_COLORS[1] }];
  const list = h('div.owner-list');
  const sum = h('div.share-sum');
  const parsed = () => owners.map((o) => ({ name: o.name.trim(), percent: parseShare(o.share), color: o.color }));
  const paintSum = () => {
    const c = checkShares(parsed());
    sum.className = `share-sum ${c.ok ? 'ok' : 'bad'}`;
    mount(sum, icon(c.ok ? 'check' : 'alert'), h('span', null, `Total : ${formatPercent(c.total)}`), c.ok ? null : h('small', null, c.errors[0]));
    return c;
  };
  const paintOwners = () => {
    mount(list, owners.map((o, i) => {
      const n = /** @type {HTMLInputElement} */ (h('input', { type: 'text', value: o.name, placeholder: `Personne ${i + 1}`, 'aria-label': `Nom de la personne ${i + 1}`, autocomplete: 'off' }));
      const sh = /** @type {HTMLInputElement} */ (h('input.share-in', { type: 'text', value: o.share, inputmode: 'decimal', 'aria-label': `Part de la personne ${i + 1} (%, ou fraction 1/8)` }));
      const col = /** @type {HTMLInputElement} */ (h('input.color-in', { type: 'color', value: o.color, 'aria-label': 'Couleur' }));
      const pct = h('small.share-pct');
      const upd = () => { const v = parseShare(sh.value); pct.textContent = Number.isFinite(v) ? `${formatPercent(v)} · ${formatArea((v / 100) * a.planeArea, 'm2')}` : 'part illisible'; };
      n.addEventListener('input', () => { o.name = n.value; paintSum(); });
      sh.addEventListener('input', () => { o.share = sh.value; upd(); paintSum(); });
      col.addEventListener('input', () => { o.color = col.value; });
      upd();
      return h('div.owner-row', null, col, h('div.owner-main', null, n, h('div.owner-share', null, sh, pct)),
        h('div.owner-acts', null,
          h('button.icon-btn.sm', { type: 'button', 'aria-label': 'Monter', title: 'Monter (ordre des bandes)', disabled: i === 0, onclick: () => { [owners[i - 1], owners[i]] = [owners[i], owners[i - 1]]; paintOwners(); } }, icon('up')),
          h('button.icon-btn.sm', { type: 'button', 'aria-label': 'Descendre', title: 'Descendre', disabled: i === owners.length - 1, onclick: () => { [owners[i + 1], owners[i]] = [owners[i], owners[i + 1]]; paintOwners(); } }, icon('down')),
          h('button.icon-btn.sm.danger', { type: 'button', 'aria-label': 'Retirer', disabled: owners.length <= 1, onclick: () => { owners.splice(i, 1); paintOwners(); } }, icon('trash'))));
    }));
    paintSum();
  };
  const addOwner = () => { owners.push({ name: '', share: '0', color: OWNER_COLORS[owners.length % OWNER_COLORS.length] }); paintOwners(); /** @type {HTMLInputElement|null} */ (list.querySelector('.owner-row:last-child input[type=text]'))?.focus(); };
  const equal = () => { const v = 100 / owners.length; owners.forEach((o) => { o.share = String(Math.round(v * 1e6) / 1e6); }); paintOwners(); };

  // ---------------------------------------------------------- 2. Propositions
  const sideSel = select([{ value: '', label: 'Aucun côté particulier' }, ...labels.map((l, i) => ({ value: String(i), label: `Côté ${l}–${labels[(i + 1) % labels.length]} (${formatLength(a.sides[i].gridLength)})` }))], parcel.accessSide != null ? String(parcel.accessSide) : '', { 'aria-label': 'Côté d’accès' });
  const proposals = h('div.proposals');
  const manual = h('div.manual');
  const result = h('div.share-result');
  /** @type {any} */ let current = null;
  const draft = M.layer('draft');

  /** Aperçu SVG d'une proposition. @param {any} r @param {any[]} own */
  const preview = (r, own) => {
    const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const W = 120, H = 90, pad = 6, s = Math.min((W - 2 * pad) / (maxX - minX || 1), (H - 2 * pad) / (maxY - minY || 1));
    const ox = (W - (maxX - minX) * s) / 2, oy = (H - (maxY - minY) * s) / 2;
    const P = (/** @type {[number,number]} */ p) => `${(ox + (p[0] - minX) * s).toFixed(1)},${(H - oy - (p[1] - minY) * s).toFixed(1)}`;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'prop-svg'); svg.setAttribute('aria-hidden', 'true');
    r.pieces.forEach((pc, i) => {
      const poly = document.createElementNS(NS, 'polygon');
      poly.setAttribute('points', pc.ring.map(P).join(' '));
      poly.setAttribute('fill', own[i].color); poly.setAttribute('fill-opacity', '0.55'); poly.setAttribute('stroke', '#fff'); poly.setAttribute('stroke-width', '1');
      svg.append(poly);
    });
    const outline = document.createElementNS(NS, 'polygon');
    outline.setAttribute('points', ring.map(P).join(' ')); outline.setAttribute('fill', 'none'); outline.setAttribute('stroke', 'currentColor'); outline.setAttribute('stroke-width', '1.5');
    svg.append(outline);
    return svg;
  };

  const describe = (/** @type {any} */ pr) => {
    const l1 = labels[pr.side], l2 = labels[(pr.side + 1) % labels.length];
    return pr.kind === 'perpendicular' ? `Bandes perpendiculaires au côté ${l1}–${l2} : chacun a une façade sur ce côté` : `Bandes parallèles au côté ${l1}–${l2}`;
  };

  const showOnMap = (/** @type {any} */ r, /** @type {any[]} */ own) => {
    draft.clearLayers();
    r.pieces.forEach((pc, i) => {
      const ll = pc.ring.map((/** @type {[number,number]} */ p) => { const w = crs.toWGS84(planeId, p); return L.latLng(w.lat, w.lon); });
      L.polygon(ll, { pane: 'draft', color: own[i].color, weight: 2, fillColor: own[i].color, fillOpacity: 0.45 })
        .bindTooltip(`<b>${own[i].name || `Personne ${i + 1}`}</b><br>${formatArea(pc.area, 'm2')}`, { permanent: true, direction: 'center', className: 'parcel-label owned' }).addTo(draft);
    });
  };

  const propose = () => {
    const c = paintSum();
    if (!c.ok) { anim.shake(list); toast(c.errors[0], 'error'); return; }
    const own = parsed();
    const props = proposeDivisions(ring, own.map((o) => o.percent), { max: 4, preferSide: sideSel.value === '' ? null : Number(sideSel.value) });
    if (!props.length) { mount(proposals, h('p.err', null, 'Aucune proposition possible pour cette forme.')); return; }
    mount(proposals, h('h4', null, 'Propositions de découpage'), h('div.prop-grid', null, props.map((pr, k) => {
      const card = h('button.prop-card', { type: 'button', 'aria-pressed': 'false', onclick: () => choose(pr.bearing, pr.side, card) },
        preview(pr.result, own),
        h('div.prop-txt', null,
          h('b', null, `${k === 0 ? '★ ' : ''}${describe(pr)}`),
          h('small', null, `Gisement des limites ${degToGrad(pr.bearing).toFixed(2)} gr · ${pr.result.contiguous ? 'lots d’un seul tenant' : '⚠ lot morcelé'} · forme ${pr.minCompact > 0.6 ? 'compacte' : pr.minCompact > 0.35 ? 'allongée' : 'très allongée'}`)));
      return card;
    })));
    const first = /** @type {HTMLElement} */ (proposals.querySelector('.prop-card'));
    choose(props[0].bearing, props[0].side, first);
    anim.panelIn(proposals);
  };

  // réglage manuel de l'orientation
  const angle = /** @type {HTMLInputElement} */ (h('input', { type: 'range', min: 0, max: 179.9, step: 0.1, value: 0, 'aria-label': 'Gisement des limites de partage' }));
  const angleOut = h('span.angle-out');
  angle.addEventListener('input', () => compute(Number(angle.value), current?.refSide ?? null));
  mount(manual, field('Orientation des limites de partage (réglage fin)', h('div.angle-row', null, angle, angleOut), 'Faites glisser pour ajuster la direction des lignes de partage. Les superficies restent exactes.'));
  manual.hidden = true;

  /** @param {number} bearing @param {number|null} side @param {HTMLElement} [card] */
  function choose(bearing, side, card) {
    proposals.querySelectorAll('.prop-card').forEach((c) => c.setAttribute('aria-pressed', String(c === card)));
    angle.value = String(bearing);
    manual.hidden = false;
    compute(bearing, side);
  }

  /** @param {number} bearing @param {number|null} side */
  function compute(bearing, side) {
    const own = parsed();
    const refSide = side != null ? /** @type {[[number,number],[number,number]]} */ ([ring[side], ring[(side + 1) % ring.length]]) : null;
    const r = divideByStrips(ring, own.map((o) => o.percent), bearing, refSide ? { refSide } : {});
    current = { r, own, bearing, side, refSide };
    angleOut.textContent = `${bearing.toFixed(1)}° (${degToGrad(bearing).toFixed(2)} gr)`;
    showOnMap(r, own);
    mount(result,
      h('h4', null, 'Résultat'),
      r.contiguous ? null : h('p.issue.warning', null, icon('alert'), 'Au moins un lot est morcelé (forme non convexe) : choisissez une autre orientation.'),
      h('div.table-wrap', null, h('table.tbl', null,
        h('thead', null, h('tr', null, h('th', null, 'Personne'), h('th', null, 'Part'), h('th', null, 'Superficie'), h('th', null, 'Écart'), side != null ? h('th', null, 'Façade') : null)),
        h('tbody', null, r.pieces.map((pc, i) => h('tr', null,
          h('td', null, h('span.swatch', { style: { background: own[i].color } }), ` ${own[i].name || `Personne ${i + 1}`}`),
          h('td.num', null, `${formatPercent(own[i].percent)}`),
          h('td.num', null, formatArea(pc.area, 'm2')),
          h('td.num', null, `${((pc.area - pc.target) * 1e6).toFixed(1)} mm²`),
          side != null ? h('td.num', null, formatLength(pc.frontage ?? 0)) : null))),
        h('tfoot', null, h('tr', null, h('th', null, 'Total'), h('th.num', null, '100 %'), h('th.num', null, formatArea(r.pieces.reduce((s, p) => s + p.area, 0), 'm2')), h('th', null, ''), side != null ? h('th', null, '') : null)))),
      h('p.small.muted', null, `Superficies planes dans la projection ${crs.getCrs(planeId).label}, comme la superficie de la parcelle (${formatArea(a.planeArea, 'm2')}).`),
      h('div.btn-grid', null,
        btn(children().length ? 'Remplacer le partage existant' : 'Générer les parcelles', { variant: 'primary', onclick: generate }, 'split'),
        btn('Voir sur la carte', { variant: 'ghost', onclick: () => M.zoomToFeature(parcel) }, 'map')),
    );
  }

  async function generate() {
    if (!current) return;
    const { r, own, bearing, side } = current;
    if (!checkShares(own).ok) return;
    const old = children();
    if (old.length && !await confirmDialog('Remplacer le partage', `Les ${old.length} lots existants de cette parcelle seront remplacés.`, { danger: true, confirmLabel: 'Remplacer' })) return;
    for (const f of old) await removeFeature(f.id, 'Suppression ancien lot');
    const near = (/** @type {[number,number]} */ p) => ring.findIndex((q) => Math.abs(q[0] - p[0]) < 1e-6 && Math.abs(q[1] - p[1]) < 1e-6);
    let k = 0;
    for (let i = 0; i < r.pieces.length; i++) {
      const pc = r.pieces[i];
      const vertices = pc.ring.map((/** @type {[number,number]} */ p) => {
        const j = near(p);
        return { x: p[0], y: p[1], label: j >= 0 ? labels[j] : `L${++k}`, pointId: j >= 0 ? parcel.vertices[j].pointId : undefined };
      });
      await addFeature({
        type: 'parcel', name: `${parcel.name || 'Parcelle'} — ${own[i].name}`, crsId: planeId, method: 'plane', source: 'division', parentId: pid,
        owner: { name: own[i].name, percent: own[i].percent, color: own[i].color },
        division: { bearing, side, index: i, date: new Date().toISOString(), target: pc.target },
        vertices,
      }, `Lot de ${own[i].name}`);
    }
    await updateFeature({ ...parcel, ...state.features.find((f) => f.id === pid), shareOwners: owners.map((o) => ({ name: o.name.trim(), input: o.share, percent: parseShare(o.share), color: o.color })), accessSide: side, division: { bearing, date: new Date().toISOString() } }, 'Partage');
    draft.clearLayers();
    toast(`${r.pieces.length} lots créés, chacun associé à sa personne.`, 'ok', 4000);
    paintExisting();
  }

  const existing = h('div.share-existing');
  const paintExisting = () => {
    const ch = children();
    if (!ch.length) { mount(existing); return; }
    const rows = ch.map((f) => {
      let ar = 0; try { ar = analyzeParcel(f.vertices, f.crsId, { method: 'plane' }).planeArea; } catch { /* */ }
      return { f, ar };
    });
    mount(existing, h('h4', null, icon('users'), ' Partage enregistré'),
      h('div.table-wrap', null, h('table.tbl', null, h('tbody', null, rows.map(({ f, ar }) => h('tr', { tabindex: 0, onclick: () => M.zoomToFeature(f) },
        h('td', null, h('span.swatch', { style: { background: f.owner?.color } }), ` ${f.owner?.name ?? ''}`),
        h('td.num', null, `${formatPercent(+f.owner?.percent || 0)}`), h('td.num', null, formatArea(ar, 'm2'))))))),
      h('div.btn-grid', null,
        btn('Rapport de partage (PDF)', { variant: 'primary', onclick: async () => {
          try {
            const { divisionReportPDF } = await import('../io/office.js');
            const blob = await divisionReportPDF(state.features.find((f) => f.id === pid), children(), state.project);
            await shareOrSave(blob, `${safeName(parcel.name)}-partage.pdf`);
          } catch (e) { toast(/** @type {Error} */ (e).message, 'error', 6000); }
        } }, 'file'),
        btn('Supprimer le partage', { variant: 'ghost-danger', onclick: async () => {
          if (!await confirmDialog('Supprimer le partage', 'Les lots générés seront supprimés (la parcelle d’origine est conservée).', { danger: true, confirmLabel: 'Supprimer' })) return;
          for (const f of children()) await removeFeature(f.id, 'Suppression lot');
          paintExisting();
        } }, 'trash')));
  };

  mount(root,
    back,
    h('div.share-head', null, h('div.eyebrow', null, 'Parcelle à partager'), h('b', null, `${parcel.name || 'Parcelle'} — ${formatArea(a.planeArea, 'm2')} (${formatArea(a.planeArea, 'haaca')})`)),
    existing,
    h('h4', null, '1. Personnes et parts'),
    h('p.small', null, 'Saisissez chaque personne et sa part en % (ex. 25) ou en fraction (ex. 1/8). L’ordre de la liste est l’ordre des lots sur le terrain.'),
    list,
    h('div.row.wrap', null, btn('Ajouter une personne', { variant: 'ghost', onclick: addOwner }, 'plus'), btn('Parts égales', { variant: 'ghost', onclick: equal }, 'split')),
    sum,
    h('h4', null, '2. Manière de découper'),
    field('Côté d’accès (route, piste, canal) — facultatif', sideSel, 'Si un côté donne sur l’accès, les propositions privilégient une façade pour chaque personne sur ce côté.'),
    btn('Proposer des découpages', { variant: 'primary', onclick: propose }, 'polygon'),
    proposals, manual, result,
    h('p.small.muted', null, icon('info'), ' Proposition technique de découpage à superficie exacte. Un partage foncier ou successoral doit être validé par les intéressés et établi par un ingénieur géomètre-topographe ; il n’a pas de valeur juridique en soi.'),
  );
  paintOwners();
  paintExisting();
  M.zoomToFeature(parcel);
  return () => draft.clearLayers();
}

void polygonArea;
