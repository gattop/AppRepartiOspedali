// The data: what the server sends (hospitals, sites, entrances, lifts, wards), its indexes,
// the logged-in user, and the calls to the API. Works offline from the last copy cached.
import { local, norm } from './util.js';

export const VERSION = document.querySelector('meta[name="app-version"]')?.content || 'dev';
const DATA_CACHE = 'reparti-data';
export const TIPI = ['Degenza', 'Ambulatorio', 'Day Hospital', 'Servizio', 'Emergenza'];

// ---------------------------------------------------------------- state

export const S = {
  data: null,
  me: { user: null, canEdit: false },
  offline: false,
  sessionExpired: false,
  loadError: null,
  fav: new Set(local.get('preferiti', [])),
  sedeTab: {},
  // One entry per map on screen (see map/stage.js): view (rotation, zoom, pan) and what it shows.
  stages: {},
  gest: {},
  draft: null,
  pendingSelect: null,
  flash: null,
  busy: false
};

// Indexes and derived fields, rebuilt whenever data changes.
export let X = null;

function buildIndex(d) {
  const by = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
  const group = (arr, key) => {
    const m = {};
    for (const x of arr) (m[x[key]] ||= []).push(x);
    return m;
  };
  const ix = {
    osp: by(d.ospedali), sede: by(d.sedi), ing: by(d.ingressi), asc: by(d.ascensori), rep: by(d.reparti),
    sediByOsp: group(d.sedi, 'ospedale_id'),
    ingBySede: group(d.ingressi, 'sede_id'),
    ascBySede: group(d.ascensori, 'sede_id'),
    repBySede: group(d.reparti, 'sede_id'),
    repByOsp: {}
  };
  for (const r of d.reparti) {
    const sede = ix.sede[r.sede_id];
    const osp = sede && ix.osp[sede.ospedale_id];
    const ing = r.ingresso_id ? ix.ing[r.ingresso_id] : null;
    r._sede = sede; r._osp = osp; r._ing = ing;
    r._asc = r.ascensore_id ? ix.asc[r.ascensore_id] : null;
    r._hay = norm([r.nome, r.tipo, r.kw, osp?.nome, osp?.citta, sede?.nome, ing?.nome].join(' '));
    if (osp) (ix.repByOsp[osp.id] ||= []).push(r);
  }
  return ix;
}

export function setData(d) {
  S.data = d;
  X = buildIndex(d);
}

// ---------------------------------------------------------------- network

async function cachedData() {
  try {
    const hit = await (await caches.open(DATA_CACHE)).match('/api/data');
    return hit ? hit.json() : null;
  } catch {
    return null;
  }
}

export async function loadData() {
  try {
    const res = await fetch('/api/data', { headers: { accept: 'application/json' } });
    if (res.status === 401 || res.status === 403) {
      S.sessionExpired = true;
      throw new Error('auth');
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    S.offline = res.headers.get('x-from-cache') === '1';
    S.loadError = null;
    setData(await res.json());
  } catch {
    const cached = await cachedData();
    if (cached) {
      setData(cached);
      S.offline = !S.sessionExpired;
    } else if (!S.data) {
      S.loadError = S.sessionExpired ? 'Sessione scaduta: accedi di nuovo.' : 'Impossibile caricare i dati. Controlla la connessione.';
    }
  }
}

// The app is public: /api/me answers only for logged-in users (oauth2-proxy returns 401 otherwise),
// so a 401 here just means "not logged in".
export async function loadMe() {
  try {
    const res = await fetch('/api/me', { headers: { accept: 'application/json' } });
    const me = res.ok ? await res.json().catch(() => null) : null;
    S.me = me || { user: null, canEdit: false };
  } catch { /* offline: keep what we had */ }
}

export const loginUrl = () => '/oauth2/start?rd=' + encodeURIComponent('/' + location.hash);

export async function api(method, path, body) {
  let res;
  try {
    res = await fetch('/api/' + path, {
      method,
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new Error('Sei offline: impossibile salvare ora.');
  }
  if (res.status === 401) {
    S.sessionExpired = true;
    throw new Error('Sessione scaduta: accedi di nuovo.');
  }
  if (!res.ok) {
    let msg = 'Errore ' + res.status;
    try { msg = (await res.json()).error || msg; } catch { /* not json */ }
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}
