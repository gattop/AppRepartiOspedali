import { html, raw } from './util.js';

// Axonometric "exploded floors" view of a hospital, drawn with clip-path polygons.
// `mappa` = { blocks: [{id, x0, y0, x1, y1, lv: [levels], label, node}], corpi, livelli, markers, rot }
// `reparti` = wards of this hospital with `corpo` (block id) and `piano` (level).
export function renderMap({ mappa, reparti, sel, lvl, rot, exp, width, height = 300 }) {
  const B = mappa.blocks || [];
  const selR = reparti.find((r) => r.id === sel) || null;
  const th = (rot * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
  const SP = exp ? 46 : 26, TH = 7, T = 0.55, K = 10;

  let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
  for (const b of B) {
    bx0 = Math.min(bx0, b.x0); bx1 = Math.max(bx1, b.x1);
    by0 = Math.min(by0, b.y0); by1 = Math.max(by1, b.y1);
  }
  const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;

  function P(x, y, z) {
    const xc = x - cx, yc = y - cy;
    const xr = xc * c - yc * s, yr = xc * s + yc * c;
    return [xr * K, yr * K * T - z, yr];
  }

  const byBlockLevel = {};
  for (const r of reparti) {
    if (r.corpo == null || r.piano == null) continue;
    (byBlockLevel[r.corpo + '|' + r.piano] ||= []).push(r);
  }

  const items = [];
  for (const b of B) {
    for (const L of b.lv) {
      let mode;
      if (lvl === 'all') mode = 'norm';
      else if (L === lvl) mode = 'act';
      else if (L < lvl) mode = 'fade';
      else mode = 'ghost';
      const isSel = !!(selR && selR.corpo === b.id && selR.piano === L);
      const zb = L * SP, zt = zb + TH;
      const cen = P((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, zt);
      items.push({ b, L, mode, isSel, zb, zt, depth: L * 1000 + cen[2] });
    }
  }
  items.sort((a, b) => a.depth - b.depth);

  const pts = [];
  const add = (p) => { pts.push(p); return p; };
  const edges = [
    { a: [0, 0], b: [1, 0], n: [0, -1] },
    { a: [1, 0], b: [1, 1], n: [1, 0] },
    { a: [1, 1], b: [0, 1], n: [0, 1] },
    { a: [0, 1], b: [0, 0], n: [-1, 0] }
  ];
  const rawFaces = items.map((it) => {
    const b = it.b;
    const X = (f) => (f ? b.x1 : b.x0);
    const Y = (f) => (f ? b.y1 : b.y0);
    const sides = [];
    for (const e of edges) {
      const ny = e.n[0] * s + e.n[1] * c;
      if (ny > 0.001) {
        sides.push({
          poly: [add(P(X(e.a[0]), Y(e.a[1]), it.zt)), add(P(X(e.b[0]), Y(e.b[1]), it.zt)), add(P(X(e.b[0]), Y(e.b[1]), it.zb)), add(P(X(e.a[0]), Y(e.a[1]), it.zb))],
          light: Math.abs(e.n[1]) > 0.5
        });
      }
    }
    const top = [add(P(b.x0, b.y0, it.zt)), add(P(b.x1, b.y0, it.zt)), add(P(b.x1, b.y1, it.zt)), add(P(b.x0, b.y1, it.zt))];
    return { it, sides, top, cen: P((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, it.zt) };
  });
  const levels = mappa.livelli || [...new Set(B.flatMap((b) => b.lv))].sort((a, b) => a - b);
  const labelRaw = levels.map((L) => ({ L, p: add(P(bx0 - 0.8, by0 + 1, L * SP + TH / 2)) }));

  const W = width, H = height;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
  }
  const fx0 = 40, fx1 = W - 62, fy0 = 46, fy1 = H - 34;
  const f = Math.min((fx1 - fx0) / (maxX - minX), (fy1 - fy0) / (maxY - minY));
  const ox = fx0 + ((fx1 - fx0) - (maxX - minX) * f) / 2 - minX * f;
  const oy = fy0 + ((fy1 - fy0) - (maxY - minY) * f) / 2 - minY * f;
  const sx = (p) => p[0] * f + ox;
  const sy = (p) => p[1] * f + oy;
  const poly = (arr) => 'polygon(' + arr.map((p) => sx(p).toFixed(1) + 'px ' + sy(p).toFixed(1) + 'px').join(', ') + ')';

  function colors(it) {
    if (it.isSel) return { top: '#F43F5E', a: '#E11D48', b: '#9F1239' };
    if (it.b.node) return it.mode === 'act' ? { top: '#60A5FA', a: '#2563EB', b: '#1E40AF' } : { top: '#3B82F6', a: '#1D4ED8', b: '#1E3A8A' };
    if (it.mode === 'act') return { top: '#E2E8F0', a: '#94A3B8', b: '#64748B' };
    return { top: '#64748B', a: '#475569', b: '#334155' };
  }
  function opacity(it) {
    if (it.isSel) return 1;
    if (it.mode === 'fade') return 0.2;
    if (it.mode === 'ghost') return 0.06;
    return 1;
  }

  const corpi = mappa.corpi || {};
  const faces = [], blockLabels = [], markers = [];
  let pin = null;
  for (const r of rawFaces) {
    const it = r.it, col = colors(it), op = opacity(it);
    const pulse = it.isSel ? ' jpulse' : '';
    for (const sd of r.sides) {
      faces.push(html`<div class="mf${pulse}" aria-hidden="true" style="${`clip-path: ${poly(sd.poly)}; background: ${sd.light ? col.a : col.b}; opacity: ${op}`}"></div>`);
    }
    const list = byBlockLevel[it.b.id + '|' + it.L] || [];
    const clickable = (it.mode === 'act' || it.mode === 'norm') && list.length > 0;
    const topStyle = `clip-path: ${poly(r.top)}; background: ${col.top}; opacity: ${op}`;
    if (clickable) {
      const label = `Livello ${it.L}, corpo ${corpi[it.b.id]?.label || it.b.id}: ${list.map((x) => x.nome).join(', ')}`;
      faces.push(html`<button type="button" class="mf mf-btn${pulse}" data-act="mapPick" data-id="${list[0].id}" data-liv="${it.L}" aria-label="${label}" style="${topStyle}"></button>`);
    } else {
      faces.push(html`<div class="mf${pulse}" aria-hidden="true" style="${topStyle}"></div>`);
    }
    if (it.mode === 'act' && it.b.label) {
      blockLabels.push(html`<span class="map-blabel" style="${`left: ${sx(r.cen).toFixed(1)}px; top: ${sy(r.cen).toFixed(1)}px; color: ${it.isSel ? '#FFFFFF' : '#0F172A'}`}">${it.b.label}</span>`);
    }
    const visible = it.mode === 'act' || it.mode === 'norm';
    for (const m of mappa.markers || []) {
      if (visible && m.corpo === it.b.id && m.liv === it.L) {
        markers.push(html`<span class="map-marker" style="${`left: ${sx(r.cen).toFixed(1)}px; top: ${(sy(r.cen) + (m.dy || 0)).toFixed(1)}px`}"><span class="dot" style="${`background: ${m.dot}`}"></span>${m.text}</span>`);
      }
    }
    if (it.isSel) pin = { x: sx(r.cen).toFixed(1), y: (sy(r.cen) - 4).toFixed(1), text: selR.nome };
  }
  const floorLabels = labelRaw.map((l) => {
    const active = lvl === l.L;
    const hidden = lvl !== 'all' && l.L > lvl;
    const css = active ? 'background: #FFFFFF; color: #0F172A' : hidden ? 'color: rgba(203,213,225,0.35)' : 'color: #CBD5E1';
    return html`<span class="map-flabel" style="${`left: ${Math.max(sx(l.p), 34).toFixed(1)}px; top: ${sy(l.p).toFixed(1)}px; ${css}`}">L${l.L}</span>`;
  });

  return html`
    ${faces}${floorLabels}${blockLabels}${markers}
    ${pin && html`<div class="map-pin" aria-hidden="true" style="${`left: ${pin.x}px; top: ${pin.y}px`}"><span class="t" style="${`transform: translateX(${pinShift(Number(pin.x), W)}px)`}">${pin.text}</span><span class="stick"></span><span class="head"></span></div>`}
    <div class="map-ctrl">
      <button type="button" class="map-cbtn" data-act="mapRot" data-d="-45" aria-label="Ruota a sinistra">${raw(ICON_ROT_L)}</button>
      <button type="button" class="map-cbtn" data-act="mapRot" data-d="45" aria-label="Ruota a destra">${raw(ICON_ROT_R)}</button>
      <button type="button" class="map-cbtn${exp ? ' on' : ''}" data-act="mapExp" aria-label="${exp ? 'Unisci i piani' : 'Separa i piani'}" aria-pressed="${exp}">${raw(ICON_LAYERS)}</button>
    </div>
    <div class="map-legend" aria-hidden="true">
      <span><span class="sw" style="background: #3B82F6"></span>Scale / ascensori</span>
      <span><span class="sw" style="background: #F43F5E"></span>Reparto</span>
    </div>`;
}

// Keeps the pin's label (max 200px wide, centred on the pin) inside the stage.
function pinShift(x, W) {
  const half = 106;
  return Math.max(0, half - x) - Math.max(0, x + half - W);
}

const svg = (d, w = 20) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON_ROT_L = svg('<path d="M4 12a8 8 0 1 0 2.5-5.8"></path><path d="M4 4v5h5"></path>');
const ICON_ROT_R = svg('<path d="M20 12a8 8 0 1 1-2.5-5.8"></path><path d="M20 4v5h-5"></path>');
const ICON_LAYERS = svg('<path d="M12 3l9 5-9 5-9-5z"></path><path d="M3 16l9 5 9-5"></path>');
