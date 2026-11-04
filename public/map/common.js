// What the 3D map (map3d.js) and the flat plan (map2d.js) draw the same way: the highlighted ward,
// labels that don't overlap, the pin, the route line, the buttons and the legend.
// Colours are not here: the markup carries classes, app.css gives them colours (.map-stage tokens).
import { html, raw } from '../util.js';

const f1 = (n) => n.toFixed(1);

// The spot to highlight: the one given (position picker) or the selected ward's.
export function highlightOf(reparti, sel, target) {
  if (target) return target;
  const r = sel ? reparti.find((x) => x.id === sel) : null;
  return r && r.corpo != null ? { corpo: r.corpo, liv: r.piano, punto: r.punto, text: r.nome } : null;
}

// Boxes already on the stage (markers, pin, labels), so new labels don't cover them.
// A box is { x, y, w, h } around its centre.
export function labelSpace() {
  const taken = [];
  const hits = (a) => taken.some((t) => Math.abs(a.x - t.x) < (a.w + t.w) / 2 && Math.abs(a.y - t.y) < (a.h + t.h) / 2);
  return {
    take: (box) => taken.push(box),
    hits,
    // Each candidate has variants, longest first ({ w, h, html }); the first one that fits is used.
    // With `fallback`, the last variant is placed even when it overlaps.
    place(cands, { fallback = false } = {}) {
      const out = [];
      for (const c of cands.sort((a, b) => a.prio - b.prio)) {
        const vs = c.variants.filter(Boolean);
        for (let i = 0; i < vs.length; i++) {
          const box = { x: c.x, y: c.y, w: vs[i].w, h: vs[i].h };
          if (hits(box) && !(fallback && i === vs.length - 1)) continue;
          taken.push(box);
          out.push(vs[i].html);
          break;
        }
      }
      return out;
    }
  };
}

// The pin over the highlighted spot, with its label kept inside the stage.
export function pinHtml(p, hi, W, dy = 0) {
  return html`<div class="map-pin${hi.punto ? ' exact' : ''}" aria-hidden="true" style="${`left: ${f1(p.x)}px; top: ${f1(p.y + dy)}px`}">
        ${hi.text && html`<span class="t" style="${`transform: translateX(${pinShift(p.x, W)}px)`}">${hi.text}</span>`}<span class="stick"></span><span class="head"></span>
      </div>`;
}

// Keeps the pin's label (max 260px wide on desktop, centred on the pin) inside the stage.
export function pinShift(x, W) {
  const half = W > 600 ? 136 : 106;
  return Math.max(0, half - x) - Math.max(0, x + half - W);
}

// The route line through points { at: {x, y}, kind }; `extra` is more SVG drawn over it.
export function routeSvg(W, H, rpts, extra = '') {
  const d = rpts.map((p, i) => `${i ? 'L' : 'M'}${f1(p.at.x)} ${f1(p.at.y)}`).join(' ');
  return html`<svg class="map-route" width="${W}" height="${H}" viewBox="${`0 0 ${W} ${H}`}" aria-hidden="true">
      <path class="halo" d="${d}"></path>
      <path class="line" d="${d}"></path>
      ${extra}
    </svg>`;
}

const svg = (d, w = 20) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS = {
  rotL: svg('<path d="M4 12a8 8 0 1 0 2.5-5.8"></path><path d="M4 4v5h5"></path>'),
  rotR: svg('<path d="M20 12a8 8 0 1 1-2.5-5.8"></path><path d="M20 4v5h-5"></path>'),
  layers: svg('<path d="M12 3l9 5-9 5-9-5z"></path><path d="M3 16l9 5 9-5"></path>'),
  plus: svg('<path d="M12 5v14M5 12h14"></path>'),
  minus: svg('<path d="M5 12h14"></path>'),
  fit: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"></path>')
};

const cbtn = (act, label, icon, extra = '') =>
  html`<button type="button" class="map-cbtn" data-act="${act}" aria-label="${label}" title="${label}" ${raw(extra)}>${raw(icon)}</button>`;

// Buttons in the corner: rotate and "separa i piani" only on the 3D map, zoom on both.
export function controls({ rotate = false, exp = false, zoom, panX, panY }) {
  return html`<div class="map-ctrl">
      ${rotate && html`${cbtn('mapRot', 'Ruota a sinistra', ICONS.rotL, 'data-d="-45"')}
      ${cbtn('mapRot', 'Ruota a destra', ICONS.rotR, 'data-d="45"')}
      <button type="button" class="map-cbtn${exp ? ' on' : ''}" data-act="mapExp" aria-label="${exp ? 'Unisci i piani' : 'Separa i piani'}" title="${exp ? 'Unisci i piani' : 'Separa i piani'}" aria-pressed="${exp}">${raw(ICONS.layers)}</button>`}
      ${cbtn('mapZoom', 'Ingrandisci', ICONS.plus, 'data-f="1.5"')}
      ${cbtn('mapZoom', 'Riduci', ICONS.minus, 'data-f="0.6667"' + (zoom <= 1.001 ? ' disabled' : ''))}
      ${(zoom > 1.001 || !!panX || !!panY) && cbtn('mapReset', 'Vista iniziale', ICONS.fit)}
    </div>`;
}

// The hint line at the top and the legend at the bottom: items are [swatch class, text].
export function hintAndLegend(hint, items) {
  return html`<span class="map-hint" aria-hidden="true">${hint}</span>
    <div class="map-legend" aria-hidden="true">
      ${items.filter(Boolean).map(([cls, text]) => html`<span><span class="sw ${cls}"></span>${text}</span>`)}
    </div>`;
}
