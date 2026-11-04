// Addresses of the screens. The app uses hash routes (#/reparto/abc); this table is the only place
// that knows their shape: links are built with href(), the current page is read with currentRoute().

const ROUTES = {
  home: '',
  preferiti: 'preferiti',
  aggiungi: 'aggiungi', //                         ?sede=
  reparto: 'reparto/:id',
  repartoModifica: 'reparto/:id/modifica',
  ospedale: 'ospedale/:id', //                      map if it has one, else the sheet; ?sel=
  scheda: 'ospedale/:id/scheda',
  gestisci: 'ospedale/:id/gestisci',
  ospedaleModifica: 'ospedale/:id/modifica', //     ?ritorno=
  nuovaSede: 'ospedale/:id/nuova-sede',
  nuovoOspedale: 'ospedali/nuovo',
  sedeModifica: 'sede/:id/modifica',
  nuovoIngresso: 'sede/:id/nuovo-ingresso', //     ?ritorno= &scegli=
  nuovoAscensore: 'sede/:id/nuovo-ascensore',
  ingressoModifica: 'ingresso/:id/modifica',
  ascensoreModifica: 'ascensore/:id/modifica'
};

// Older addresses that still work.
const ALIASES = { cerca: 'home', ospedali: 'home', 'ospedale/:id/mappa': 'ospedale' };

// href('reparto', 'abc') -> '#/reparto/abc'; query values that are empty are left out.
export function href(name, id, query = {}) {
  const path = ROUTES[name].replace(':id', encodeURIComponent(id ?? ''));
  const qs = Object.entries(query).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return '#/' + path + (qs ? '?' + qs : '');
}

// The current address as { name, id, query }, or null for an unknown one.
export function currentRoute() {
  const [p, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const parts = p.split('/').filter(Boolean).map(decodeURIComponent);
  const query = new URLSearchParams(qs || '');
  for (const [pattern, name] of [...Object.entries(ROUTES).map(([n, pt]) => [pt, n]), ...Object.entries(ALIASES)]) {
    const seg = pattern.split('/').filter(Boolean);
    if (seg.length !== parts.length) continue;
    let id = null;
    if (seg.every((s, i) => (s === ':id' ? ((id = parts[i]), true) : s === parts[i]))) return { name, id, query };
  }
  return null;
}

// The page itself, without the query: a new value means a new screen.
export const currentPath = () => location.hash.split('?')[0];

// ---------------------------------------------------------------- leaving a form
// The previous and current address, to know where the user came from.
let prevHash = null;
let curHash = location.hash;
export function trackHash() {
  prevHash = curHash;
  curHash = location.hash;
}

// "Salva": if the page to go to is the one the user came from, step back in the history; otherwise
// the form's entry is replaced. Either way the form doesn't stay in the history, so "Indietro" on
// the next page can't bring it back (and loop).
export function leave(to) {
  if (to && to === prevHash && history.length > 1) history.back();
  else location.replace(to || '#/');
}

// "Annulla" / "Fine": back to wherever the form was opened from; `to` only when it was opened directly.
export function cancelTo(to) {
  if (prevHash && history.length > 1) history.back();
  else location.replace(to || '#/');
}

export function goBack() {
  if (history.length > 1) history.back();
  else location.hash = '#/';
}
