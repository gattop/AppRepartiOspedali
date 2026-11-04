// Entry point: which screen goes with which address, drawing the page, dispatching the events.
//
// Where things are:
//   util.js       html templating, text normalisation, storage, dates
//   icons.js      line icons, one icon per kind of ward, the logo
//   data.js       state (S), indexes (X), loading and saving through the API, offline copy
//   ui.js         render(), flash messages, mutate() (save + reload + message)
//   domain.js     floors, bodies/buildings, directions, phone numbers, route on the map
//   router.js     the table of addresses, href() to build links, "Indietro"/"Annulla"
//   motion.js     entrance animation of each screen
//   map/          drawing of the maps (3D, 2D plan), their state, gestures
//   views/        the screens; each one exports its event handlers next to its markup
//
// Events are delegated: an element with data-act="x" runs handlers.act.x on click,
// data-input / data-change / data-submit do the same for input, change and submit,
// and handlers.key.x runs on keydown in an element with data-input="x".
import { html } from './util.js';
import { S, X, VERSION, loadData, loadMe } from './data.js';
import { ICON } from './icons.js';
import { $app, setRenderer, render } from './ui.js';
import { currentRoute, currentPath, trackHash } from './router.js';
import { reveal } from './motion.js';
import { drawStages, dropPick, handlers as stageHandlers } from './map/stage.js';
import { installGestures } from './map/gestures.js';
import { banner, toast, viewNotFound, handlers as commonHandlers } from './views/common.js';
import { viewOspedali, viewPreferiti } from './views/home.js';
import { viewOspedale, handlers as ospedaleHandlers } from './views/ospedale.js';
import { viewMappa, installSearchDrop, handlers as mappaHandlers } from './views/mappa.js';
import { viewReparto, handlers as repartoHandlers } from './views/reparto.js';
import { viewGestisci, handlers as gestisciHandlers } from './views/gestisci.js';
import { viewRepForm, viewEntityForm, handlers as formHandlers } from './views/forms.js';

// ---------------------------------------------------------------- screens

const SCREENS = {
  home: () => viewOspedali(),
  preferiti: () => viewPreferiti(),
  aggiungi: (id, q) => viewRepForm(null, q),
  reparto: (id) => viewReparto(id),
  repartoModifica: (id, q) => viewRepForm(id, q),
  // Hospitals with a map open straight on it; the sheet is one tap away.
  ospedale: (id, q) => (X.osp[id]?.mappa ? viewMappa(id, q) : viewOspedale(id)),
  scheda: (id) => viewOspedale(id),
  gestisci: (id) => viewGestisci(id),
  ospedaleModifica: (id, q) => viewEntityForm('ospedali', id, null, q),
  nuovaSede: (id, q) => viewEntityForm('sedi', null, id, q),
  nuovoOspedale: (id, q) => viewEntityForm('ospedali', null, null, q),
  sedeModifica: (id, q) => viewEntityForm('sedi', id, null, q),
  nuovoIngresso: (id, q) => viewEntityForm('ingressi', null, id, q),
  nuovoAscensore: (id, q) => viewEntityForm('ascensori', null, id, q),
  ingressoModifica: (id, q) => viewEntityForm('ingressi', id, null, q),
  ascensoreModifica: (id, q) => viewEntityForm('ascensori', id, null, q)
};

function screen() {
  const r = currentRoute();
  return r ? SCREENS[r.name](r.id, r.query) : viewNotFound();
}

function renderPage() {
  if (!S.data) {
    $app.innerHTML = String(html`${banner()}<div class="splash">${ICON.layers(40)}<b>Reparti</b><span>${S.loadError || 'Caricamento…'}</span>
      ${S.loadError && html`<button type="button" class="btn primary" data-act="reload">Riprova</button>`}</div>`);
    return;
  }
  const active = document.activeElement;
  const keep = active && active !== document.body && {
    id: active.id, input: active.dataset?.input, field: active.dataset?.field,
    start: active.selectionStart, end: active.selectionEnd
  };
  $app.innerHTML = String(screen()) + String(toast());
  drawStages();
  reveal();
  // Re-renders triggered by a save, a toast or a data reload shouldn't steal the caret from a
  // field (e.g. tabbing to the next field in "Gestisci" while the previous one is saving).
  if (keep && (keep.id || keep.input)) {
    const el = keep.id
      ? document.getElementById(keep.id)
      : $app.querySelector(`[data-input="${keep.input}"]` + (keep.field ? `[data-field="${keep.field}"]` : ''));
    if (el) {
      el.focus();
      try { el.setSelectionRange(keep.start, keep.end); } catch { /* not a text input */ }
    }
  }
}
setRenderer(renderPage);

// ---------------------------------------------------------------- events

const H = { act: { reload: () => start() }, input: {}, change: {}, submit: {}, key: {} };
for (const mod of [commonHandlers, stageHandlers, ospedaleHandlers, mappaHandlers, repartoHandlers, gestisciHandlers, formHandlers]) {
  for (const [kind, fns] of Object.entries(mod)) {
    for (const [name, fn] of Object.entries(fns)) {
      if (H[kind][name]) throw new Error(`Handler ${kind}.${name} defined twice`);
      H[kind][name] = fn;
    }
  }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || !H.act[el.dataset.act]) return;
  e.preventDefault();
  H.act[el.dataset.act](el.dataset, el, e);
});
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (el && H.input[el.dataset.input]) H.input[el.dataset.input](el, e);
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el && H.change[el.dataset.change]) H.change[el.dataset.change](el, e);
});
document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-submit]');
  if (!form) return;
  e.preventDefault();
  H.submit[form.dataset.submit](form);
});
document.addEventListener('keydown', (e) => {
  const k = e.target.dataset?.input;
  if (k && H.key[k]) H.key[k](e.target, e);
});
installGestures();
installSearchDrop();

let lastPath = null;
window.addEventListener('hashchange', () => {
  trackHash();
  const path = currentPath();
  // A position being chosen belongs to the form that was open; the ward draft keeps its own values.
  if (path !== lastPath) dropPick();
  render();
  if (path !== lastPath) {
    window.scrollTo(0, 0);
    $app.querySelector('.scroll')?.scrollTo(0, 0);
  }
  lastPath = path;
});
window.addEventListener('online', async () => { await loadData(); render(); });
window.addEventListener('offline', () => { S.offline = true; render(); });
window.addEventListener('resize', () => {
  clearTimeout(drawStages.t);
  drawStages.t = setTimeout(() => S.data && drawStages(), 100);
});
// Refresh when the app comes back to the foreground (crews leave it open for hours).
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && navigator.onLine && !S.busy && !S.draft) {
    await loadData();
    render();
  }
});

// ---------------------------------------------------------------- start

async function start() {
  S.loadError = null;
  render();
  await Promise.all([loadData(), loadMe()]);
  lastPath = currentPath();
  render();
}

if ('serviceWorker' in navigator && VERSION !== 'dev') {
  // After a deploy the new worker takes over: reload once to pick up the new code,
  // unless someone is halfway through a form.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !S.draft && !location.hash.includes('modifica') && !location.hash.includes('nuov')) location.reload();
  });
  navigator.serviceWorker.register('/sw.js').catch(() => { /* offline mode unavailable */ });
}
start();
