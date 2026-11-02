import { html, raw } from './util.js';

// Axonometric "exploded floors" view of a hospital, drawn with clip-path polygons.
// `mappa`   = { blocks: [{id, x0, y0, x1, y1, lv: [levels], label, node}], corpi, livelli, rot }
// `reparti` = wards of this hospital with `corpo` (block id), `piano` (level) and optional `punto` {x, y}.
// `target`  = block/point to highlight: { corpo, liv, punto?, text } (defaults to the selected ward).
// `points`  = extra markers (entrances): { corpo, liv, punto?, text, dot }.
// `pick`    = every visible block top becomes a button (used to choose a position).
// The returned markup carries `geo.unproject(sx, sy, liv)`, which turns a click on the stage
// back into plan coordinates on that level.
export function renderMap({ mappa, reparti, sel, lvl, rot, exp, width, height = 300, target, points = [], pick = false }) {
  const B = mappa.blocks || [];
  const byId = Object.fromEntries(B.map((b) => [b.id, b]));
  const selR = sel ? reparti.find((r) => r.id === sel) || null : null;
  const hi = target || (selR && selR.corpo != null ? { corpo: selR.corpo, liv: selR.piano, punto: selR.punto, text: selR.nome } : null);
  const th = (rot * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
  const TH = 7, T = 0.5, K = 10;

  let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
  for (const b of B) {
    bx0 = Math.min(bx0, b.x0); bx1 = Math.max(bx1, b.x1);
    by0 = Math.min(by0, b.y0); by1 = Math.max(by1, b.y1);
  }
  const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;

  // Floor spacing: at any screen column a floor covers about (plan depth / cos θ) of depth, capped
  // by the depth of the whole plan. Spacing floors more than that keeps them from interleaving
  // whatever the rotation; "separa i piani" adds extra air.
  let yrMin = Infinity, yrMax = -Infinity;
  for (const b of B) {
    for (const [x, y] of [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]]) {
      const yr = (x - cx) * s + (y - cy) * c;
      yrMin = Math.min(yrMin, yr); yrMax = Math.max(yrMax, yr);
    }
  }
  const depth = Math.min((by1 - by0) / Math.max(Math.abs(c), 0.2), yrMax - yrMin) * K * T;
  const SP = depth + TH + (exp ? 40 : 12);
  const top = (L) => L * SP + TH;

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

  const modeOf = (L) => (lvl === 'all' ? 'norm' : L === lvl ? 'act' : L < lvl ? 'fade' : 'ghost');
  const items = [];
  for (const b of B) {
    for (const L of b.lv) {
      const isSel = !!(hi && hi.corpo === b.id && hi.liv === L);
      const zb = L * SP, zt = zb + TH;
      const cen = P((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, zt);
      items.push({ b, L, mode: modeOf(L), isSel, zb, zt, depth: L * 1000 + cen[2] });
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
    const topPoly = [add(P(b.x0, b.y0, it.zt)), add(P(b.x1, b.y0, it.zt)), add(P(b.x1, b.y1, it.zt)), add(P(b.x0, b.y1, it.zt))];
    return { it, sides, top: topPoly, cen: P((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, it.zt) };
  });
  const levels = mappa.livelli || [...new Set(B.flatMap((b) => b.lv))].sort((a, b) => a - b);
  const labelRaw = levels.map((L) => ({ L, p: add(P(bx0 - 0.8, by0 + 1, L * SP + TH / 2)) }));

  const W = width, H = height;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
  }
  // Margins keep the drawing clear of the floor labels (left), controls (right) and legend (bottom).
  const big = W > 600;
  const fx0 = big ? 64 : 40, fx1 = W - (big ? 90 : 62), fy0 = big ? 56 : 46, fy1 = H - (big ? 64 : 34);
  const f = Math.min((fx1 - fx0) / (maxX - minX), (fy1 - fy0) / (maxY - minY));
  const ox = fx0 + ((fx1 - fx0) - (maxX - minX) * f) / 2 - minX * f;
  const oy = fy0 + ((fy1 - fy0) - (maxY - minY) * f) / 2 - minY * f;
  const sx = (p) => p[0] * f + ox;
  const sy = (p) => p[1] * f + oy;
  const poly = (arr) => 'polygon(' + arr.map((p) => sx(p).toFixed(1) + 'px ' + sy(p).toFixed(1) + 'px').join(', ') + ')';

  // Screen position of a block (its centre) or of a precise point, on a level.
  function spot(corpo, liv, punto) {
    const b = byId[corpo];
    if (!b || liv == null) return null;
    const p = punto ? P(punto.x, punto.y, top(liv)) : P((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, top(liv));
    return { x: sx(p), y: sy(p) };
  }
  const visible = (liv) => lvl === 'all' || liv === lvl;

  function colors(it) {
    if (it.isSel) return { top: '#F43F5E', a: '#E11D48', b: '#9F1239' };
    if (it.b.node) return it.mode === 'act' ? { top: '#60A5FA', a: '#2563EB', b: '#1E40AF' } : { top: '#3B82F6', a: '#1D4ED8', b: '#1E3A8A' };
    if (it.mode === 'act') return { top: '#E2E8F0', a: '#94A3B8', b: '#64748B' };
    return { top: '#64748B', a: '#475569', b: '#334155' };
  }
  function opacity(it) {
    if (it.isSel) return hi?.punto ? 0.85 : 1;
    if (it.mode === 'fade') return 0.2;
    if (it.mode === 'ghost') return 0.06;
    return 1;
  }

  const corpi = mappa.corpi || {};
  const faces = [], blockLabels = [];
  for (const r of rawFaces) {
    const it = r.it, col = colors(it), op = opacity(it);
    const pulse = it.isSel && !hi?.punto ? ' jpulse' : '';
    for (const sd of r.sides) {
      faces.push(html`<div class="mf${pulse}" aria-hidden="true" style="${`clip-path: ${poly(sd.poly)}; background: ${sd.light ? col.a : col.b}; opacity: ${op}`}"></div>`);
    }
    const list = byBlockLevel[it.b.id + '|' + it.L] || [];
    const reachable = it.mode === 'act' || it.mode === 'norm';
    const topStyle = `clip-path: ${poly(r.top)}; background: ${col.top}; opacity: ${op}`;
    const name = corpi[it.b.id]?.label || it.b.label || it.b.id;
    if (pick && reachable) {
      faces.push(html`<button type="button" class="mf mf-btn${pulse}" data-act="pickBlock" data-corpo="${it.b.id}" data-liv="${it.L}" aria-label="${`Livello ${it.L}, corpo ${name}`}" style="${topStyle}"></button>`);
    } else if (!pick && reachable && list.length > 0) {
      const label = `Livello ${it.L}, corpo ${name}: ${list.map((x) => x.nome).join(', ')}`;
      faces.push(html`<button type="button" class="mf mf-btn${pulse}" data-act="mapPick" data-id="${list[0].id}" data-liv="${it.L}" aria-label="${label}" style="${topStyle}"></button>`);
    } else {
      faces.push(html`<div class="mf${pulse}" aria-hidden="true" style="${topStyle}"></div>`);
    }
    if (it.mode === 'act' && it.b.label) {
      // On a wide stage, with one level shown, write the wards inside the block like the paper plan.
      const b = it.b;
      const span = Math.abs(sx(P(b.x1, (b.y0 + b.y1) / 2, it.zt)) - sx(P(b.x0, (b.y0 + b.y1) / 2, it.zt)));
      const names = big && !b.node && list.length > 0 && span > 70 ? list.map((x) => x.nome.split(' – ')[0]).join(' · ') : '';
      const css = `left: ${sx(r.cen).toFixed(1)}px; top: ${sy(r.cen).toFixed(1)}px; color: ${it.isSel ? '#FFFFFF' : '#0F172A'}`;
      blockLabels.push(names
        ? html`<span class="map-blabel named" style="${css + `; max-width: ${Math.round(span - 12)}px`}"><b>${b.label}</b>${names}</span>`
        : html`<span class="map-blabel" style="${css}">${b.label}</span>`);
    }
  }

  const markers = points
    .filter((m) => visible(m.liv))
    .map((m) => {
      const p = spot(m.corpo, m.liv, m.punto);
      if (!p) return '';
      return html`<span class="map-marker${m.punto ? ' exact' : ''}" style="${`left: ${p.x.toFixed(1)}px; top: ${p.y.toFixed(1)}px`}"><span class="dot" style="${`background: ${m.dot}`}"></span>${m.text}</span>`;
    });

  let pin = '';
  if (hi && hi.liv != null) {
    const p = spot(hi.corpo, hi.liv, hi.punto);
    if (p) {
      pin = html`<div class="map-pin${hi.punto ? ' exact' : ''}" aria-hidden="true" style="${`left: ${p.x.toFixed(1)}px; top: ${(p.y - (hi.punto ? 0 : 4)).toFixed(1)}px`}">
        ${hi.text && html`<span class="t" style="${`transform: translateX(${pinShift(p.x, W)}px)`}">${hi.text}</span>`}<span class="stick"></span><span class="head"></span>
      </div>`;
    }
  }

  const floorLabels = labelRaw.map((l) => {
    const active = lvl === l.L;
    const hidden = lvl !== 'all' && l.L > lvl;
    const css = active ? 'background: #FFFFFF; color: #0F172A' : hidden ? 'color: rgba(203,213,225,0.35)' : 'color: #CBD5E1';
    return html`<span class="map-flabel" style="${`left: ${Math.max(sx(l.p), 34).toFixed(1)}px; top: ${sy(l.p).toFixed(1)}px; ${css}`}">L${l.L}</span>`;
  });

  const out = html`
    ${faces}${floorLabels}${blockLabels}${markers}${pin}
    <div class="map-ctrl">
      <button type="button" class="map-cbtn" data-act="mapRot" data-d="-45" aria-label="Ruota a sinistra">${raw(ICON_ROT_L)}</button>
      <button type="button" class="map-cbtn" data-act="mapRot" data-d="45" aria-label="Ruota a destra">${raw(ICON_ROT_R)}</button>
      <button type="button" class="map-cbtn${exp ? ' on' : ''}" data-act="mapExp" aria-label="${exp ? 'Unisci i piani' : 'Separa i piani'}" aria-pressed="${exp}">${raw(ICON_LAYERS)}</button>
    </div>
    <div class="map-legend" aria-hidden="true">
      <span><span class="sw" style="background: #3B82F6"></span>Scale / ascensori</span>
      <span><span class="sw" style="background: #F43F5E"></span>${pick ? 'Posizione scelta' : 'Reparto'}</span>
      ${points.length > 0 && html`<span><span class="sw round" style="background: #22C55E"></span>Ingressi</span>`}
    </div>`;

  out.geo = {
    // Inverse of P() on the top face of level `liv`: stage pixels -> plan coordinates.
    unproject(px, py, liv) {
      const xr = (px - ox) / f / K;
      const yr = ((py - oy) / f + top(liv)) / (K * T);
      return { x: xr * c + yr * s + cx, y: -xr * s + yr * c + cy };
    },
    block: (id) => byId[id]
  };
  return out;
}

// Keeps the pin's label (max 260px wide on desktop, centred on the pin) inside the stage.
function pinShift(x, W) {
  const half = W > 600 ? 136 : 106;
  return Math.max(0, half - x) - Math.max(0, x + half - W);
}

const svg = (d, w = 20) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON_ROT_L = svg('<path d="M4 12a8 8 0 1 0 2.5-5.8"></path><path d="M4 4v5h5"></path>');
const ICON_ROT_R = svg('<path d="M20 12a8 8 0 1 1-2.5-5.8"></path><path d="M20 4v5h-5"></path>');
const ICON_LAYERS = svg('<path d="M12 3l9 5-9 5-9-5z"></path><path d="M3 16l9 5 9-5"></path>');
