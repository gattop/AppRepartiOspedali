import { html } from '../util.js';
import { highlightOf, labelSpace, pinHtml, routeSvg, controls, hintAndLegend, inkOn } from './common.js';

// 3D view of a hospital: every block is a stack of floor plates, drawn as SVG polygons.
// `mappa`   = { blocks, corpi, livelli, rot, tipo }. A block is { id, lv: [levels], label } with
//             either a rectangle (x0, y0, x1, y1; `node` for stairs/lifts) or an outline
//             (`poly: [[x, y]...]`, `l` = label point, `colore`), as in the flat plan (map2d.js).
// Two layouts:
//   - one building (Jesi): the floors are pulled apart, so every floor shows its ward names;
//   - several buildings (`tipo: 'pianta'`, Senigallia): each building is a compact stack in its
//     own colour; choosing a level shows that floor in every building.
// `reparti` = wards of this hospital with `corpo` (block id), `piano` (level) and optional `punto` {x, y}.
// `target`  = block/point to highlight: { corpo, liv, punto?, text } (defaults to the selected ward).
// `points`  = extra markers (entrances): { corpo, liv, punto?, text, amb }.
// `pick`    = every visible block top becomes a button (used to choose a position).
// `route`   = path to draw: [{ corpo, liv, punto?, kind: 'ing' | 'asc' | 'rep' }], entrance first.
// `rot0`    = the angle the map opens at: the scale is chosen there and kept while rotating.
// `floorTag(L)`, `floorName(L)`, `corpoWord`: how this hospital names floors and blocks.
// Returns { draw, ui, geo }: the drawing, the buttons/legend over it, and `geo.unproject(sx, sy, liv)`
// (a click on the stage back into plan coordinates on that level) with `geo.block(id)` (its bounding box).

const T = 0.5; // how much the plan is squashed vertically (the viewing angle)

// A block with its outline, bounding box, label point and the outward normal of every edge.
function shape(b) {
  const pts = b.poly || [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, area = 0;
  pts.forEach(([x, y], i) => {
    const [u, v] = pts[(i + 1) % pts.length];
    area += x * v - u * y;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  });
  const sg = area >= 0 ? 1 : -1;
  const edges = pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
    return { p, q, nx: (sg * dy) / len, ny: (-sg * dx) / len };
  });
  const [ax, ay] = b.l || [(x0 + x1) / 2, (y0 + y1) / 2];
  return { ...b, pts, edges, x0, x1, y0, y1, ax, ay };
}

const farthest = (px, py, arr) => arr.reduce((m, [x, y]) => Math.max(m, Math.hypot(x - px, y - py)), 1e-6);

export function renderMap({
  mappa, reparti, sel, lvl, rot, rot0 = rot, exp, width, height = 300, target, points = [], pick = false, route = null,
  zoom = 1, panX = 0, panY = 0, floorTag = (L) => 'L' + L, floorName = (L) => 'Livello ' + L, corpoWord = 'Corpo'
}) {
  const stacked = mappa.tipo === 'pianta';
  const B = (mappa.blocks || []).map(shape);
  const byId = Object.fromEntries(B.map((b) => [b.id, b]));
  const hi = highlightOf(reparti, sel, target);
  const th = (rot * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);

  let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
  for (const b of B) {
    bx0 = Math.min(bx0, b.x0); bx1 = Math.max(bx1, b.x1);
    by0 = Math.min(by0, b.y0); by1 = Math.max(by1, b.y1);
  }
  const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
  const verts = B.flatMap((b) => b.pts);
  const allLv = B.flatMap((b) => b.lv);
  const Lmin = Math.min(...allLv), Lmax = Math.max(...allLv);
  // Plan units to drawing units (before fitting to the stage), and the thickness of a floor plate.
  const K = stacked ? 290 / Math.max(bx1 - bx0, by1 - by0, 1) : 10;
  const TH = stacked ? 6 : 7;

  const W = width, H = height;
  // Margins keep the drawing clear of the floor labels (left), controls (right) and legend (bottom).
  const big = W > 600;
  // (A site of several buildings has no floor tags and, on phones, uses the full width: the buttons
  // just sit over its corner, as on the flat plan.)
  const fx0 = stacked ? (big ? 28 : 6) : (big ? 64 : 40), fx1 = W - (stacked && !big ? 6 : big ? 90 : 62), fy0 = big ? 56 : 46, fy1 = H - (big ? 64 : 34);
  const availW = fx1 - fx0, availH = fy1 - fy0;

  // ---- scale and floor spacing. The model turns around a fixed axis at a constant scale: the width is
  // fitted to the circle the plan sweeps while rotating, so nothing grows, shrinks or slides as it spins.
  const depthRange = (cs, sn) => {
    let lo = Infinity, hi2 = -Infinity;
    for (const [x, y] of verts) {
      const yr = (x - cx) * sn + (y - cy) * cs;
      lo = Math.min(lo, yr); hi2 = Math.max(hi2, yr);
    }
    return [lo, hi2];
  };
  const R = farthest(cx, cy, verts);
  const kW = availW / (2 * R * K);
  const steps = Math.max(Lmax - Lmin, 1);
  let SP, whole, vTop, vBottom;
  if (stacked) {
    // Buildings: floors sit on each other ("separa i piani" opens them up).
    SP = TH + (exp ? 18 : 1.5);
    whole = Math.min(kW, availH / (2 * R * K * T + steps * SP + TH));
    vTop = -R * K * T - (Lmax * SP + TH);
    vBottom = R * K * T - Lmin * SP;
  } else {
    // Floors pulled apart: at any screen column a floor covers about (plan depth / cos θ) of depth,
    // capped by the depth of the whole plan; spacing floors more than that keeps them from
    // interleaving. The scale is the one that fits the opening view; where the spacing would not
    // fit at that scale (the building seen from its end) the floors close up instead of shrinking.
    const spacing = (cs, sn) => {
      const [lo, hi2] = depthRange(cs, sn);
      return { span: hi2 - lo, sp: Math.min((by1 - by0) / Math.max(Math.abs(cs), 0.2), hi2 - lo) * K * T + TH + (exp ? 40 : 12) };
    };
    const th0 = (rot0 * Math.PI) / 180;
    const open = spacing(Math.cos(th0), Math.sin(th0));
    whole = Math.min(kW, availH / (open.span * K * T + steps * open.sp + TH));
    const now = spacing(c, s);
    SP = Math.max(TH + 2, Math.min(now.sp, (availH / whole - now.span * K * T - TH) / steps));
    const [lo, hi2] = depthRange(c, s);
    vTop = lo * K * T - (Lmax * SP + TH);
    vBottom = hi2 * K * T - Lmin * SP;
  }
  const top = (L) => L * SP + TH;

  // Plan position of a block (its label point) or of a precise point.
  const planAt = (corpo, punto) => {
    const b = byId[corpo];
    if (!b) return null;
    return punto ? [punto.x, punto.y] : [b.ax, b.ay];
  };

  // With one level shown, the view closes in on that level (plus what's drawn on it: the route, the
  // entrances, the chosen ward) and turns around its centre; `whole * 2.4` stops one small block
  // being blown up too much.
  let px = cx, py = cy, fit = whole;
  if (lvl !== 'all') {
    const fp = [];
    let zlo = lvl * SP, zhi = top(lvl);
    for (const b of B) if (b.lv.includes(lvl)) fp.push(...b.pts);
    const also = (corpo, liv, punto) => {
      const p = liv == null ? null : planAt(corpo, punto);
      if (!p) return;
      fp.push(p);
      zlo = Math.min(zlo, top(liv)); zhi = Math.max(zhi, top(liv));
    };
    for (const p of route || []) also(p.corpo, p.liv, p.punto);
    for (const m of points) if (m.liv === lvl) also(m.corpo, m.liv, m.punto);
    if (hi) also(hi.corpo, hi.liv, hi.punto);
    if (fp.length) {
      let fx = [Infinity, -Infinity], fy = [Infinity, -Infinity];
      for (const [x, y] of fp) { fx = [Math.min(fx[0], x), Math.max(fx[1], x)]; fy = [Math.min(fy[0], y), Math.max(fy[1], y)]; }
      px = (fx[0] + fx[1]) / 2; py = (fy[0] + fy[1]) / 2;
      const Rf = farthest(px, py, fp);
      fit = Math.min(availW / (2 * Rf * K), availH / (2 * Rf * K * T + (zhi - zlo)), whole * 2.4);
      vTop = -Rf * K * T - zhi;
      vBottom = Rf * K * T - zlo;
    }
  }

  // Plan point at height z -> drawing units, turning around the pivot (px, py); [2] is the depth.
  function P(x, y, z) {
    const xc = x - px, yc = y - py;
    const xr = xc * c - yc * s, yr = xc * s + yc * c;
    return [xr * K, yr * K * T - z, yr];
  }
  // The pivot sits in the middle of the frame; zoom scales around the stage centre, then the pan shifts it.
  const fitX = (fx0 + fx1) / 2, fitY = (fy0 + fy1) / 2 - ((vTop + vBottom) / 2) * fit;
  const f = fit * zoom;
  const ox = W / 2 + (fitX - W / 2) * zoom + panX;
  const oy = H / 2 + (fitY - H / 2) * zoom + panY;
  const sx = (p) => p[0] * f + ox;
  const sy = (p) => p[1] * f + oy;
  const poly = (arr) => arr.map((p) => sx(p).toFixed(1) + ',' + sy(p).toFixed(1)).join(' ');

  // Screen position of a block (its label point) or of a precise point, on a level.
  function spot(corpo, liv, punto) {
    const p = liv == null ? null : planAt(corpo, punto);
    if (!p) return null;
    const q = P(p[0], p[1], top(liv));
    return { x: sx(q), y: sy(q) };
  }
  const visible = (liv) => lvl === 'all' || liv === lvl;

  const byBlockLevel = {}, byBlock = {};
  for (const r of reparti) {
    if (r.corpo == null || r.piano == null) continue;
    (byBlockLevel[r.corpo + '|' + r.piano] ||= []).push(r);
    (byBlock[r.corpo] ||= []).push(r);
  }
  for (const list of Object.values(byBlock)) list.sort((a, b) => b.piano - a.piano);

  // How each level looks: all shown (norm), the one chosen (act), below it (fade), above it (ghost).
  const modeOf = (L) => (lvl === 'all' ? 'norm' : L === lvl ? 'act' : L < lvl ? 'fade' : 'ghost');
  const isHi = (b, L) => !!(hi && hi.corpo === b.id && hi.liv === L);
  const solid = (b, L) => isHi(b, L) || modeOf(L) === 'norm' || modeOf(L) === 'act';
  const items = [];
  for (const b of B) {
    for (const L of b.lv) {
      const zb = L * SP, zt = zb + TH;
      const above = b.lv.filter((x) => x > L);
      items.push({ b, L, mode: modeOf(L), isSel: isHi(b, L), zb, zt, isTop: !above.length, above: above.length ? Math.min(...above) : null, depth: L * 1000 + P((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, zt)[2] });
    }
  }
  // Painter's order: lower floors first, then back to front. With this projection a higher floor is
  // always further up the screen than a lower one in front of it, so the order holds at any angle.
  items.sort((a, b) => a.depth - b.depth);

  // Colour of a block (classes coloured by app.css): the building's own colour, or the chosen one,
  // lifts/stairs, the active level, the rest.
  const tone = (it) => (stacked ? 'own' : it.isSel ? 'sel' : it.b.node ? (it.mode === 'act' ? 'lift-on' : 'lift') : it.mode === 'act' ? 'on' : 'base');
  // Levels below the chosen one fade, those above almost vanish; a precise point leaves its block lighter.
  const shade = (it) => (it.isSel ? (hi?.punto ? ' exact' : '') : it.mode === 'fade' ? ' fade' : it.mode === 'ghost' ? ' ghost' : '');

  const corpi = mappa.corpi || {};
  const space = labelSpace();
  const faces = [], cands = [];
  const button = (act, data, label) => html`data-act="${act}" ${Object.entries(data).filter(([, v]) => v != null).map(([k, v]) => html`data-${k}="${v}" `)}role="button" tabindex="0" aria-label="${label}"`;
  for (const it of items) {
    const b = it.b;
    const cls = `mi t-${tone(it)}${shade(it)}${it.isSel ? ' sel' : ''}${it.isSel && !hi?.punto ? ' jpulse' : ''}`;
    const list = byBlockLevel[b.id + '|' + it.L] || [];
    const reachable = it.mode === 'act' || it.mode === 'norm';
    const name = corpi[b.id]?.label || b.label || b.id;
    const where = `${floorName(it.L)}, ${corpoWord.toLowerCase()} ${name}`;
    // In a compact stack the plate above hides this one's top.
    const covered = stacked && !exp && it.above != null && solid(b, it.above);

    const sides = [];
    for (const e of b.edges) {
      if (e.nx * s + e.ny * c <= 0.001) continue; // faces away from the viewer
      const quad = [P(e.p[0], e.p[1], it.zt), P(e.q[0], e.q[1], it.zt), P(e.q[0], e.q[1], it.zb), P(e.p[0], e.p[1], it.zb)];
      sides.push(html`<polygon class="${Math.abs(e.ny) > 0.5 ? 'side-a' : 'side-b'}" points="${poly(quad)}"></polygon>`);
    }
    const topPts = covered ? null : poly(b.pts.map(([x, y]) => P(x, y, it.zt)));

    let groupAct = '', topAct = '';
    if (pick && reachable) {
      // Choosing a position: tap the floor itself. `zl` is the surface tapped; `liv` also sets the
      // floor (not on a whole building seen with every level, where only its roof can be tapped).
      topAct = button('pickBlock', { corpo: b.id, zl: it.L, liv: stacked && lvl === 'all' ? null : it.L }, where);
    } else if (!pick && reachable) {
      // A tap anywhere on the plate opens its first ward; on a whole building, a floor without
      // wards opens the highest one that has some.
      const wards = list.length ? list : stacked && lvl === 'all' ? byBlock[b.id] || [] : [];
      if (wards.length) groupAct = button('mapPick', { id: wards[0].id, liv: wards[0].piano }, `${where}: ${(list.length ? list : wards).map((x) => x.nome).join(', ')}`);
    }
    faces.push(html`<g class="${cls}" ${groupAct} ${stacked ? html`style="--bc: ${b.colore}"` : ''}>${sides}${topPts && html`<polygon class="face" ${topAct} points="${topPts}"></polygon>`}</g>`);

    if (!reachable || b.node) continue;
    const cen = P(b.ax, b.ay, it.zt);
    const x = sx(cen), y = sy(cen);
    const prio = it.isSel ? 0 : it.mode === 'act' ? 1 : 2;
    const names = list.map((r) => r.nome.split(' – ')[0]).join(' · ');
    if (stacked) {
      // Buildings carry their letter on the roof; with one level shown, each also lists what's on that floor.
      if (covered || (lvl === 'all' ? !it.isTop : it.mode !== 'act')) continue;
      const style = `left: ${x.toFixed(1)}px; top: ${y.toFixed(1)}px; color: ${inkOn(b.colore)}`;
      const letter = { w: 16, h: 16, html: html`<span class="map-plabel" style="${style}"><b>${b.label || b.id}</b></span>` };
      // The ward names sit in a box (up to 150px wide, 3 lines) under the letter.
      const nw = Math.min(150, names.length * 5.8 + 12);
      const nh = Math.min(3, Math.ceil((names.length * 5.8) / (nw - 12))) * 13 + 6;
      const full = lvl !== 'all' && names ? { w: Math.max(nw, 16), h: 19 + nh, html: html`<span class="map-plabel" style="${style}"><b>${b.label || b.id}</b><span class="n">${names}</span></span>` } : null;
      cands.push({ x, y, prio, variants: [full, letter] });
    } else if (list.length > 0 || (it.mode === 'act' && b.label)) {
      // Ward names written on every visible block top, like the paper plan, whenever the top is big
      // enough on screen to hold readable text (zooming in makes room for more of them).
      const my = (b.y0 + b.y1) / 2, mx = (b.x0 + b.x1) / 2;
      const span = Math.hypot(sx(P(b.x1, my, it.zt)) - sx(P(b.x0, my, it.zt)), sy(P(b.x1, my, it.zt)) - sy(P(b.x0, my, it.zt)));
      const faceH = Math.abs(sy(P(mx, b.y1, it.zt)) - sy(P(mx, b.y0, it.zt)));
      const size = Math.min(13, Math.max(big ? 8 : 9.5, faceH * 0.62));
      const fits = span >= 46 && faceH >= 8;
      // Light text on the dark tops of the "all levels" view, dark text on the light active level.
      const ink = it.isSel || it.mode === 'norm' ? 'light' : 'dark';
      const css = `left: ${x.toFixed(1)}px; top: ${y.toFixed(1)}px; font-size: ${size.toFixed(1)}px`;
      const h = size * 1.3;
      const short = b.label ? { w: b.label.length * size * 0.7 + 4, h, html: html`<span class="map-blabel ${ink}" style="${css}">${b.label}</span>` } : null;
      if (fits && list.length > 0) {
        const w = Math.min(span - 10, ((b.label?.length || 0) + 1) * size * 0.7 + names.length * size * 0.56 + 6);
        cands.push({ x, y, prio, variants: [{ w, h, html: html`<span class="map-blabel ${ink} named" style="${css + `; max-width: ${Math.round(span - 10)}px`}">${b.label && html`<b>${b.label}</b>`}${names}</span>` }, short] });
      } else if (it.mode === 'act' && short) {
        cands.push({ x, y, prio, variants: [short] });
      }
    }
  }

  // Entrances. The route's entrance stays marked even when its floor is not the one shown.
  const start = route?.[0];
  const isStart = (m) => !!start && m.corpo === start.corpo && m.liv === start.liv && (m.punto?.x ?? null) === (start.punto?.x ?? null) && (m.punto?.y ?? null) === (start.punto?.y ?? null);
  const markers = points
    .filter((m) => visible(m.liv) || isStart(m))
    .map((m) => {
      const p = spot(m.corpo, m.liv, m.punto);
      if (!p) return '';
      const at = `left: ${p.x.toFixed(1)}px; top: ${p.y.toFixed(1)}px`;
      if (stacked) {
        // Doors numbered like the signs on site, as on the flat plan.
        space.take({ x: p.x, y: p.y, w: m.text.length * 7 + 14, h: 20 });
        return html`<span class="map-door${m.amb ? ' amb' : ''}${isStart(m) ? ' on' : ''}" style="${at}">${m.text}</span>`;
      }
      space.take({ x: p.x, y: p.y, w: m.text.length * 6.4 + 22, h: 22 });
      return html`<span class="map-marker${m.punto ? ' exact' : ''}" style="${at}"><span class="dot${m.amb ? ' amb' : ''}"></span>${m.text}</span>`;
    });

  // Route: walk on the entrance floor, go up (vertical segment), walk to the ward.
  const rpts = (route || []).map((p) => ({ ...p, at: spot(p.corpo, p.liv, p.punto) })).filter((p) => p.at);
  let path = '';
  if (rpts.length >= 2) {
    const ride = rpts.filter((p) => p.kind === 'asc');
    path = routeSvg(W, H, rpts, html`
      ${ride.length === 2 && html`<path class="ride" d="${`M${ride[0].at.x.toFixed(1)} ${ride[0].at.y.toFixed(1)} L${ride[1].at.x.toFixed(1)} ${ride[1].at.y.toFixed(1)}`}"></path>`}
      ${rpts.filter((p) => p.kind !== 'rep' && !(stacked && p.kind === 'ing')).map((p) => html`<circle class="${p.kind}" cx="${p.at.x.toFixed(1)}" cy="${p.at.y.toFixed(1)}" r="${p.kind === 'ing' ? 7 : 5}"></circle>`)}`);
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
  // the pin or another label, fall back to the block letter alone (a building always keeps its letter).
  const blockLabels = space.place(cands, { fallback: stacked });

  // One building: every floor is tagged on the left. Floors pushed off the stage (or under the hint
  // line) get no tag; a compact stack has no room for them, the level bar under the map does the job.
  const floorLabels = stacked ? [] : (mappa.livelli || [...new Set(allLv)].sort((a, b) => a - b))
    .map((L) => ({ L, p: P(bx0 - 0.8, by0 + 1, L * SP + TH / 2) }))
    .filter((l) => sy(l.p) > 34 && sy(l.p) < H - 40)
    .map((l) => {
      const state = lvl === l.L ? ' on' : lvl !== 'all' && l.L > lvl ? ' off' : '';
      return html`<span class="map-flabel${state}" style="${`left: ${Math.max(sx(l.p), 34).toFixed(1)}px; top: ${sy(l.p).toFixed(1)}px`}">${floorTag(l.L)}</span>`;
    });

  const draw = html`<svg class="map-3d" width="${W}" height="${H}" viewBox="${`0 0 ${W} ${H}`}">${faces}</svg>${floorLabels}${blockLabels}${path}${markers}${pin}`;
  const ui = html`
    ${controls({ rotate: true, exp, zoom, panX, panY, other: stacked ? '2D' : null })}
    ${hintAndLegend(big ? 'Trascina per ruotare · rotella o due dita per lo zoom' : 'Trascina: ruota · Due dita: zoom', [
      B.some((b) => b.node) && ['lift', 'Scale / ascensori'],
      [stacked ? 'ring white' : 'sel', pick ? 'Posizione scelta' : 'Reparto'],
      points.length > 0 && ['round ing', 'Ingressi'],
      rpts.length >= 2 && ['line', 'Percorso']
    ])}`;

  return {
    draw: String(draw),
    ui: String(ui),
    geo: {
      // Inverse of P() on the top face of level `liv`: stage pixels -> plan coordinates.
      unproject(qx, qy, liv) {
        const xr = (qx - ox) / f / K;
        const yr = ((qy - oy) / f + top(liv ?? 0)) / (K * T);
        return { x: xr * c + yr * s + px, y: -xr * s + yr * c + py };
      },
      block: (id) => byId[id]
    }
  };
}
