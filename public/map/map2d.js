import { html, raw } from '../util.js';
import { highlightOf, labelSpace, pinHtml, routeSvg, controls, hintAndLegend, inkOn } from './common.js';

// Flat plan seen from above, for hospitals without a 3D drawing (map `tipo: 'pianta'`).
// `mappa`   = { view: {x0, y0, x1, y1}, blocks: [{id, label, poly: [[x, y]...], l: [x, y], colore, lv}],
//              decor: { area, strade, edifici, percorsi, scritte }, corpi, livelli }
// Same options and return value as renderMap (map3d.js), which draws the same buildings in 3D; here
// the level only decides which buildings are lit and whose ward names are written, since every
// floor shares the plan.
export function renderPlan({ mappa, reparti, sel, lvl, width, height = 300, target, points = [], pick = false, route = null, zoom = 1, panX = 0, panY = 0, corpoWord = 'Palazzina' }) {
  const B = mappa.blocks || [];
  const byId = Object.fromEntries(B.map((b) => [b.id, b]));
  const hi = highlightOf(reparti, sel, target);
  const v = mappa.view;

  const W = width, H = height;
  const big = W > 600;
  // On phones the plan uses the full width: the zoom buttons just sit over its corner.
  const fx0 = big ? 24 : 6, fx1 = W - (big ? 76 : 6), fy0 = big ? 36 : 30, fy1 = H - (big ? 40 : 28);
  const fit = Math.min((fx1 - fx0) / (v.x1 - v.x0), (fy1 - fy0) / (v.y1 - v.y0));
  const fitX = fx0 + ((fx1 - fx0) - (v.x1 - v.x0) * fit) / 2 - v.x0 * fit;
  const fitY = fy0 + ((fy1 - fy0) - (v.y1 - v.y0) * fit) / 2 - v.y0 * fit;
  const f = fit * zoom;
  const ox = W / 2 + (fitX - W / 2) * zoom + panX;
  const oy = H / 2 + (fitY - H / 2) * zoom + panY;
  const sx = (x) => x * f + ox;
  const sy = (y) => y * f + oy;
  const pts = (poly) => poly.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ');
  const clip = (poly) => 'polygon(' + poly.map(([x, y]) => `${sx(x).toFixed(1)}px ${sy(y).toFixed(1)}px`).join(', ') + ')';

  // Where a building's letter goes (its label point, else the middle of its outline).
  const anchor = (b) => b.l || bbox(b.poly).c;
  function spot(corpo, punto) {
    const b = byId[corpo];
    if (!b) return null;
    const [x, y] = punto ? [punto.x, punto.y] : anchor(b);
    return { x: sx(x), y: sy(y) };
  }

  const byBlock = {};
  for (const r of reparti) {
    if (r.corpo == null) continue;
    (byBlock[r.corpo] ||= []).push(r);
  }
  const onLevel = (b) => lvl === 'all' || (b.lv || []).includes(lvl);

  const d = mappa.decor || {};
  const roadW = Math.max(6, 2.2 * f);
  const decor = html`
    ${(d.strade || []).map((s) => html`<polyline class="p-road" points="${pts(s.pts)}" style="${`stroke-width: ${roadW.toFixed(1)}px`}"></polyline><polyline class="p-road-mid" points="${pts(s.pts)}"></polyline>`)}
    ${d.area && html`<polygon class="p-area" points="${pts(d.area)}"></polygon>`}
    ${(d.edifici || []).map((e) => html`<polygon class="p-other ${e.cls || ''}" points="${pts(e.poly)}"></polygon>`)}
    ${(d.percorsi || []).map((p) => html`<polyline class="p-path" points="${pts(p)}"></polyline>`)}`;

  const shapes = [], buttons = [], cands = [];
  const levelAttr = lvl === 'all' ? '' : raw(`data-liv="${lvl}"`);
  for (const b of B) {
    const lit = onLevel(b);
    const isSel = !!(hi && hi.corpo === b.id);
    const name = mappa.corpi?.[b.id]?.label || b.label || b.id;
    // Building colours come with the map (each building its own colour, as on the paper plan).
    shapes.push(html`<polygon class="p-bld${lit ? '' : ' dim'}${isSel ? ' sel' : ''}${isSel && !hi.punto ? ' jpulse' : ''}" points="${pts(b.poly)}" style="${`fill: ${b.colore}`}"></polygon>`);
    const list = (byBlock[b.id] || []).filter((r) => lvl === 'all' || r.piano === lvl);
    const css = `clip-path: ${clip(b.poly)}`;
    if (pick) {
      buttons.push(html`<button type="button" class="mf mf-btn" data-act="pickBlock" data-corpo="${b.id}" ${levelAttr} aria-label="${`${corpoWord} ${name}`}" style="${css}"></button>`);
    } else if (list.length > 0) {
      const label = `${corpoWord} ${name}: ${list.map((x) => x.nome).join(', ')}`;
      buttons.push(html`<button type="button" class="mf mf-btn" data-act="mapPick" data-id="${list[0].id}" ${levelAttr} aria-label="${label}" style="${css}"></button>`);
    }
    const [lx, ly] = anchor(b);
    const style = `left: ${sx(lx).toFixed(1)}px; top: ${sy(ly).toFixed(1)}px; color: ${inkOn(b.colore)}${lit ? '' : '; opacity: 0.45'}`;
    // With one level shown, each lit building also lists what's on that floor.
    const names = lvl !== 'all' && lit && list.length > 0 ? list.map((x) => x.nome.split(' – ')[0]).join(' · ') : '';
    const letter = { w: 16, h: 16, html: html`<span class="map-plabel" style="${style}"><b>${b.label || b.id}</b></span>` };
    // The ward names sit in a box (up to 150px wide, 3 lines) under the letter.
    const nw = Math.min(150, names.length * 5.8 + 12);
    const nh = Math.min(3, Math.ceil((names.length * 5.8) / (nw - 12))) * 13 + 6;
    const full = names ? { w: Math.max(nw, 16), h: 19 + nh, html: html`<span class="map-plabel" style="${style}"><b>${b.label || b.id}</b><span class="n">${names}</span></span>` } : null;
    cands.push({ x: sx(lx), y: sy(ly), prio: isSel ? 0 : 1, variants: [full, letter] });
  }

  const text = (d.scritte || []).map((t) => {
    const css = `left: ${sx(t.x).toFixed(1)}px; top: ${sy(t.y).toFixed(1)}px${t.rot ? `; transform: translate(-50%, -50%) rotate(${t.rot}deg)` : ''}`;
    return html`<span class="map-ptext ${t.cls || ''}" style="${css}">${t.t}</span>`;
  });

  // Doors, numbered like the signs on site; the one the route starts from stands out.
  const space = labelSpace();
  const start = route?.[0];
  const markers = points.map((m) => {
    const p = spot(m.corpo, m.punto);
    if (!p) return '';
    space.take({ x: p.x, y: p.y, w: m.text.length * 7 + 14, h: 20 });
    const on = start && start.corpo === m.corpo && start.punto && m.punto && start.punto.x === m.punto.x && start.punto.y === m.punto.y;
    return html`<span class="map-door${m.amb ? ' amb' : ''}${on ? ' on' : ''}" style="${`left: ${p.x.toFixed(1)}px; top: ${p.y.toFixed(1)}px`}">${m.text}</span>`;
  });

  const rpts = (route || []).map((p) => ({ ...p, at: spot(p.corpo, p.punto) })).filter((p) => p.at);
  const path = rpts.length >= 2 ? routeSvg(W, H, rpts) : '';

  let pin = '';
  const hp = hi && spot(hi.corpo, hi.punto);
  if (hp) {
    pin = pinHtml(hp, hi, W);
    space.take({ x: hp.x, y: hp.y - 30, w: Math.min(200, (hi.text || '').length * 7.4 + 20), h: 30 });
  }

  // Doors and the chosen pin first; then names, the chosen building first. A name box that would
  // cover a door or another label is dropped, leaving just the building's letter.
  const labels = space.place(cands, { fallback: true });

  const draw = html`
    <svg class="map-plan" width="${W}" height="${H}" viewBox="${`0 0 ${W} ${H}`}" aria-hidden="true">${decor}${shapes}</svg>
    ${buttons}${text}${path}${markers}${labels}${pin}`;
  const ui = html`
    ${controls({ zoom, panX, panY, other: '3D' })}
    ${hintAndLegend(big ? 'Trascina per spostare · rotella o due dita per lo zoom' : 'Due dita: zoom e sposta', [
      ['ring', pick ? 'Posizione scelta' : 'Reparto'],
      points.length > 0 && ['round door', 'Ingressi'],
      d.percorsi?.length > 0 && ['dash', 'Percorso principale']
    ])}`;

  return {
    draw: String(draw),
    ui: String(ui),
    geo: {
      unproject: (px, py) => ({ x: (px - ox) / f, y: (py - oy) / f }),
      block: (id) => byId[id] && bbox(byId[id].poly)
    }
  };
}

function bbox(poly) {
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const b = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  b.c = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
  return b;
}
