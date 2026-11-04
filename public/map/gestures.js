// Gestures on the maps:
//  - one finger / left mouse: drag sideways to rotate the 3D model (on a flat plan: move it);
//  - right mouse or Shift + drag: move;
//  - two fingers: pinch to zoom around the fingers, move them to pan;
//  - mouse wheel (and trackpad pinch): zoom around the cursor; double click: zoom in / back out.
// Movement under a few pixels stays a tap, so blocks remain clickable; the click that ends a
// real gesture is swallowed. A tap on an empty spot of a hospital map clears the selection.
import { X } from '../data.js';
import { isPlan } from '../domain.js';
import { render } from '../ui.js';
import { stageState, stageKind, drawStage, homeView, zoomAt, redrawSoon, stopRotation } from './stage.js';

const DRAG_START = 6;
const DEG_PER_PX = 0.45;

let gest = null;
let swallowClick = false;

const stagePoint = (stage, e) => {
  const r = stage.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};

// The stage under the event, unless the event is on its buttons.
const stageAt = (e) => {
  const stage = e.target.closest('.map-stage');
  return stage && !e.target.closest('.map-ctrl') ? stage : null;
};

// One pointer rotates the 3D model (right/shift-drag pans it); on a flat plan it always pans.
function singleMode(stage, e) {
  if (isPlan(X.osp[stage.dataset.osp])) return 'pan';
  return e.pointerType === 'mouse' && (e.button === 2 || e.shiftKey) ? 'pan' : 'rotate';
}

function startSingle(g, p, mode) {
  g.mode = mode;
  g.start = { ...p, rot: g.st.rot, panX: g.st.panX, panY: g.st.panY };
}

function onDown(e) {
  const stage = stageAt(e);
  if (!stage) return;
  if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
  const st = stageState(stage);
  if (!st) return;
  if (!gest || gest.stage !== stage) gest = { stage, st, pts: new Map(), moved: false };
  const p = stagePoint(stage, e);
  gest.pts.set(e.pointerId, p);
  if (gest.pts.size === 2) {
    // Second finger: pinch (zoom + pan) from here on.
    const [a, b] = [...gest.pts.values()];
    gest.mode = 'pinch';
    gest.moved = true;
    gest.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, from: { zoom: st.zoom, panX: st.panX, panY: st.panY } };
  } else if (gest.pts.size === 1) {
    startSingle(gest, p, singleMode(stage, e));
  }
}

function onMove(e) {
  if (!gest || !gest.pts.has(e.pointerId)) return;
  const { stage, st } = gest;
  const p = stagePoint(stage, e);
  gest.pts.set(e.pointerId, p);
  if (gest.mode === 'pinch' && gest.pts.size >= 2) {
    const [a, b] = [...gest.pts.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    zoomAt(stage, st, gest.pinch.from.zoom * (d / gest.pinch.d), gest.pinch.mid, mid, gest.pinch.from);
  } else {
    const dx = p.x - gest.start.x, dy = p.y - gest.start.y;
    if (!gest.moved) {
      if (Math.hypot(dx, dy) < DRAG_START) return;
      gest.moved = true;
      stopRotation();
      stage.classList.add('dragging');
      try { stage.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    }
    if (gest.mode === 'pan') {
      st.panX = gest.start.panX + dx;
      st.panY = gest.start.panY + dy;
    } else {
      st.rot = gest.start.rot - dx * DEG_PER_PX;
    }
  }
  redrawSoon(stage);
}

function onUp(e) {
  if (!gest || !gest.pts.has(e.pointerId)) return;
  gest.pts.delete(e.pointerId);
  if (gest.pts.size === 1) {
    // One finger left after a pinch: carry on rotating (or panning) from where it is, without jumping.
    startSingle(gest, [...gest.pts.values()][0], singleMode(gest.stage, e));
    return;
  }
  if (gest.pts.size > 0) return;
  if (gest.moved) {
    gest.stage.classList.remove('dragging');
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 0);
  }
  gest = null;
}

function onDoubleClick(e) {
  const stage = stageAt(e);
  const st = stage && stageState(stage);
  if (!st) return;
  if (st.zoom > 1.5) homeView(st);
  else zoomAt(stage, st, 2.6, stagePoint(stage, e));
  drawStage(stage);
}

function onWheel(e) {
  const stage = stageAt(e);
  const st = stage && stageState(stage);
  if (!st) return;
  e.preventDefault();
  // Lines (Firefox) are ~33px; ctrl+wheel is a trackpad pinch, which sends small deltas.
  const delta = e.deltaY * (e.deltaMode === 1 ? 33 : 1);
  zoomAt(stage, st, st.zoom * Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0015)), stagePoint(stage, e));
  redrawSoon(stage);
}

// The click that ends a drag is not a tap: stop it before any other click handler sees it.
function onClickCapture(e) {
  if (!swallowClick) return;
  swallowClick = false;
  e.preventDefault();
  e.stopImmediatePropagation();
}

// A tap on an empty part of a hospital's map page (no ward, no button) clears the selection and
// the chosen floor ("Tutti" again). The ward page and the position picker keep theirs.
function onClick(e) {
  if (e.target.closest('[data-act]')) return;
  const stage = stageAt(e);
  if (!stage || stageKind(stage) !== 'map') return;
  const st = stageState(stage);
  if (!st || (!st.sel && st.lvl === 'all')) return;
  st.sel = null;
  st.lvl = 'all';
  homeView(st);
  render();
}

export function installGestures() {
  document.addEventListener('pointerdown', onDown);
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
  document.addEventListener('dblclick', onDoubleClick);
  // Right-drag pans the map, so no context menu there.
  document.addEventListener('contextmenu', (e) => { if (e.target.closest('.map-stage')) e.preventDefault(); });
  document.addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('click', onClickCapture, true);
  document.addEventListener('click', onClick);
}
