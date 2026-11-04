import { html } from '../util.js';
import { highlightOf, labelSpace, pinHtml, routeSvg, controls, hintAndLegend } from './common.js';

// Axonometric "exploded floors" view of a hospital, drawn with clip-path polygons.
// `mappa`   = { blocks: [{id, x0, y0, x1, y1, lv: [levels], label, node}], corpi, livelli, rot }
// `reparti` = wards of this hospital with `corpo` (block id), `piano` (level) and optional `punto` {x, y}.
// `target`  = block/point to highlight: { corpo, liv, punto?, text } (defaults to the selected ward).
// `points`  = extra markers (entrances): { corpo, liv, punto?, text, amb }.
// `pick`    = every visible block top becomes a button (used to choose a position).
// `route`   = path to draw: [{ corpo, liv, punto?, kind: 'ing' | 'asc' | 'rep' }], entrance first.
// `floorTag(L)`, `floorName(L)`, `corpoWord`: how this hospital names floors and blocks.
// The returned markup carries `geo.unproject(sx, sy, liv)`, which turns a click on the stage
// back into plan coordinates on that level, and `geo.block(id)`.
export function renderMap({
  mappa, reparti, sel, lvl, rot, exp, width, height = 300, target, points = [], pick = false, route = null,
  zoom = 1, panX = 0, panY = 0, floorTag = (L) => 'L' + L, floorName = (L) => 'Livello ' + L, corpoWord = 'Corpo'
}) {
  const B = mappa.blocks || [];
  const byId = Object.fromEntries(B.map((b) => [b.id, b]));
  const hi = highlightOf(reparti, sel, target);
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

  // How each level looks: all shown (norm), the one chosen (act), below it (fade), above it (ghost).
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
  // Margins keep the drawing clear of the floor labels (left), controls (right) and legend (bottom).
  const big = W > 600;
  const fx0 = big ? 64 : 40, fx1 = W - (big ? 90 : 62), fy0 = big ? 56 : 46, fy1 = H - (big ? 64 : 34);
  // Scale and offset that centre `arr` in the frame; `maxFit` stops one small floor being blown up too much.
  const fitTo = (arr, maxFit = Infinity) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of arr) {
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
    }
    const k = Math.min((fx1 - fx0) / Math.max(x1 - x0, 1), (fy1 - fy0) / Math.max(y1 - y0, 1), maxFit);
    return { fit: k, x: fx0 + ((fx1 - fx0) - (x1 - x0) * k) / 2 - x0 * k, y: fy0 + ((fy1 - fy0) - (y1 - y0) * k) / 2 - y0 * k };
  };
  // Plan point (block centre or precise point) on the top face of a level, before fitting.
  const rawAt = (corpo, liv, punto) => {
    const b = byId[corpo];
    if (!b || liv == null) return null;
    return punto ? P(punto.x, punto.y, top(liv)) : P((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, top(liv));
  };
  const whole = fitTo(pts);
  let view = whole;
  if (lvl !== 'all') {
    // With one level shown, the drawing is fitted to that level (plus what's drawn on it: the route,
    // the entrances, the chosen ward) instead of to the whole stack, so it fills the stage.
    const focus = [];
    for (const r of rawFaces) {
      if (r.it.L !== lvl) continue;
      focus.push(...r.top);
      for (const sd of r.sides) focus.push(...sd.poly);
    }
    const lp = labelRaw.find((l) => l.L === lvl);
    if (lp) focus.push(lp.p);
    for (const p of route || []) { const q = rawAt(p.corpo, p.liv, p.punto); if (q) focus.push(q); }
    for (const m of points) if (m.liv === lvl) { const q = rawAt(m.corpo, m.liv, m.punto); if (q) focus.push(q); }
    if (hi && hi.liv != null) { const q = rawAt(hi.corpo, hi.liv, hi.punto); if (q) focus.push(q); }
    if (focus.length) view = fitTo(focus, whole.fit * 2.4);
  }
  const fit = view.fit, fitX = view.x, fitY = view.y;
  // Zoom scales the fitted drawing around the stage centre, then the pan shifts it (in pixels).
  const f = fit * zoom;
  const ox = W / 2 + (fitX - W / 2) * zoom + panX;
  const oy = H / 2 + (fitY - H / 2) * zoom + panY;
  const sx = (p) => p[0] * f + ox;
  const sy = (p) => p[1] * f + oy;
  const poly = (arr) => 'polygon(' + arr.map((p) => sx(p).toFixed(1) + 'px ' + sy(p).toFixed(1) + 'px').join(', ') + ')';

  // Screen position of a block (its centre) or of a precise point, on a level.
  function spot(corpo, liv, punto) {
    const p = rawAt(corpo, liv, punto);
    return p ? { x: sx(p), y: sy(p) } : null;
  }
  const visible = (liv) => lvl === 'all' || liv === lvl;

  // Colour of a block (classes coloured by app.css): the chosen one, lifts/stairs, the active level, the rest.
  const tone = (it) => (it.isSel ? 'sel' : it.b.node ? (it.mode === 'act' ? 'lift-on' : 'lift') : it.mode === 'act' ? 'on' : 'base');
  // Levels below the chosen one fade, those above almost vanish; a precise point leaves its block lighter.
  const shade = (it) => (it.isSel ? (hi?.punto ? ' exact' : '') : it.mode === 'fade' ? ' fade' : it.mode === 'ghost' ? ' ghost' : '');

  const corpi = mappa.corpi || {};
  const space = labelSpace();
  const faces = [], cands = [];
  for (const r of rawFaces) {
    const it = r.it;
    const cls = `mf t-${tone(it)}${shade(it)}${it.isSel && !hi?.punto ? ' jpulse' : ''}`;
    for (const sd of r.sides) {
      faces.push(html`<div class="${cls} ${sd.light ? 'side-a' : 'side-b'}" aria-hidden="true" style="${`clip-path: ${poly(sd.poly)}`}"></div>`);
    }
    const list = byBlockLevel[it.b.id + '|' + it.L] || [];
    const reachable = it.mode === 'act' || it.mode === 'norm';
    const topStyle = `clip-path: ${poly(r.top)}`;
    const name = corpi[it.b.id]?.label || it.b.label || it.b.id;
    if (pick && reachable) {
      faces.push(html`<button type="button" class="${cls} face mf-btn" data-act="pickBlock" data-corpo="${it.b.id}" data-liv="${it.L}" aria-label="${`${floorName(it.L)}, ${corpoWord.toLowerCase()} ${name}`}" style="${topStyle}"></button>`);
    } else if (!pick && reachable && list.length > 0) {
      const label = `${floorName(it.L)}, ${corpoWord.toLowerCase()} ${name}: ${list.map((x) => x.nome).join(', ')}`;
      faces.push(html`<button type="button" class="${cls} face mf-btn" data-act="mapPick" data-id="${list[0].id}" data-liv="${it.L}" aria-label="${label}" style="${topStyle}"></button>`);
    } else {
      faces.push(html`<div class="${cls} face" aria-hidden="true" style="${topStyle}"></div>`);
    }
    // Ward names written on every visible block top, like the paper plan, whenever the top is big
    // enough on screen to hold readable text (zooming in makes room for more of them).
    const b = it.b;
    if (reachable && !b.node && (list.length > 0 || (it.mode === 'act' && b.label))) {
      const my = (b.y0 + b.y1) / 2, mx = (b.x0 + b.x1) / 2;
      const span = Math.hypot(sx(P(b.x1, my, it.zt)) - sx(P(b.x0, my, it.zt)), sy(P(b.x1, my, it.zt)) - sy(P(b.x0, my, it.zt)));
      const faceH = Math.abs(sy(P(mx, b.y1, it.zt)) - sy(P(mx, b.y0, it.zt)));
      const size = Math.min(13, Math.max(big ? 8 : 9.5, faceH * 0.62));
      const fits = span >= 46 && faceH >= 8;
      // Light text on the dark tops of the "all levels" view, dark text on the light active level.
      const ink = it.isSel || it.mode === 'norm' ? 'light' : 'dark';
      const css = `left: ${sx(r.cen).toFixed(1)}px; top: ${sy(r.cen).toFixed(1)}px; font-size: ${size.toFixed(1)}px`;
      const x = sx(r.cen), y = sy(r.cen), h = size * 1.3;
      const short = b.label ? { w: b.label.length * size * 0.7 + 4, h, html: html`<span class="map-blabel ${ink}" style="${css}">${b.label}</span>` } : null;
      const prio = it.isSel ? 0 : it.mode === 'act' ? 1 : 2;
      if (fits && list.length > 0) {
        const names = list.map((x) => x.nome.split(' – ')[0]).join(' · ');
        const w = Math.min(span - 10, ((b.label?.length || 0) + 1) * size * 0.7 + names.length * size * 0.56 + 6);
        cands.push({ x, y, prio, variants: [{ w, h, html: html`<span class="map-blabel ${ink} named" style="${css + `; max-width: ${Math.round(span - 10)}px`}">${b.label && html`<b>${b.label}</b>`}${names}</span>` }, short] });
      } else if (it.mode === 'act' && short) {
        cands.push({ x, y, prio, variants: [short] });
      }
    }
  }

  // Entrances. The route's entrance stays labelled even when its floor is not the one shown.
  const start = route?.[0];
  const markers = points
    .filter((m) => visible(m.liv) || (start && m.corpo === start.corpo && m.liv === start.liv))
    .map((m) => {
      const p = spot(m.corpo, m.liv, m.punto);
      if (!p) return '';
      space.take({ x: p.x, y: p.y, w: m.text.length * 6.4 + 22, h: 22 });
      return html`<span class="map-marker${m.punto ? ' exact' : ''}" style="${`left: ${p.x.toFixed(1)}px; top: ${p.y.toFixed(1)}px`}"><span class="dot${m.amb ? ' amb' : ''}"></span>${m.text}</span>`;
    });

  // Route: walk on the entrance floor, ride the lift (vertical segment), walk to the ward.
  const rpts = (route || []).map((p) => ({ ...p, at: spot(p.corpo, p.liv, p.punto) })).filter((p) => p.at);
  let path = '';
  if (rpts.length >= 2) {
    const ride = rpts.filter((p) => p.kind === 'asc');
    path = routeSvg(W, H, rpts, html`
      ${ride.length === 2 && html`<path class="ride" d="${`M${ride[0].at.x.toFixed(1)} ${ride[0].at.y.toFixed(1)} L${ride[1].at.x.toFixed(1)} ${ride[1].at.y.toFixed(1)}`}"></path>`}
      ${rpts.filter((p) => p.kind !== 'rep').map((p) => html`<circle class="${p.kind}" cx="${p.at.x.toFixed(1)}" cy="${p.at.y.toFixed(1)}" r="${p.kind === 'ing' ? 7 : 5}"></circle>`)}`);
  }

  let pin = '';
  if (hi && hi.liv != null) {
    const p = spot(hi.corpo, hi.liv, hi.punto);
    if (p) {
      space.take({ x: p.x, y: p.y - 34, w: Math.min(200, (hi.text || '').length * 7.4 + 20), h: 30 });
      pin = pinHtml(p, hi, W, hi.punto ? 0 : -4);
    }
  }

  // Longest name first, the chosen block before the others; if the full text would cover a marker,
  // the pin or another label, fall back to the block letter alone, or leave it out.
  const blockLabels = space.place(cands);

  // Floors pushed off the stage by the fit (or under the hint line) get no label.
  const floorLabels = labelRaw.filter((l) => sy(l.p) > 34 && sy(l.p) < H - 40).map((l) => {
    const state = lvl === l.L ? ' on' : lvl !== 'all' && l.L > lvl ? ' off' : '';
    return html`<span class="map-flabel${state}" style="${`left: ${Math.max(sx(l.p), 34).toFixed(1)}px; top: ${sy(l.p).toFixed(1)}px`}">${floorTag(l.L)}</span>`;
  });

  const out = html`
    ${faces}${floorLabels}${blockLabels}${path}${markers}${pin}
    ${controls({ rotate: true, exp, zoom, panX, panY })}
    ${hintAndLegend(big ? 'Trascina per ruotare · rotella o due dita per lo zoom' : 'Trascina: ruota · Due dita: zoom', [
      ['lift', 'Scale / ascensori'],
      ['sel', pick ? 'Posizione scelta' : 'Reparto'],
      points.length > 0 && ['round ing', 'Ingressi'],
      rpts.length >= 2 && ['line', 'Percorso']
    ])}`;

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
