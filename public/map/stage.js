// Maps on screen. A "stage" is an empty .map-stage element, drawn after each render at its real
// size by the 3D renderer (map3d.js) or the flat plan renderer (map2d.js).
//
// Every stage keeps its state in S.stages, under the key written in its data-stage attribute:
//   map:<hospital>  the hospital's map page: the ward selected, the level shown, the search
//   rep:<hospital>  the small map on a ward page, which always shows that ward
//   pick            the map used in a form to choose where a ward or an entrance is
// All of them share the same view fields, created by newStage(): rot (degrees), exp (floors
// pulled apart), zoom, panX, panY, and flat (the plan from above instead of the 3D model, for the
// hospitals that have both).
//
// A stage element holds two layers: .map-draw (the drawing, redrawn at every frame of a gesture)
// and, after it, the buttons and the legend (redrawn only when the gesture ends).
import { html } from '../util.js';
import { S, X } from '../data.js';
import { isPlan, mapWord, floorWord, floorTag, Corpo, pianoInfo, placeText, corpoPatch, entrancePoints, routeFor } from '../domain.js';
import { $app, render } from '../ui.js';
import { renderMap } from './map3d.js';
import { renderPlan } from './map2d.js';

const DEFAULT_ROT = -12;
const ZOOM_MIN = 1, ZOOM_MAX = 6;

// The angle a hospital's 3D map opens at.
export const defaultRot = (o) => o.mappa.rot ?? DEFAULT_ROT;

export const newStage = (o, extra = {}) => ({ rot: defaultRot(o), exp: false, flat: false, zoom: 1, panX: 0, panY: 0, ...extra });

// Hospitals made of several buildings have the plan from above too; the stage shows one or the other.
export const isFlat = (o, st) => isPlan(o) && !!st.flat;

export const stageKind = (el) => (el.dataset.stage || '').split(':')[0];

// The stage's state, brought up to date with what it must show.
export function stageState(el) {
  const o = X.osp[el.dataset.osp];
  const st = S.stages[el.dataset.stage];
  if (!o?.mappa || !st) return null;
  const kind = stageKind(el);
  if (kind === 'pick') {
    // Highlight what's chosen; every visible block is clickable.
    const v = pickValues();
    st.sel = null;
    st.lvl = v.piano ?? 'all';
    st.highlight = v.corpo ? { corpo: v.corpo, liv: v.piano, punto: v.punto, text: st.label } : null;
  } else if (kind === 'rep') {
    const r = X.rep[el.dataset.rep];
    st.sel = r?.id || null;
    st.lvl = r?.piano ?? 'all';
  }
  return st;
}

// `light`: only the drawing (during a gesture or an animation); the buttons keep their state until the full redraw.
export function drawStage(el, { light = false } = {}) {
  const o = X.osp[el.dataset.osp];
  const st = stageState(el);
  if (!st) return;
  const pick = stageKind(el) === 'pick';
  const out = (isFlat(o, st) ? renderPlan : renderMap)({
    mappa: o.mappa, reparti: X.repByOsp[o.id] || [], sel: st.sel, lvl: st.lvl, rot: st.rot, rot0: defaultRot(o), exp: st.exp,
    target: pick ? st.highlight : undefined, pick, points: entrancePoints(o),
    route: pick ? null : routeFor(X.rep[st.sel]),
    zoom: st.zoom, panX: st.panX, panY: st.panY,
    width: el.clientWidth || 390, height: el.clientHeight || 300,
    floorTag: (L) => floorTag(o, L), floorName: (L) => pianoInfo(o, L).long, corpoWord: Corpo(o)
  });
  const layer = light && el.querySelector(':scope > .map-draw');
  if (layer) layer.innerHTML = out.draw;
  else el.innerHTML = `<div class="map-draw">${out.draw}</div>${out.ui}`;
  el._geo = out.geo;
  // Zoomed in, one-finger drags belong to the map instead of scrolling the page.
  el.classList.toggle('zoomed', st.zoom > 1.001);
}

export function drawStages() {
  $app.querySelectorAll('.map-stage').forEach(drawStage);
}

// The hospital's map page.
export function mapStageHtml(o) {
  return html`<div class="map-stage" data-osp="${o.id}" data-stage="map:${o.id}"></div>`;
}

// The small map on a ward page.
export function repStageHtml(o, r) {
  S.stages['rep:' + o.id] ||= newStage(o);
  return html`<div class="map-stage small" data-osp="${o.id}" data-stage="rep:${o.id}" data-rep="${r.id}"></div>`;
}

// ---------------------------------------------------------------- view: zoom and pan

export const homeView = (st) => Object.assign(st, { zoom: 1, panX: 0, panY: 0 });

// Zoom to `z` so that the stage point `anchor` (as seen with the `from` view) ends up at `to`.
export function zoomAt(stage, st, z, anchor, to = anchor, from = st) {
  const W = stage.clientWidth, H = stage.clientHeight;
  z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
  const bx = W / 2 + (anchor.x - W / 2 - from.panX) / from.zoom;
  const by = H / 2 + (anchor.y - H / 2 - from.panY) / from.zoom;
  const limX = (W * z) / 2, limY = (H * z) / 2;
  st.zoom = z;
  st.panX = Math.min(limX, Math.max(-limX, to.x - W / 2 - (bx - W / 2) * z));
  st.panY = Math.min(limY, Math.max(-limY, to.y - H / 2 - (by - H / 2) * z));
}

// One light redraw per frame, however many pointer events arrive in it.
export function redrawSoon(stage) {
  if (stage._raf) return;
  stage._raf = requestAnimationFrame(() => {
    stage._raf = 0;
    if (stage.isConnected) drawStage(stage, { light: true });
  });
}

// A full redraw shortly after the last of a burst of changes (wheel zoom), to refresh the buttons.
export function settleSoon(stage) {
  clearTimeout(stage._settle);
  stage._settle = setTimeout(() => { if (stage.isConnected) drawStage(stage); }, 160);
}

// The model turning by itself: the ±45° buttons, and the momentum after a drag. Touching the map stops it.
let rotRaf = 0;
export const stopRotation = () => cancelAnimationFrame(rotRaf);
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Keeps turning at `speed` (degrees per millisecond), slowing down as if by friction.
export function spin(stage, st, speed) {
  stopRotation();
  if (reducedMotion() || Math.abs(speed) < 0.03) return drawStage(stage);
  let v = Math.max(-1.2, Math.min(1.2, speed)), last = performance.now();
  const step = (now) => {
    const dt = Math.min(now - last, 50);
    last = now;
    st.rot += v * dt;
    v *= Math.exp(-dt / 260);
    if (!stage.isConnected) return;
    if (Math.abs(v) < 0.012) return drawStage(stage);
    drawStage(stage, { light: true });
    rotRaf = requestAnimationFrame(step);
  };
  rotRaf = requestAnimationFrame(step);
}

// ---------------------------------------------------------------- choosing a position (ward and entrance forms)
// S.stages.pick = { key, target: 'draft' | 'form', mode: 'ala' | 'punto', label, corpo, piano, punto, ...view }
// With target 'draft' the values live in the ward draft; with 'form' they live in the pick state and
// are mirrored into the form's inputs, so the rest of the form keeps what was typed.

export function pickValues() {
  const p = S.stages.pick;
  if (p?.target === 'draft' && S.draft) return { corpo: S.draft.corpo, piano: S.draft.piano, punto: S.draft.punto };
  return { corpo: p?.corpo ?? null, piano: p?.piano ?? null, punto: p?.punto ?? null };
}

export function initPick(key, o, target, values, label) {
  if (S.stages.pick?.key !== key) {
    S.stages.pick = newStage(o, { key, target, mode: values.punto ? 'punto' : 'ala', ...values });
  }
  S.stages.pick.label = label;
}

// Leaving the form drops the position being chosen (a ward draft keeps its own values).
export const dropPick = () => { delete S.stages.pick; };

function pickStatus(o, v) {
  return [placeText(o, v.corpo, v.punto), v.corpo && v.piano != null ? pianoInfo(o, v.piano).long : ''].filter(Boolean).join(' · ');
}

export function pickPanel(o, v, what) {
  const mode = S.stages.pick.mode;
  return html`<div class="field pickfield">
    <span>Posizione sulla ${mapWord(o)}</span>
    <div class="seg light">
      <button type="button" class="${mode === 'ala' ? 'on' : ''}" data-act="pickMode" data-mode="ala">${isPlan(o) ? 'Intera palazzina' : 'Intera ala'}</button>
      <button type="button" class="${mode === 'punto' ? 'on' : ''}" data-act="pickMode" data-mode="punto">Punto preciso</button>
    </div>
    <div class="map-stage pick" data-osp="${o.id}" data-stage="pick"></div>
    <div class="row between gap8">
      <b class="pick-status" id="pick-status">${pickStatus(o, v)}</b>
      <button type="button" class="btn ghost small ${v.corpo ? '' : 'hide'}" id="pick-clear" data-act="pickClear">Rimuovi</button>
    </div>
    <small class="muted">${isPlan(o) ? `Tocca la palazzina dove si trova ${what}.` : `Scegli il ${floorWord(o).word}, poi tocca il blocco dove si trova ${what}.`} Con “Punto preciso” tocca il punto esatto: comparirà un puntino.</small>
  </div>`;
}

function setPick(v) {
  const p = S.stages.pick;
  if (p.target === 'draft') {
    const d = S.draft;
    if (v.corpo && v.corpo !== d.corpo) Object.assign(d, corpoPatch(X.osp[d.osp], d, v.corpo));
    d.corpo = v.corpo;
    if (v.piano !== undefined) d.piano = v.piano;
    d.punto = v.punto;
    d.touched = true;
    render();
    return;
  }
  Object.assign(p, v);
  const form = document.getElementById('eform');
  if (form?.elements.corpo) form.elements.corpo.value = p.corpo || '';
  if (form?.elements.punto) form.elements.punto.value = p.punto ? JSON.stringify(p.punto) : '';
  if (form?.elements.piano && v.piano !== undefined) form.elements.piano.value = v.piano ?? '';
  const o = X.osp[$app.querySelector('.map-stage.pick')?.dataset.osp];
  const st = document.getElementById('pick-status');
  if (st && o) st.textContent = pickStatus(o, p);
  document.getElementById('pick-clear')?.classList.toggle('hide', !p.corpo);
  drawStages();
}

// ---------------------------------------------------------------- actions

const stageOf = (el) => el.closest('.map-stage');

export const handlers = {
  act: {
    mapZoom: ({ f }, el) => {
      const stage = stageOf(el);
      const st = stageState(stage);
      zoomAt(stage, st, st.zoom * Number(f), { x: stage.clientWidth / 2, y: stage.clientHeight / 2 });
      drawStage(stage);
    },
    mapReset: (_, el) => {
      const stage = stageOf(el);
      stopRotation();
      Object.assign(homeView(stageState(stage)), { rot: defaultRot(X.osp[stage.dataset.osp]) });
      drawStage(stage);
    },
    mapExp: (_, el) => {
      const stage = stageOf(el);
      const st = stageState(stage);
      st.exp = !st.exp;
      drawStage(stage);
    },
    mapRot: ({ d }, el) => {
      const stage = stageOf(el);
      const st = stageState(stage);
      const from = st.rot, to = st.rot + Number(d), t0 = performance.now();
      const reduce = reducedMotion();
      stopRotation();
      const step = (now) => {
        const t = reduce ? 1 : Math.min(1, (now - t0) / 340);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        st.rot = from + (to - from) * e;
        if (!stage.isConnected) return;
        drawStage(stage, { light: t < 1 });
        if (t < 1) rotRaf = requestAnimationFrame(step);
      };
      rotRaf = requestAnimationFrame(step);
    },
    // Hospitals with both views: 3D model <-> plan from above.
    mapFlat: (_, el) => {
      const stage = stageOf(el);
      const st = stageState(stage);
      stopRotation();
      st.flat = !st.flat;
      homeView(st);
      drawStage(stage);
    },
    // Click on a block while choosing a position: whole wing, or the exact spot clicked.
    pickBlock: ({ corpo, liv, zl }, el, e) => {
      const stage = stageOf(el);
      // Without `liv` (the flat plan, a whole building) the floor stays the one chosen in the form;
      // `zl` is the level of the surface tapped, to find the point on it.
      const L = liv === undefined ? undefined : Number(liv);
      let punto = null;
      // e.detail is 0 for keyboard activation: there's no click position, so use the whole block.
      if (S.stages.pick.mode === 'punto' && e.detail > 0 && stage._geo) {
        const rect = stage.getBoundingClientRect();
        const pt = stage._geo.unproject(e.clientX - rect.left, e.clientY - rect.top, zl === undefined ? L : Number(zl));
        const b = stage._geo.block(corpo);
        const clamp = (v, a, z) => Math.min(Math.max(v, a), z);
        punto = { x: clamp(pt.x, b.x0, b.x1), y: clamp(pt.y, b.y0, b.y1) };
      }
      setPick(L === undefined ? { corpo, punto } : { corpo, piano: L, punto });
    },
    pickMode: ({ mode }) => {
      S.stages.pick.mode = mode;
      $app.querySelectorAll('[data-act="pickMode"]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
      // Switching to "whole wing" drops a point chosen earlier.
      if (mode === 'ala' && pickValues().punto) setPick({ ...pickValues(), punto: null });
    },
    pickClear: () => setPick({ corpo: null, punto: null })
  },
  change: {
    // Floor select of the entrance form: the map follows it.
    pickPiano: (el) => {
      if (!S.stages.pick) return;
      setPick({ ...pickValues(), piano: el.value === '' ? null : Number(el.value) });
    }
  }
};
