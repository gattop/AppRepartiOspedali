import { html, raw, norm } from './util.js';
import { renderMap } from './map3d.js';

const $app = document.getElementById('app');
const VERSION = document.querySelector('meta[name="app-version"]')?.content || 'dev';
const DATA_CACHE = 'reparti-data';
const TIPI = ['Degenza', 'Ambulatorio', 'Day Hospital', 'Servizio', 'Emergenza'];

// ---------------------------------------------------------------- utilities

const local = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } }
};

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

const svg = (d, { w = 22, sw = 2.2, fill = 'none' } = {}) =>
  raw(`<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`);

const ICON = {
  search: (w) => svg('<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path>', { w }),
  hospital: (w) => svg('<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"></path><path d="M16 9h2a2 2 0 0 1 2 2v10"></path><path d="M3 21h18"></path><path d="M8 7h4M8 11h4M8 15h4"></path>', { w }),
  star: (w, fill = 'none') => svg('<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"></path>', { w, fill }),
  plus: (w) => svg('<path d="M12 5v14M5 12h14"></path>', { w }),
  back: (w = 20) => svg('<path d="M15 6l-6 6 6 6"></path>', { w, sw: 2.4 }),
  chevron: (w = 20) => svg('<path d="M9 6l6 6-6 6"></path>', { w, sw: 2.4 }),
  close: (w = 18) => svg('<path d="M6 6l12 12M18 6L6 18"></path>', { w, sw: 2.4 }),
  edit: (w = 20) => svg('<path d="M4 20h4L19 9l-4-4L4 16z"></path><path d="M13 7l4 4"></path>', { w }),
  nav: (w = 20) => svg('<path d="M3 11l18-8-8 18-2-8z"></path>', { w }),
  phone: (w = 18) => svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"></path>', { w }),
  door: (w = 14) => svg('<path d="M5 21V4a1 1 0 0 1 1-1h9l4 2v16"></path><path d="M3 21h18"></path><path d="M12 12h.01"></path>', { w, sw: 2.4 }),
  lift: (w = 14) => svg('<rect x="4" y="3" width="16" height="18" rx="2"></rect><path d="M9 9l3-3 3 3"></path><path d="M9 15l3 3 3-3"></path>', { w, sw: 2.4 }),
  info: (w = 20) => svg('<circle cx="12" cy="12" r="9"></circle><path d="M12 8h.01M11 12h1v5h1"></path>', { w }),
  layers: (w = 20) => svg('<path d="M12 3l9 5-9 5-9-5z"></path><path d="M3 13l9 5 9-5"></path>', { w }),
  check: (w = 18) => svg('<path d="M5 12l5 5L20 7"></path>', { w, sw: 2.4 }),
  pin: (w = 18) => svg('<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"></path><circle cx="12" cy="10" r="2.5"></circle>', { w })
};

// ---------------------------------------------------------------- state

const S = {
  data: null,
  me: { user: null, canEdit: false },
  offline: false,
  sessionExpired: false,
  loadError: null,
  fav: new Set(local.get('preferiti', [])),
  search: { q: '', osp: 'all' },
  sedeTab: {},
  map: {},
  mapDetail: {},
  gest: {},
  draft: null,
  pendingSelect: null,
  flash: null,
  busy: false
};

// Indexes and derived fields, rebuilt whenever data changes.
let X = null;

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

function setData(d) {
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

async function loadData() {
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

async function loadMe() {
  try {
    const res = await fetch('/api/me', { headers: { accept: 'application/json' } });
    if (res.ok) S.me = await res.json();
    else if (res.status === 401) S.sessionExpired = true;
  } catch { /* offline: keep defaults */ }
}

async function api(method, path, body) {
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

function flash(text, kind = 'ok') {
  S.flash = { text, kind };
  render();
  clearTimeout(flash.t);
  flash.t = setTimeout(() => { S.flash = null; render(); }, 3500);
}

async function mutate(fn, okText) {
  if (S.busy) return null;
  S.busy = true;
  try {
    const out = await fn();
    await loadData();
    if (okText) flash(okText);
    return out ?? true;
  } catch (e) {
    flash(e.message, 'err');
    return null;
  } finally {
    S.busy = false;
  }
}

// ---------------------------------------------------------------- domain helpers

function pianoDefault(osp, p) {
  const title = osp?.uso_livelli ? 'LIVELLO' : 'PIANO';
  if (p == null) return { short: '—', long: 'Piano non indicato', title };
  if (osp?.uso_livelli) return { short: String(p), long: 'Livello ' + p, title };
  if (p === 0) return { short: 'T', long: 'Piano terra', title };
  if (p < 0) return { short: String(p), long: 'Piano ' + p, title };
  return { short: String(p), long: p + '° piano', title };
}

// Same as the default, but with the hospital's own floor name when one is set (e.g. "Piano rialzato").
function pianoInfo(osp, p) {
  const info = pianoDefault(osp, p);
  const nome = p != null && osp?.piani?.nomi?.[p];
  return nome ? { ...info, long: nome } : info;
}

// Floors offered in the editors: the hospital's own range, else the 3D map levels, else -2..8.
function floorOptions(osp) {
  const pr = osp?.piani;
  if (pr && Number.isInteger(pr.min) && Number.isInteger(pr.max) && pr.min <= pr.max) {
    return Array.from({ length: pr.max - pr.min + 1 }, (_, i) => pr.min + i);
  }
  return osp?.mappa?.livelli || [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8];
}

const corpoName = (osp, k) => osp?.mappa?.corpi?.[k]?.label || k || '';

// When a ward moves to another body of a mapped hospital, carry over that body's lift and
// standard directions, but only where the ward still had the old body's defaults.
function corpoPatch(osp, cur, corpo) {
  const corpi = osp?.mappa?.corpi || {};
  const was = corpi[cur.corpo] || {}, now = corpi[corpo] || {};
  const patch = { corpo };
  if (now.ascensore && X.asc[now.ascensore] && cur.ascensore_id && cur.ascensore_id === was.ascensore) patch.ascensore_id = now.ascensore;
  if (now.dove && (!cur.dove || cur.dove === was.dove)) patch.dove = now.dove;
  return patch;
}

const ingShort = (ing) => (ing ? ing.sigla || ing.nome.split(' ')[0] : '—');
const ingPill = (ing) => (ing ? ing.nome.split(' – ')[0] : null);
const ascPill = (asc) => (asc ? 'Ascensore ' + asc.sigla : 'Nessun ascensore');
const sedeLabel = (r) => (r._sede && X.sediByOsp[r._osp.id]?.length > 1 ? r._sede.nome : r._osp?.citta || r._sede?.nome || '');

function telInfo(osp, tel) {
  const t = String(tel || '').replace(/[^\d+]/g, '');
  if (!t) return null;
  if (t.length <= 5) {
    const pre = String(osp?.prefisso_tel || '').replace(/[^\d+]/g, '');
    return { href: pre ? 'tel:' + pre + t : null, label: 'Int. ' + tel };
  }
  return { href: 'tel:' + t, label: tel };
}

function mapsUrl(osp, sede, ing) {
  const dest = ing && ing.lat != null && ing.lng != null
    ? `${ing.lat},${ing.lng}`
    : [sede?.indirizzo || osp?.indirizzo, osp?.citta].filter(Boolean).join(', ');
  return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + encodeURIComponent(dest);
}

// ---------------------------------------------------------------- shared UI

function banner() {
  if (S.sessionExpired) {
    const rd = encodeURIComponent('/' + location.hash);
    return html`<div class="banner err">Sessione scaduta${S.data ? ': stai vedendo i dati salvati' : ''}. <a href="/oauth2/start?rd=${rd}">Accedi</a></div>`;
  }
  if (S.offline) return html`<div class="banner warn">Offline: stai vedendo i dati salvati${S.data?.aggiornato ? ' (aggiornati al ' + fmtDate(S.data.aggiornato) + ')' : ''}.</div>`;
  return '';
}

function tabbar(active) {
  const items = [
    ['cerca', '#/', 'Cerca', ICON.search(22)],
    ['ospedali', '#/ospedali', 'Ospedali', ICON.hospital(22)],
    ['preferiti', '#/preferiti', 'Preferiti', ICON.star(22)]
  ];
  if (S.me.canEdit) items.push(['aggiungi', '#/aggiungi', 'Aggiungi', ICON.plus(22)]);
  return html`<nav class="tabbar" style="grid-template-columns: repeat(${items.length}, minmax(0, 1fr))">
    ${items.map(([k, href, label, icon]) => html`<a href="${href}" class="${k === active ? 'on' : ''}" ${k === active ? raw('aria-current="page"') : ''}>${icon}${label}</a>`)}
  </nav>`;
}

function toast() {
  return S.flash ? html`<div class="toast ${S.flash.kind}" role="status">${S.flash.text}</div>` : '';
}

function repCard(r) {
  const pi = pianoInfo(r._osp, r.piano);
  return html`<a class="rcard" href="#/reparto/${encodeURIComponent(r.id)}">
    <div class="rcard-floor"><span>${pi.title}</span><b>${pi.short}</b></div>
    <div class="rcard-body">
      <span class="rcard-title">${r.nome}</span>
      <span class="muted strong">${[r.tipo, r._osp?.nome].filter(Boolean).join(' · ')}</span>
      <span class="muted">${sedeLabel(r)}</span>
      <div class="pills">
        ${r._ing && html`<span class="pill red">${ICON.door()}${ingPill(r._ing)}</span>`}
        ${(r._asc || r.piano != null) && html`<span class="pill blue">${ICON.lift()}${ascPill(r._asc)}</span>`}
      </div>
    </div>
    <div class="rcard-go">${ICON.chevron()}</div>
  </a>`;
}

function emptyAdd(text) {
  return html`<div class="empty">
    <b>Nessun reparto trovato</b>
    <span>${text}</span>
    ${S.me.canEdit && html`<a class="btn primary" href="#/aggiungi">Aggiungi reparto</a>`}
  </div>`;
}

// ---------------------------------------------------------------- views: search

function searchResults() {
  const words = norm(S.search.q).split(/\s+/).filter(Boolean);
  const res = S.data.reparti.filter((r) => {
    if (S.search.osp !== 'all' && r._osp?.id !== S.search.osp) return false;
    return words.every((w) => r._hay.includes(w));
  });
  res.sort((a, b) => (a._osp?.nome || '').localeCompare(b._osp?.nome || '') || a.nome.localeCompare(b.nome));
  const n = res.length;
  const count = words.length ? `${n} ${n === 1 ? 'risultato' : 'risultati'} per “${S.search.q}”` : `${n} reparti`;
  return { res, count };
}

function searchList() {
  const { res, count } = searchResults();
  return html`<div class="count">${count}</div>
    <div class="cards">${res.slice(0, 200).map(repCard)}${!res.length && emptyAdd('Prova con una sigla (DH, UTIC, TAC) o aggiungilo tu.')}</div>`;
}

function viewSearch() {
  const osps = S.data.ospedali;
  const chips = [{ id: 'all', label: 'Tutti' }, ...osps.map((o) => ({ id: o.id, label: o.nome }))];
  const live = navigator.serviceWorker?.controller && !S.offline;
  return html`
    ${banner()}
    <header class="hero">
      <div class="row between">
        <div class="row gap10">
          <div class="logo">${ICON.layers()}</div>
          <div class="col">
            <span class="brand">Reparti</span>
            <span class="brand-sub">${osps.length} ospedali · ${S.data.reparti.length} reparti</span>
          </div>
        </div>
        <div class="status ${S.offline ? 'off' : ''}"><span class="dot"></span>${S.offline ? 'Offline' : live ? 'Disponibile offline' : 'Online'}</div>
      </div>
      <h1>Dove devi portare il paziente?</h1>
      <label class="search big">
        ${ICON.search(22)}
        <span class="sr">Cerca reparto, sigla o ospedale</span>
        <input type="search" data-input="searchQ" value="${S.search.q}" placeholder="Reparto, sigla, ospedale…" autocomplete="off" enterkeyhint="search">
        <button type="button" class="clear ${S.search.q ? '' : 'hide'}" data-act="clearSearch" aria-label="Cancella ricerca">${ICON.close()}</button>
      </label>
    </header>
    ${osps.length > 1 && html`<div class="chips">${chips.map((c) => html`<button type="button" class="chip ${c.id === S.search.osp ? 'on' : ''}" data-act="searchOsp" data-id="${c.id}">${c.label}</button>`)}</div>`}
    <main class="scroll" id="results">${searchList()}</main>
    ${tabbar('cerca')}`;
}

// ---------------------------------------------------------------- views: ward detail

function steps(r) {
  const pi = pianoInfo(r._osp, r.piano);
  const multi = X.sediByOsp[r._osp.id]?.length > 1;
  return html`<div class="panel steps">
    <span class="panel-title">Percorso</span>
    <div class="step"><span class="num">1</span><div class="col"><span class="lbl">Vai a</span><b>${multi ? r._sede.nome : r._osp.nome}</b><span class="muted">${[r._sede.indirizzo || r._osp.indirizzo, r._osp.citta].filter(Boolean).join(', ')}</span></div></div>
    <div class="step"><span class="num red">2</span><div class="col"><span class="lbl">Entra da</span><b>${r._ing ? r._ing.nome : 'Ingresso non indicato'}</b>${r._ing?.nota && html`<span class="muted">${r._ing.nota}</span>`}</div></div>
    <div class="step"><span class="num blue">3</span><div class="col"><span class="lbl">Prendi</span><b>${r._asc ? `Ascensore ${r._asc.sigla}${r._asc.tipo ? ' (' + r._asc.tipo + ')' : ''}` : 'Nessun ascensore'}</b>${r._asc?.nota && html`<span class="muted">${r._asc.nota}</span>`}</div></div>
    <div class="step"><span class="num dark">4</span><div class="col"><span class="lbl">Vai al</span><b>${pi.long}${r.corpo && r._osp.mappa ? ', corpo ' + corpoName(r._osp, r.corpo) : ''}</b>${r.dove && html`<span class="muted">${r.dove}</span>`}</div></div>
  </div>`;
}

function viewReparto(id) {
  const r = X.rep[id];
  if (!r) return viewNotFound();
  const pi = pianoInfo(r._osp, r.piano);
  const fav = S.fav.has(r.id);
  const tel = telInfo(r._osp, r.tel);
  const hasMap = !!(r._osp.mappa && r.corpo);
  return html`
    ${banner()}
    <header class="hero">
      <div class="row between">
        <button type="button" class="hbtn" data-act="back">${ICON.back()}Indietro</button>
        <button type="button" class="hbtn icon ${fav ? 'fav' : ''}" data-act="toggleFav" data-id="${r.id}" aria-label="${fav ? 'Togli dai preferiti' : 'Aggiungi ai preferiti'}" aria-pressed="${fav}">${ICON.star(20, fav ? 'currentColor' : 'none')}</button>
      </div>
      <div class="col gap6">
        ${r.tipo && html`<span class="eyebrow">${r.tipo}</span>`}
        <h1>${r.nome}</h1>
        <a class="hero-sub" href="#/ospedale/${encodeURIComponent(r._osp.id)}">${r._osp.nome} · ${r._sede.nome}</a>
      </div>
    </header>
    <main class="scroll pad">
      <div class="detail-grid ${hasMap ? '' : 'nomap'}">
        <div class="tiles g-tiles">
          <div class="tile"><span>INGRESSO</span><b class="red">${ingShort(r._ing)}</b></div>
          <div class="tile"><span>ASCENSORE</span><b class="blue">${r._asc ? r._asc.sigla : '—'}</b></div>
          <div class="tile dark"><span>${pi.title}</span><b>${pi.short}</b></div>
        </div>
        ${hasMap && html`<div class="panel mappanel g-map">
          ${stageHtml(r._osp, r)}
          <a class="mappanel-link" href="#/ospedale/${encodeURIComponent(r._osp.id)}?sel=${encodeURIComponent(r.id)}">${ICON.layers(16)}Apri la mappa 3D completa</a>
        </div>`}
        <div class="g-steps">${steps(r)}</div>
        <div class="col gap14 g-rest">
          ${r.note && html`<div class="note">${ICON.info()}<div class="col"><b>Da sapere</b><span>${r.note}</span></div></div>`}
          <div class="col gap8">
            <a class="btn primary big" href="${mapsUrl(r._osp, r._sede, r._ing)}" target="_blank" rel="noopener">${ICON.nav()}Naviga fino all'ingresso</a>
            ${tel && (tel.href
              ? html`<a class="btn secondary" href="${tel.href}">${ICON.phone()}Chiama il reparto · ${tel.label}</a>`
              : html`<div class="btn secondary disabled">${ICON.phone()}Interno ${r.tel}</div>`)}
          </div>
          ${r._osp.fonte && html`<p class="fonte">${r._osp.fonte}</p>`}
          <div class="verif">
            ${r.verificato_il ? `Verificato il ${fmtDate(r.verificato_il)}${r.verificato_da ? ' da ' + r.verificato_da : ''}` : 'Mai verificato sul posto'}
            ${S.me.canEdit && html` · <a href="#/reparto/${encodeURIComponent(r.id)}/modifica">Modifica</a>`}
          </div>
          ${S.me.canEdit && html`<button type="button" class="btn ghost" data-act="verify" data-id="${r.id}">${ICON.check()}Ho controllato: i dati sono corretti</button>`}
        </div>
      </div>
    </main>
    ${tabbar('')}`;
}

// ---------------------------------------------------------------- views: hospitals

function viewOspedali() {
  const osps = S.data.ospedali;
  return html`
    ${banner()}
    <header class="hero">
      <div class="row between">
        <div class="col">
          <span class="brand">Ospedali</span>
          <span class="brand-sub">${osps.length} strutture</span>
        </div>
        ${S.me.canEdit && html`<a class="hbtn" href="#/ospedali/nuovo">${ICON.plus(20)}Nuovo</a>`}
      </div>
    </header>
    <main class="scroll pad col gap10">
      ${osps.map((o) => {
        const sedi = X.sediByOsp[o.id] || [];
        const nrep = (X.repByOsp[o.id] || []).length;
        return html`<a class="ocard" href="#/ospedale/${encodeURIComponent(o.id)}">
          <div class="ocard-ico">${ICON.hospital(24)}</div>
          <div class="col gap4 grow">
            <b>${o.nome}</b>
            <span class="muted">${[o.indirizzo, o.citta].filter(Boolean).join(', ')}</span>
            <span class="muted strong">${sedi.length} ${sedi.length === 1 ? 'sede' : 'sedi'} · ${nrep} reparti${o.mappa ? ' · mappa 3D' : ''}</span>
          </div>
          <div class="rcard-go">${ICON.chevron()}</div>
        </a>`;
      })}
      ${!osps.length && html`<div class="empty"><b>Nessun ospedale</b><span>Aggiungi il primo ospedale per iniziare.</span></div>`}
      <p class="who">${S.me.user ? html`Accesso come <b>${S.me.user.name}</b> · ${S.me.canEdit ? 'puoi modificare' : 'sola lettura'} · <a href="/oauth2/sign_out?rd=%2F">Esci</a>` : ''}<br>Versione ${VERSION}</p>
      ${S.me.user && !S.me.canEdit && html`<p class="who">Per modificare serve il ruolo ${(S.me.editorGroups || []).join(' o ')}. Ruoli ricevuti: ${S.me.user.groups?.length ? S.me.user.groups.join(', ') : 'nessuno'}.</p>`}
    </main>
    ${tabbar('ospedali')}`;
}

function viewOspedale(id) {
  const o = X.osp[id];
  if (!o) return viewNotFound();
  const sedi = X.sediByOsp[o.id] || [];
  const sede = sedi.find((s) => s.id === S.sedeTab[o.id]) || sedi[0];
  const ingressi = sede ? X.ingBySede[sede.id] || [] : [];
  const ascensori = sede ? X.ascBySede[sede.id] || [] : [];
  const reparti = sede ? X.repBySede[sede.id] || [] : [];
  const nIng = sedi.reduce((n, s) => n + (X.ingBySede[s.id]?.length || 0), 0);
  const nRep = (X.repByOsp[o.id] || []).length;
  const ritorno = encodeURIComponent(location.hash);

  // "Entra da" is shown only for wards that don't use the site's usual entrance.
  const ingCount = {};
  for (const r of reparti) if (r.ingresso_id) ingCount[r.ingresso_id] = (ingCount[r.ingresso_id] || 0) + 1;
  const usual = Object.entries(ingCount).sort((a, b) => b[1] - a[1])[0]?.[0];

  const floors = {};
  for (const r of reparti) (floors[r.piano ?? 'x'] ||= []).push(r);
  const floorKeys = Object.keys(floors).sort((a, b) => (b === 'x' ? -1 : a === 'x' ? 1 : b - a));

  return html`
    ${banner()}
    <header class="hero">
      <div class="row between">
        ${o.mappa
          ? html`<a class="hbtn" href="#/ospedale/${encodeURIComponent(o.id)}">${ICON.back()}Mappa 3D</a>`
          : html`<a class="hbtn" href="#/ospedali">${ICON.back()}Ospedali</a>`}
        ${S.me.canEdit && html`<a class="hbtn" href="#/ospedale/${encodeURIComponent(o.id)}/gestisci">${ICON.edit(18)}Gestisci</a>`}
      </div>
      <div class="col gap6">
        <h1>${o.nome}</h1>
        <span class="hero-sub">${[o.indirizzo || o.citta, `${sedi.length} ${sedi.length === 1 ? 'sede' : 'sedi'}`, `${nIng} ingressi`, `${nRep} reparti`].filter(Boolean).join(' · ')}</span>
      </div>
      ${sedi.length > 1 && html`<div class="seg dark">${sedi.map((s) => html`<button type="button" class="${s.id === sede.id ? 'on' : ''}" data-act="sedeTab" data-osp="${o.id}" data-id="${s.id}">${s.nome}</button>`)}</div>`}
    </header>
    <main class="scroll">
      ${!sede
        ? html`<div class="pad"><div class="empty"><b>Nessuna sede</b><span>Un ospedale ha almeno una sede (plesso, padiglione…) con i suoi ingressi.</span>${S.me.canEdit && html`<a class="btn primary" href="#/ospedale/${encodeURIComponent(o.id)}/nuova-sede">Aggiungi sede</a>`}</div></div>`
        : html`
      <div class="sched-grid"><div class="col">
      <section class="sec">
        <div class="sec-head"><h2>Ingressi</h2><span class="muted strong">${ingressi.length} in questa sede</span></div>
        ${ingressi.map((g) => html`<div class="icard">
          <div class="icard-sig ${g.badge === 'no_barelle' ? 'grey' : ''} ${(g.sigla || '').length > 3 ? 'small' : ''}">${ingShort(g)}</div>
          <${S.me.canEdit ? raw('a') : raw('div')} class="col gap3 grow" ${S.me.canEdit ? raw(`href="#/ingresso/${encodeURIComponent(g.id)}/modifica?ritorno=${ritorno}"`) : ''}>
            <b>${g.nome}</b>
            ${g.nota && html`<span class="muted">${g.nota}</span>`}
            ${g.badge === 'ambulanze' && html`<span class="badge ok">CONSIGLIATO AMBULANZE</span>`}
            ${g.badge === 'no_barelle' && html`<span class="badge bad">NON ADATTO A BARELLE</span>`}
          </${S.me.canEdit ? raw('a') : raw('div')}>
          <a class="sqbtn" href="${mapsUrl(o, sede, g)}" target="_blank" rel="noopener" aria-label="Naviga a ${g.nome}">${ICON.nav(18)}</a>
        </div>`)}
        ${S.me.canEdit && html`<a class="btn dashed" href="#/sede/${encodeURIComponent(sede.id)}/nuovo-ingresso?ritorno=${ritorno}">+ Nuovo ingresso</a>`}
      </section>

      <section class="sec">
        <div class="sec-head"><h2>Ascensori</h2></div>
        ${ascensori.length ? html`<div class="panel list">${ascensori.map((a) => html`<${S.me.canEdit ? raw('a') : raw('div')} class="lrow" ${S.me.canEdit ? raw(`href="#/ascensore/${encodeURIComponent(a.id)}/modifica?ritorno=${ritorno}"`) : ''}>
          <span class="asig">${a.sigla}</span>
          <span>${a.tipo && html`<b>${a.tipo}</b>`}${a.tipo && a.nota ? ' · ' : ''}${a.nota}</span>
        </${S.me.canEdit ? raw('a') : raw('div')}>`)}</div>` : html`<p class="muted">Nessun ascensore registrato.</p>`}
        ${S.me.canEdit && html`<a class="btn dashed" href="#/sede/${encodeURIComponent(sede.id)}/nuovo-ascensore?ritorno=${ritorno}">+ Nuovo ascensore</a>`}
      </section>

      ${S.me.canEdit && html`<section class="sec"><div class="row gap8 wrap">
        <a class="btn ghost small" href="#/sede/${encodeURIComponent(sede.id)}/modifica?ritorno=${ritorno}">${ICON.edit(16)}Modifica sede</a>
        <a class="btn ghost small" href="#/ospedale/${encodeURIComponent(o.id)}/nuova-sede">${ICON.plus(16)}Nuova sede</a>
      </div></section>`}
      </div><div class="col">

      <section class="sec">
        <div class="sec-head"><h2>${o.uso_livelli ? 'Livelli' : 'Piani'}</h2><span class="muted strong">${sede.nome}</span></div>
        ${floorKeys.length ? html`<div class="panel floors">${floorKeys.map((k) => {
          const p = k === 'x' ? null : Number(k);
          const pi = pianoInfo(o, p);
          return html`<div class="floor">
            <div class="floor-n ${p != null && p <= 0 ? 'grey' : ''}">${pi.short}</div>
            <div class="col gap6 grow">${floors[k].map((r) => html`<a class="floor-rep" href="#/reparto/${encodeURIComponent(r.id)}">
              <span class="row between gap8"><b>${r.nome}</b><span class="asc ${r._asc ? '' : 'walk'}">${r._asc ? 'Asc. ' + r._asc.sigla : 'a piedi'}</span></span>
              ${r._ing && r.ingresso_id !== usual && html`<span class="entra">Entra da ${r._ing.nome}</span>`}
            </a>`)}</div>
          </div>`;
        })}</div>` : html`<p class="muted">Nessun reparto in questa sede.</p>`}
        ${S.me.canEdit && html`<a class="btn dashed" href="#/aggiungi?sede=${encodeURIComponent(sede.id)}">+ Nuovo reparto</a>`}
      </section>
      </div></div>
      ${o.fonte && html`<p class="fonte pad">${o.fonte}</p>`}
      `}
    </main>
    ${tabbar('ospedali')}`;
}

// ---------------------------------------------------------------- views: 3D map

function mapState(o, query) {
  let st = S.map[o.id];
  const sel = query.get('sel');
  if (!st || (sel && st.fromQuery !== sel)) {
    const r = sel && X.rep[sel];
    st = S.map[o.id] = { q: '', sel: r ? r.id : null, lvl: r && r.piano != null ? r.piano : 'all', rot: o.mappa.rot ?? -28, exp: false, fromQuery: sel };
  }
  return st;
}

// A stage is an empty `.map-stage` element in the page; it's drawn after rendering so the
// drawing can use the element's real size. With `data-rep` it shows one ward (ward page).
function stageState(el) {
  const o = X.osp[el.dataset.osp];
  if (!o?.mappa) return null;
  if (el.dataset.rep) {
    const r = X.rep[el.dataset.rep];
    const st = (S.mapDetail[o.id] ||= { rot: o.mappa.rot ?? -28, exp: false });
    st.sel = r?.id || null;
    st.lvl = r?.piano ?? 'all';
    return st;
  }
  return S.map[o.id] || null;
}

function drawStage(el) {
  const o = X.osp[el.dataset.osp];
  const st = stageState(el);
  if (!st) return;
  el.innerHTML = String(renderMap({
    mappa: o.mappa, reparti: X.repByOsp[o.id] || [], sel: st.sel, lvl: st.lvl, rot: st.rot, exp: st.exp,
    width: el.clientWidth || 390, height: el.clientHeight || 300
  }));
}

function drawStages() {
  $app.querySelectorAll('.map-stage').forEach(drawStage);
}

const stageHtml = (o, r) =>
  html`<div class="map-stage ${r ? 'small' : ''}" data-osp="${o.id}" data-rep="${r?.id || ''}"></div>`;

function mapList(o, st) {
  const corpi = o.mappa.corpi || {};
  const all = X.repByOsp[o.id] || [];
  const words = norm(st.q).split(/\s+/).filter(Boolean);
  let res;
  if (words.length) {
    res = all.filter((r) => {
      const ci = corpi[r.corpo];
      const hay = r._hay + ' ' + norm(`corpo ${ci?.short || ''} livello ${r.piano}`);
      return words.every((w) => hay.includes(w));
    });
  } else if (st.lvl !== 'all') {
    res = all.filter((r) => r.piano === st.lvl);
  } else {
    res = all.slice();
  }
  res.sort((a, b) => (a.piano ?? 99) - (b.piano ?? 99));
  const title = words.length ? 'Risultati' : st.lvl === 'all' ? 'Tutti i reparti' : 'Reparti al livello ' + st.lvl;
  return html`
    <div class="row between list-head"><b>${title}</b><span class="muted strong">${res.length} ${res.length === 1 ? 'reparto' : 'reparti'}</span></div>
    <div class="panel list tight">
      ${res.map((r) => {
        const on = r.id === st.sel;
        const ci = corpi[r.corpo];
        return html`<button type="button" class="mrow ${on ? 'on' : ''}" data-act="mapSel" data-id="${r.id}">
          <span class="mrow-l">L${r.piano ?? '?'}</span>
          <span class="col gap2 grow"><b>${r.nome}</b><span class="sub">${ci ? 'Corpo ' + ci.label : ''}${r._asc ? ' · ascensori ' + r._asc.sigla : ''}</span></span>
        </button>`;
      })}
      ${!res.length && html`<div class="pad muted center">Nessun reparto trovato.</div>`}
    </div>`;
}

function viewMappa(id, query) {
  const o = X.osp[id];
  if (!o || !o.mappa) return viewNotFound();
  const enc = encodeURIComponent(o.id);
  const st = mapState(o, query);
  const corpi = o.mappa.corpi || {};
  const levels = o.mappa.livelli || [];
  const sel = st.sel && X.rep[st.sel];
  const nCorpi = (o.mappa.blocks || []).filter((b) => !b.node).length;
  let card = '';
  if (sel) {
    const ci = corpi[sel.corpo];
    const tel = telInfo(o, sel.tel);
    card = html`<div class="panel selcard">
      <div class="row between gap10 start">
        <div class="col gap3"><span class="eyebrow red">${sel.tipo}</span><b class="selname">${sel.nome}</b></div>
        <button type="button" class="sqbtn" data-act="mapSel" data-id="" aria-label="Chiudi scheda">${ICON.close(16)}</button>
      </div>
      <div class="tiles small">
        <div class="tile dark"><span>LIVELLO</span><b>${sel.piano ?? '—'}</b></div>
        <div class="tile pink"><span>CORPO</span><b>${ci?.short || '—'}</b></div>
        <div class="tile lblue"><span>ASCENSORI</span><b>${sel._asc ? sel._asc.sigla : '—'}</b></div>
      </div>
      <div class="col gap10 ministeps">
        <div><span class="num">1</span><span>${sel._ing ? sel._ing.nome : 'Ingresso non indicato'}${sel._ing?.nota ? ' (' + sel._ing.nota + ')' : ''}</span></div>
        <div><span class="num red">2</span><span>${sel.dove || '—'}</span></div>
        <div><span class="num blue">3</span><span>${sel._asc ? `Ascensori ${sel._asc.tipo || sel._asc.sigla}: vai al livello ${sel.piano}` : 'Nessun ascensore'}</span></div>
        <div><span class="num dark">4</span><b>${pianoInfo(o, sel.piano).long}${ci ? ', corpo ' + ci.label : ''} – ${sel.nome}</b></div>
      </div>
      <div class="row gap8">
        <a class="btn primary grow" href="${mapsUrl(o, sel._sede, sel._ing)}" target="_blank" rel="noopener">${ICON.nav(18)}Naviga all'ingresso</a>
        ${tel && tel.href && html`<a class="btn secondary" href="${tel.href}">${ICON.phone(16)}${tel.label}</a>`}
        <a class="btn secondary" href="#/reparto/${encodeURIComponent(sel.id)}">Scheda</a>
      </div>
      ${o.fonte && html`<span class="fonte">${o.fonte}</span>`}
    </div>`;
  }
  return html`
    ${banner()}
    <header class="hero compact">
      <div class="row between gap10">
        <div class="row gap10 minw0">
          <a class="hbtn icon" href="#/ospedali" aria-label="Torna agli ospedali">${ICON.back()}</a>
          <div class="col minw0">
            <span class="brand">${o.nome}</span>
            <span class="brand-sub">${[o.citta, `${nCorpi} corpi`, levels.length ? `livelli ${levels[0]}–${levels[levels.length - 1]}` : '', `${(X.repByOsp[o.id] || []).length} reparti`].filter(Boolean).join(' · ')}</span>
          </div>
        </div>
        <div class="row gap6 flexnone">
          <a class="hbtn" href="#/ospedale/${enc}/scheda">${ICON.door(18)}<span class="hide-sm">Ingressi e piani</span><span class="show-sm">Scheda</span></a>
          ${S.me.canEdit && html`<a class="hbtn icon" href="#/ospedale/${enc}/gestisci" aria-label="Gestisci ospedale" title="Gestisci">${ICON.edit()}</a>`}
        </div>
      </div>
      <label class="search">
        ${ICON.search(20)}
        <span class="sr">Cerca un reparto in questo ospedale</span>
        <input type="search" data-input="mapQ" data-osp="${o.id}" value="${st.q}" placeholder="Cerca: orto, TAC, dialisi, UTIC…" autocomplete="off">
        <button type="button" class="clear ${st.q ? '' : 'hide'}" data-act="mapClear" data-osp="${o.id}" aria-label="Cancella ricerca">${ICON.close(16)}</button>
      </label>
    </header>
    <div class="map-layout">
      <div class="map-col">
        ${stageHtml(o)}
        <div class="levelbar">
          <span class="lbl">Livello</span>
          ${['all', ...levels].map((k) => html`<button type="button" class="lvl ${k === st.lvl ? 'on' : ''}" data-act="mapLvl" data-osp="${o.id}" data-lvl="${k}">${k === 'all' ? 'Tutti' : k}</button>`)}
        </div>
      </div>
      <main class="scroll pad col gap12 side-col">
        ${card}
        <div id="maplist" class="col gap8">${mapList(o, st)}</div>
      </main>
    </div>
    ${tabbar('ospedali')}`;
}

// ---------------------------------------------------------------- views: manage a hospital
// Quick editing of everything that changes over time: where each ward is (floor, body,
// entrance, lift), entrance and lift names, floor names. Every field saves on change.
// The 3D map geometry is deliberately not editable here.

const qid = (entity, id, field) => `q-${entity}-${id}-${field}`;

function quickInput(entity, row, field, { label, placeholder = '', cls = '' } = {}) {
  return html`<label class="gcell ${cls}"><span class="gl">${label}</span><input type="text" id="${qid(entity, row.id, field)}" data-change="quick" data-entity="${entity}" data-id="${row.id}" data-field="${field}" value="${row[field] ?? ''}" placeholder="${placeholder}"></label>`;
}

function quickSelect(entity, row, field, options, { label, type = '', cls = '' } = {}) {
  const cur = row[field] == null ? '' : String(row[field]);
  return html`<label class="gcell ${cls}"><span class="gl">${label}</span><select id="${qid(entity, row.id, field)}" data-change="quick" data-entity="${entity}" data-id="${row.id}" data-field="${field}" data-type="${type}">
    ${options.map(([v, l]) => html`<option value="${v}" ${String(v) === cur ? raw('selected') : ''}>${l}</option>`)}
  </select></label>`;
}

function gestReparti(o, sede, g) {
  const corpi = o.mappa?.corpi ? Object.entries(o.mappa.corpi) : [];
  const ingressi = X.ingBySede[sede.id] || [];
  const ascensori = X.ascBySede[sede.id] || [];
  const words = norm(g.q).split(/\s+/).filter(Boolean);
  const reps = (X.repBySede[sede.id] || [])
    .filter((r) => words.every((w) => r._hay.includes(w)))
    .sort((a, b) => (a.piano ?? 99) - (b.piano ?? 99) || a.nome.localeCompare(b.nome));
  const floors = floorOptions(o);
  for (const r of reps) if (r.piano != null && !floors.includes(r.piano)) floors.push(r.piano);
  floors.sort((a, b) => a - b);
  const floorOpts = [['', '—'], ...floors.map((p) => [p, pianoInfo(o, p).short + (o.piani?.nomi?.[p] ? ' · ' + o.piani.nomi[p] : '')])];
  // Two bodies can share a label (e.g. "centrale"): add the short code to tell them apart.
  const labelCount = {};
  for (const [, c] of corpi) labelCount[c.label] = (labelCount[c.label] || 0) + 1;
  const corpoOpts = [['', '—'], ...corpi.map(([k, c]) => [k, labelCount[c.label] > 1 ? `${c.label} (${k})` : c.label])];
  const ingOpts = [['', 'Nessuno'], ...ingressi.map((x) => [x.id, x.nome])];
  const ascOpts = [['', 'Nessuno (a piedi)'], ...ascensori.map((x) => [x.id, x.sigla + (x.tipo ? ' · ' + x.tipo : '')])];
  return html`
    <p class="hint">Ogni modifica si salva da sola appena cambi un campo.${corpi.length > 0 ? ' Se sposti un reparto in un altro corpo, ascensore e indicazioni standard si aggiornano di conseguenza.' : ''}</p>
    <div class="row gap8">
      <label class="search light grow">${ICON.search(18)}<span class="sr">Filtra reparti</span><input type="search" data-input="gestQ" data-osp="${o.id}" value="${g.q}" placeholder="Filtra reparti…" autocomplete="off"></label>
      <a class="btn primary small" href="#/aggiungi?sede=${encodeURIComponent(sede.id)}">${ICON.plus(16)}Reparto</a>
    </div>
    <div class="gtable reps ${corpi.length ? 'withc' : ''}">
      <div class="ghead"><span>Reparto</span><span>${o.uso_livelli ? 'Livello' : 'Piano'}</span>${corpi.length > 0 && html`<span>Corpo</span>`}<span>Ingresso</span><span>Ascensore</span><span></span></div>
      ${reps.map((r) => html`<div class="grow-r">
        ${quickInput('reparti', r, 'nome', { label: 'Reparto', cls: 'name' })}
        ${quickSelect('reparti', r, 'piano', floorOpts, { label: o.uso_livelli ? 'Livello' : 'Piano', type: 'int' })}
        ${corpi.length > 0 && quickSelect('reparti', r, 'corpo', corpoOpts, { label: 'Corpo' })}
        ${quickSelect('reparti', r, 'ingresso_id', ingOpts, { label: 'Ingresso' })}
        ${quickSelect('reparti', r, 'ascensore_id', ascOpts, { label: 'Ascensore' })}
        <a class="sqbtn gopen" href="#/reparto/${encodeURIComponent(r.id)}/modifica" aria-label="Tutti i campi di ${r.nome}" title="Tutti i campi (note, telefono, indicazioni…)">${ICON.edit(18)}</a>
      </div>`)}
      ${!reps.length && html`<div class="pad muted center">Nessun reparto${words.length ? ' corrisponde al filtro' : ' in questa sede'}.</div>`}
    </div>`;
}

function usage(field, id) {
  return S.data.reparti.filter((r) => r[field] === id).length;
}

function gestIngressi(o, sede) {
  const rows = X.ingBySede[sede.id] || [];
  const badgeOpts = [['', 'Nessuna indicazione'], ['ambulanze', 'Consigliato ambulanze'], ['no_barelle', 'Non adatto a barelle']];
  return html`
    <p class="hint">Rinominare un ingresso aggiorna subito tutti i reparti che lo usano.</p>
    <div class="gtable ings">
      <div class="ghead"><span>Sigla</span><span>Nome</span><span>Nota</span><span>Indicazione</span><span></span></div>
      ${rows.map((x) => {
        const n = usage('ingresso_id', x.id);
        return html`<div class="grow-r">
          ${quickInput('ingressi', x, 'sigla', { label: 'Sigla', placeholder: '16, PS…' })}
          ${quickInput('ingressi', x, 'nome', { label: 'Nome', cls: 'name' })}
          ${quickInput('ingressi', x, 'nota', { label: 'Nota', placeholder: 'Rampa, sosta…' })}
          ${quickSelect('ingressi', x, 'badge', badgeOpts, { label: 'Indicazione' })}
          <div class="row gap6 gact">
            <span class="usage" title="Reparti che usano questo ingresso">${n} rep.</span>
            <a class="sqbtn" href="#/ingresso/${encodeURIComponent(x.id)}/modifica?ritorno=${encodeURIComponent(location.hash)}" aria-label="Posizione e altri campi di ${x.nome}" title="Posizione GPS e altri campi">${ICON.pin()}</a>
            <button type="button" class="sqbtn danger" data-act="gestDel" data-entity="ingressi" data-id="${x.id}" data-n="${n}" aria-label="Elimina ${x.nome}">${ICON.close(16)}</button>
          </div>
        </div>`;
      })}
      ${!rows.length && html`<div class="pad muted center">Nessun ingresso in questa sede.</div>`}
    </div>
    <button type="button" class="btn dashed" data-act="gestAdd" data-entity="ingressi" data-sede="${sede.id}">+ Aggiungi ingresso</button>`;
}

function gestAscensori(o, sede) {
  const rows = X.ascBySede[sede.id] || [];
  return html`
    <p class="hint">Rinominare un ascensore aggiorna subito tutti i reparti che lo usano.</p>
    <div class="gtable ascs">
      <div class="ghead"><span>Sigla</span><span>Tipo</span><span>Dove si trova</span><span></span></div>
      ${rows.map((x) => {
        const n = usage('ascensore_id', x.id);
        return html`<div class="grow-r">
          ${quickInput('ascensori', x, 'sigla', { label: 'Sigla', placeholder: 'C, A–B…' })}
          ${quickInput('ascensori', x, 'tipo', { label: 'Tipo', placeholder: 'Montalettighe…' })}
          ${quickInput('ascensori', x, 'nota', { label: 'Dove si trova', cls: 'name' })}
          <div class="row gap6 gact">
            <span class="usage" title="Reparti che usano questo ascensore">${n} rep.</span>
            <button type="button" class="sqbtn danger" data-act="gestDel" data-entity="ascensori" data-id="${x.id}" data-n="${n}" aria-label="Elimina ascensore ${x.sigla}">${ICON.close(16)}</button>
          </div>
        </div>`;
      })}
      ${!rows.length && html`<div class="pad muted center">Nessun ascensore in questa sede.</div>`}
    </div>
    <button type="button" class="btn dashed" data-act="gestAdd" data-entity="ascensori" data-sede="${sede.id}">+ Aggiungi ascensore</button>`;
}

function gestPiani(o) {
  const floors = floorOptions(o);
  const count = {};
  for (const r of X.repByOsp[o.id] || []) if (r.piano != null) count[r.piano] = (count[r.piano] || 0) + 1;
  const outside = Object.keys(count).map(Number).filter((p) => !floors.includes(p));
  const word = o.uso_livelli ? 'livello' : 'piano';
  const mapLv = o.mappa?.livelli;
  return html`
    <div class="panel col gap14">
      <span class="panel-title">${o.uso_livelli ? 'Livelli' : 'Piani'} dell'ospedale</span>
      <div class="row gap10">
        <label class="field grow"><span>Dal ${word}</span><input type="number" id="q-piani-min" data-change="pianiRange" data-osp="${o.id}" data-k="min" value="${floors[0]}" step="1"></label>
        <label class="field grow"><span>Al ${word}</span><input type="number" id="q-piani-max" data-change="pianiRange" data-osp="${o.id}" data-k="max" value="${floors[floors.length - 1]}" step="1"></label>
      </div>
      <small class="muted">Sono i ${o.uso_livelli ? 'livelli' : 'piani'} proposti quando aggiungi o sposti un reparto. Per la numerazione (piani o livelli) usa “Dati ospedale”.</small>
      ${mapLv && html`<small class="muted">La mappa 3D disegna i livelli ${mapLv[0]}–${mapLv[mapLv.length - 1]}: un reparto su un livello diverso resta nell'elenco ma non compare sulla piantina.</small>`}
      ${outside.length > 0 && html`<small class="warn">Ci sono reparti fuori da questo intervallo (${outside.join(', ')}): restano dove sono finché non li sposti.</small>`}
    </div>
    <div class="panel list">
      ${floors.slice().reverse().map((p) => {
        const def = pianoDefault(o, p);
        return html`<div class="prow">
          <span class="floor-n ${p <= 0 ? 'grey' : ''}">${def.short}</span>
          <label class="grow"><span class="sr">Nome del ${word} ${p}</span><input type="text" id="q-piani-${p}" data-change="pianoNome" data-osp="${o.id}" data-p="${p}" value="${o.piani?.nomi?.[p] || ''}" placeholder="${def.long}"></label>
          <span class="usage">${count[p] || 0} rep.</span>
        </div>`;
      })}
    </div>
    <p class="hint">Lascia vuoto il nome per usare quello standard (es. “${pianoDefault(o, 0).long}”).</p>`;
}

function viewGestisci(id) {
  if (!S.me.canEdit) return viewForbidden();
  const o = X.osp[id];
  if (!o) return viewNotFound();
  const g = (S.gest[o.id] ||= { tab: 'reparti', q: '' });
  const sedi = X.sediByOsp[o.id] || [];
  const sede = sedi.find((s) => s.id === S.sedeTab[o.id]) || sedi[0];
  const enc = encodeURIComponent(o.id);
  const tabs = [['reparti', 'Reparti'], ['ingressi', 'Ingressi'], ['ascensori', 'Ascensori'], ['piani', o.uso_livelli ? 'Livelli' : 'Piani']];
  let body;
  if (g.tab === 'piani') body = gestPiani(o);
  else if (!sede) body = html`<div class="empty"><b>Nessuna sede</b><span>Aggiungi prima una sede (plesso, padiglione…).</span><a class="btn primary" href="#/ospedale/${enc}/nuova-sede">Aggiungi sede</a></div>`;
  else body = { reparti: gestReparti, ingressi: gestIngressi, ascensori: gestAscensori }[g.tab](o, sede, g);
  return html`
    ${banner()}
    <div class="topbar">
      <a href="#/ospedale/${enc}" class="tlink">${ICON.back(18)}Fine</a>
      <span class="ttitle">Gestisci</span>
      <a href="#/ospedale/${enc}/modifica?ritorno=${encodeURIComponent(location.hash)}" class="tlink">Dati ospedale</a>
    </div>
    <div class="gest-head">
      <div class="col gap2"><b class="gest-title">${o.nome}</b><span class="muted">${[o.citta, sede && sedi.length > 1 ? sede.nome : ''].filter(Boolean).join(' · ')}</span></div>
      ${sedi.length > 1 && g.tab !== 'piani' && html`<label class="field"><span class="sr">Sede</span><select class="sedesel" data-change="gestSede" data-osp="${o.id}">${sedi.map((s) => html`<option value="${s.id}" ${s.id === sede.id ? raw('selected') : ''}>${s.nome}</option>`)}</select></label>`}
      <div class="seg light" role="tablist">${tabs.map(([k, l]) => html`<button type="button" role="tab" aria-selected="${k === g.tab}" class="${k === g.tab ? 'on' : ''}" data-act="gestTab" data-osp="${o.id}" data-tab="${k}">${l}</button>`)}</div>
    </div>
    <main class="scroll pad col gap12 gest">${body}</main>
    ${tabbar('ospedali')}`;
}

// ---------------------------------------------------------------- views: favourites

function viewPreferiti() {
  const list = [...S.fav].map((id) => X.rep[id]).filter(Boolean);
  return html`
    ${banner()}
    <header class="hero">
      <div class="col"><span class="brand">Preferiti</span><span class="brand-sub">Salvati su questo dispositivo</span></div>
    </header>
    <main class="scroll pad col gap10">
      ${list.map(repCard)}
      ${!list.length && html`<div class="empty"><b>Nessun preferito</b><span>Apri un reparto e tocca la stella per ritrovarlo qui.</span></div>`}
    </main>
    ${tabbar('preferiti')}`;
}

function viewNotFound() {
  return html`${banner()}<header class="hero"><div class="row"><a class="hbtn" href="#/">${ICON.back()}Cerca</a></div><h1>Non trovato</h1></header>
    <main class="scroll pad"><div class="empty"><b>Questa pagina non esiste più</b><span>Forse il dato è stato eliminato o rinominato.</span></div></main>${tabbar('')}`;
}

function viewForbidden() {
  return html`${banner()}<header class="hero"><div class="row"><a class="hbtn" href="#/">${ICON.back()}Cerca</a></div><h1>Solo lettura</h1></header>
    <main class="scroll pad"><div class="empty"><b>Non hai i permessi per modificare i dati</b><span>Chiedi all'amministratore di aggiungerti al gruppo degli editor.</span></div></main>${tabbar('')}`;
}

// ---------------------------------------------------------------- views: ward form

function newDraft(r, query) {
  if (r) {
    return {
      key: r.id, id: r.id, osp: r._osp.id, sede_id: r.sede_id, nome: r.nome, tipo: r.tipo,
      ingresso_id: r.ingresso_id, ascensore_id: r.ascensore_id, piano: r.piano, corpo: r.corpo,
      dove: r.dove, note: r.note, tel: r.tel, kw: r.kw.split(/\s+/).filter(Boolean), kwInput: ''
    };
  }
  const sede = X.sede[query.get('sede')] || null;
  const osp = sede ? X.osp[sede.ospedale_id] : S.data.ospedali[0];
  return {
    key: 'new', id: null, osp: osp?.id || null, sede_id: sede?.id || (osp && X.sediByOsp[osp.id]?.[0]?.id) || null,
    nome: '', tipo: '', ingresso_id: null, ascensore_id: null, piano: null, corpo: null,
    dove: '', note: '', tel: '', kw: [], kwInput: ''
  };
}

function viewRepForm(id, query) {
  if (!S.me.canEdit) return viewForbidden();
  const r = id ? X.rep[id] : null;
  if (id && !r) return viewNotFound();
  const key = id || 'new';
  if (!S.draft || S.draft.key !== key || (key === 'new' && query.get('sede') && S.draft.sede_id !== query.get('sede') && !S.draft.touched)) {
    S.draft = newDraft(r, query);
  }
  const d = S.draft;
  if (S.pendingSelect) {
    d[S.pendingSelect.field] = S.pendingSelect.id;
    S.pendingSelect = null;
  }
  const osp = X.osp[d.osp];
  const sedi = osp ? X.sediByOsp[osp.id] || [] : [];
  const sede = X.sede[d.sede_id];
  const ingressi = sede ? X.ingBySede[sede.id] || [] : [];
  const ascensori = sede ? X.ascBySede[sede.id] || [] : [];
  const piani = floorOptions(osp).slice();
  if (d.piano != null && !piani.includes(d.piano)) piani.push(d.piano), piani.sort((a, b) => a - b);
  const corpi = osp?.mappa?.corpi ? Object.entries(osp.mappa.corpi) : [];
  const ritorno = encodeURIComponent(location.hash);
  const cancel = id ? `#/reparto/${encodeURIComponent(id)}` : '#/';
  const ing = X.ing[d.ingresso_id];
  const asc = X.asc[d.ascensore_id];
  const preview = [ing ? ingPill(ing) : 'Ingresso ?', asc ? ascPill(asc) : 'Nessun ascensore', pianoInfo(osp, d.piano).long].join(' → ');

  const chip = (field, value, label, cls = 'chip') =>
    html`<button type="button" class="${cls} ${d[field] === value ? 'on' : ''}" data-act="draftSet" data-field="${field}" data-value="${value ?? ''}" aria-pressed="${d[field] === value}">${label}</button>`;

  return html`
    ${banner()}
    <div class="topbar">
      <a href="${cancel}" class="tlink" data-act="cancelDraft" data-href="${cancel}">Annulla</a>
      <span class="ttitle">${id ? 'Modifica reparto' : 'Nuovo reparto'}</span>
      <button type="button" class="btn primary small" data-act="saveRep" ${S.busy ? raw('disabled') : ''}>Salva</button>
    </div>
    <main class="scroll pad col gap18 form">
      <div class="panel col gap14">
        <span class="panel-title">DOVE SI TROVA</span>
        <label class="field"><span>Ospedale</span>
          <select data-change="draftOsp">${S.data.ospedali.map((o) => html`<option value="${o.id}" ${o.id === d.osp ? raw('selected') : ''}>${o.nome}</option>`)}</select>
        </label>
        ${sedi.length
          ? html`<label class="field"><span>Sede / plesso / padiglione</span>
              <select data-change="draftSede">${sedi.map((s) => html`<option value="${s.id}" ${s.id === d.sede_id ? raw('selected') : ''}>${s.nome}</option>`)}</select>
            </label>`
          : osp && html`<p class="muted">Questo ospedale non ha ancora sedi. <a href="#/ospedale/${encodeURIComponent(osp.id)}/nuova-sede">Aggiungi una sede</a></p>`}
        <label class="field"><span>Nome reparto</span><input type="text" data-input="draftText" data-field="nome" value="${d.nome}" required></label>
        <div class="field"><span>Tipo</span><div class="chips wrap">${TIPI.map((t) => chip('tipo', t, t))}</div></div>
      </div>

      ${sede && html`<div class="panel col gap16">
        <span class="panel-title">COME ARRIVARCI</span>
        <div class="field"><span>Ingresso da usare</span><div class="chips wrap">
          ${ingressi.map((g) => chip('ingresso_id', g.id, g.nome.split(' – ')[0], 'chip sq red'))}
          <a class="chip sq dashed" href="#/sede/${encodeURIComponent(sede.id)}/nuovo-ingresso?ritorno=${ritorno}&scegli=ingresso_id">+ Nuovo ingresso</a>
        </div></div>
        <div class="field"><span>${osp.uso_livelli ? 'Livello' : 'Piano'}</span><div class="floorpick">
          ${piani.map((p) => chip('piano', p, pianoInfo(osp, p).short, 'fbtn'))}
        </div></div>
        ${corpi.length > 0 && html`<div class="field"><span>Corpo (per la mappa 3D)</span><div class="chips wrap">
          ${corpi.map(([k, c]) => chip('corpo', k, corpi.filter(([, x]) => x.short === c.short).length > 1 ? `${c.short} (${k})` : c.short, 'chip sq'))}
        </div></div>`}
        <div class="field"><span>Ascensore</span><div class="chips wrap">
          ${ascensori.map((a) => chip('ascensore_id', a.id, a.sigla, 'chip sq blue'))}
          ${chip('ascensore_id', null, 'Nessuno', 'chip sq')}
          <a class="chip sq dashed" href="#/sede/${encodeURIComponent(sede.id)}/nuovo-ascensore?ritorno=${ritorno}&scegli=ascensore_id">+ Nuovo</a>
        </div></div>
        <label class="field"><span>Indicazioni all'uscita dall'ascensore</span><textarea rows="2" data-input="draftText" data-field="dove">${d.dove}</textarea></label>
      </div>`}

      <div class="panel col gap16">
        <span class="panel-title">PER L'EQUIPAGGIO</span>
        <label class="field"><span>Note pratiche</span><textarea rows="3" data-input="draftText" data-field="note">${d.note}</textarea></label>
        <label class="field"><span>Telefono o interno</span><input type="tel" data-input="draftText" data-field="tel" value="${d.tel}" inputmode="tel"></label>
        <div class="field"><span>Parole chiave per la ricerca</span><div class="chips wrap">
          ${d.kw.map((k, i) => html`<button type="button" class="kw" data-act="kwDel" data-i="${i}" aria-label="Rimuovi ${k}">${k} ${ICON.close(12)}</button>`)}
          <input class="kwin" type="text" data-input="kwInput" value="${d.kwInput}" placeholder="+ aggiungi" enterkeyhint="done" autocomplete="off">
        </div></div>
      </div>

      <div class="preview">
        <span class="panel-title">ANTEPRIMA</span>
        <b>${preview}</b>
        ${d.kw.length > 0 && html`<span>Così lo vedrà chi cerca “${d.kw[0]}”${d.kw[1] ? html` o “${d.kw[1]}”` : ''}.</span>`}
      </div>

      <button type="button" class="btn primary big" data-act="saveRep" ${S.busy ? raw('disabled') : ''}>Salva reparto</button>
      ${id && html`<button type="button" class="btn danger" data-act="deleteRep" data-id="${id}">Elimina reparto</button>`}
    </main>`;
}

// ---------------------------------------------------------------- views: simple entity forms

const FORMS = {
  ospedali: {
    title: ['Nuovo ospedale', 'Modifica ospedale'],
    fields: [
      ['nome', 'Nome', 'text', { required: true }],
      ['citta', 'Città', 'text'],
      ['indirizzo', 'Indirizzo principale', 'text'],
      ['uso_livelli', 'Numerazione dei piani', 'select', { options: [['0', 'Piani (T, 1°, 2°…)'], ['1', 'Livelli (L0, L1…)']] }],
      ['prefisso_tel', 'Prefisso per gli interni', 'text', { hint: 'Es. 0731534: con l\'interno 2240 il tasto Chiama compone 07315342240.', inputmode: 'tel' }],
      ['fonte', 'Fonte dei dati / avvertenze', 'textarea']
    ],
    del: 'Eliminare l\'ospedale con tutte le sedi, gli ingressi e i reparti?'
  },
  sedi: {
    title: ['Nuova sede', 'Modifica sede'],
    fields: [
      ['nome', 'Nome sede / plesso / padiglione', 'text', { required: true }],
      ['indirizzo', 'Indirizzo (usato dal navigatore)', 'text'],
      ['ordine', 'Ordine', 'number']
    ],
    del: 'Eliminare la sede con i suoi ingressi, ascensori e reparti?'
  },
  ingressi: {
    title: ['Nuovo ingresso', 'Modifica ingresso'],
    fields: [
      ['nome', 'Nome', 'text', { required: true, hint: 'Es. Ingresso 16, Ingresso Dialisi' }],
      ['sigla', 'Sigla breve', 'text', { hint: 'Es. 16, PS, DIAL. (max 5 caratteri)', maxlength: 5 }],
      ['nota', 'Nota', 'textarea', { hint: 'Es. Rampa barellati, sosta ambulanze 15 min' }],
      ['badge', 'Indicazione', 'select', { options: [['', 'Nessuna'], ['ambulanze', 'Consigliato ambulanze'], ['no_barelle', 'Non adatto a barelle']] }],
      ['lat', 'Latitudine', 'number', { step: 'any' }],
      ['lng', 'Longitudine', 'number', { step: 'any', geo: true }],
      ['ordine', 'Ordine', 'number']
    ],
    del: 'Eliminare l\'ingresso? I reparti che lo usano resteranno senza ingresso.'
  },
  ascensori: {
    title: ['Nuovo ascensore', 'Modifica ascensore'],
    fields: [
      ['sigla', 'Sigla', 'text', { required: true, hint: 'Es. C, A–B, 1 / 2' }],
      ['tipo', 'Tipo', 'text', { hint: 'Es. Montalettighe, Pubblici' }],
      ['nota', 'Dove si trova', 'textarea'],
      ['ordine', 'Ordine', 'number']
    ],
    del: 'Eliminare l\'ascensore? I reparti che lo usano resteranno senza ascensore.'
  }
};

function viewEntityForm(entity, id, parent, query) {
  if (!S.me.canEdit) return viewForbidden();
  const cfg = FORMS[entity];
  const table = { ospedali: 'osp', sedi: 'sede', ingressi: 'ing', ascensori: 'asc' }[entity];
  const row = id ? X[table][id] : null;
  if (id && !row) return viewNotFound();
  const back = query.get('ritorno') || (entity === 'ospedali' ? (id ? `#/ospedale/${encodeURIComponent(id)}` : '#/ospedali') : '#/ospedali');
  const values = row || {};
  return html`
    ${banner()}
    <div class="topbar">
      <a href="${back}" class="tlink">Annulla</a>
      <span class="ttitle">${cfg.title[id ? 1 : 0]}</span>
      <button type="submit" form="eform" class="btn primary small" ${S.busy ? raw('disabled') : ''}>Salva</button>
    </div>
    <main class="scroll pad col gap18 form">
      <form id="eform" class="panel col gap14" data-submit="saveEntity" data-entity="${entity}" data-id="${id || ''}" data-parent="${parent || ''}" data-back="${back}" data-scegli="${query.get('scegli') || ''}" novalidate>
        ${cfg.fields.map(([name, label, type, opt = {}]) => {
          const v = values[name] ?? '';
          let input;
          if (type === 'textarea') input = html`<textarea name="${name}" rows="3">${v}</textarea>`;
          else if (type === 'select') input = html`<select name="${name}">${opt.options.map(([ov, ol]) => html`<option value="${ov}" ${String(v) === ov ? raw('selected') : ''}>${ol}</option>`)}</select>`;
          else input = html`<input type="${type}" name="${name}" value="${v}" ${opt.required ? raw('required') : ''} ${opt.step ? raw(`step="${opt.step}"`) : ''} ${opt.maxlength ? raw(`maxlength="${opt.maxlength}"`) : ''} ${opt.inputmode ? raw(`inputmode="${opt.inputmode}"`) : ''}>`;
          return html`<label class="field"><span>${label}${opt.required ? ' *' : ''}</span>${input}${opt.hint && html`<small>${opt.hint}</small>`}</label>
            ${opt.geo && html`<button type="button" class="btn ghost small" data-act="geo">${ICON.pin()}Usa la mia posizione attuale</button>`}`;
        })}
      </form>
      <button type="submit" form="eform" class="btn primary big" ${S.busy ? raw('disabled') : ''}>Salva</button>
      ${id && html`<button type="button" class="btn danger" data-act="deleteEntity" data-entity="${entity}" data-id="${id}">Elimina</button>`}
    </main>`;
}

// ---------------------------------------------------------------- router

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [p, qs] = h.split('?');
  return { parts: p.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(qs || '') };
}

function route() {
  const { parts: [a, b, c], query } = parseHash();
  switch (a) {
    case undefined: case 'cerca': return viewSearch();
    case 'reparto': return c === 'modifica' ? viewRepForm(b, query) : viewReparto(b);
    case 'aggiungi': return viewRepForm(null, query);
    case 'preferiti': return viewPreferiti();
    case 'ospedali': return b === 'nuovo' ? viewEntityForm('ospedali', null, null, query) : viewOspedali();
    case 'ospedale':
      // Hospitals with a 3D map open straight on the map; the sheet is one tap away.
      if (c === 'mappa' || (!c && X.osp[b]?.mappa)) return viewMappa(b, query);
      if (c === 'scheda' || !c) return viewOspedale(b);
      if (c === 'gestisci') return viewGestisci(b);
      if (c === 'modifica') return viewEntityForm('ospedali', b, null, query);
      if (c === 'nuova-sede') return viewEntityForm('sedi', null, b, query);
      break;
    case 'sede':
      if (c === 'modifica') return viewEntityForm('sedi', b, null, query);
      if (c === 'nuovo-ingresso') return viewEntityForm('ingressi', null, b, query);
      if (c === 'nuovo-ascensore') return viewEntityForm('ascensori', null, b, query);
      break;
    case 'ingresso': if (c === 'modifica') return viewEntityForm('ingressi', b, null, query); break;
    case 'ascensore': if (c === 'modifica') return viewEntityForm('ascensori', b, null, query); break;
  }
  return viewNotFound();
}

function render() {
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
  $app.innerHTML = String(route()) + String(toast());
  drawStages();
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

// ---------------------------------------------------------------- actions

function draftChanged() {
  S.draft.touched = true;
}

const ACT = {
  reload: () => start(),
  back: () => (history.length > 1 ? history.back() : (location.hash = '#/')),
  clearSearch: () => {
    S.search.q = '';
    render();
    $app.querySelector('[data-input="searchQ"]')?.focus();
  },
  searchOsp: ({ id }) => { S.search.osp = id; render(); },
  toggleFav: ({ id }) => {
    S.fav.has(id) ? S.fav.delete(id) : S.fav.add(id);
    local.set('preferiti', [...S.fav]);
    render();
  },
  sedeTab: ({ osp, id }) => { S.sedeTab[osp] = id; render(); },
  verify: async ({ id }) => { await mutate(() => api('POST', `reparti/${encodeURIComponent(id)}/verifica`), 'Grazie, verifica registrata'); },

  mapPick: ({ id, liv }, el) => {
    // On a ward page the small map just links to the ward that was tapped.
    if (el.closest('.map-stage').dataset.rep) {
      location.hash = `#/reparto/${encodeURIComponent(id)}`;
      return;
    }
    const st = S.map[X.rep[id]._osp.id];
    st.sel = id;
    st.lvl = Number(liv);
    render();
  },
  mapSel: ({ id }) => {
    const r = X.rep[id];
    const stage = $app.querySelector('.map-stage');
    const st = S.map[stage.dataset.osp];
    st.sel = r ? r.id : null;
    if (r && r.piano != null) st.lvl = r.piano;
    render();
    if (r) $app.querySelector('.selcard')?.scrollIntoView({ block: 'nearest' });
  },
  mapLvl: ({ osp, lvl }) => {
    const st = S.map[osp];
    st.lvl = lvl === 'all' ? 'all' : Number(lvl);
    st.sel = null;
    render();
  },
  mapExp: (_, el) => {
    const stage = el.closest('.map-stage');
    const st = stageState(stage);
    st.exp = !st.exp;
    drawStage(stage);
  },
  mapRot: ({ d }, el) => {
    const stage = el.closest('.map-stage');
    const st = stageState(stage);
    const from = st.rot, to = st.rot + Number(d), t0 = performance.now();
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    cancelAnimationFrame(ACT.mapRot.raf);
    const step = (now) => {
      const t = reduce ? 1 : Math.min(1, (now - t0) / 340);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      st.rot = from + (to - from) * e;
      if (stage.isConnected) drawStage(stage);
      if (t < 1 && stage.isConnected) ACT.mapRot.raf = requestAnimationFrame(step);
    };
    ACT.mapRot.raf = requestAnimationFrame(step);
  },

  gestTab: ({ osp, tab }) => { S.gest[osp].tab = tab; render(); },
  gestAdd: async ({ entity, sede }) => {
    const body = entity === 'ingressi' ? { sede_id: sede, nome: 'Nuovo ingresso' } : { sede_id: sede, sigla: 'Nuovo' };
    const row = await mutate(() => api('POST', entity, body), entity === 'ingressi' ? 'Ingresso aggiunto: scrivi il nome' : 'Ascensore aggiunto: scrivi la sigla');
    if (row?.id) {
      const el = document.getElementById(qid(entity, row.id, entity === 'ingressi' ? 'nome' : 'sigla'));
      el?.focus();
      el?.select();
    }
  },
  gestDel: async ({ entity, id, n }) => {
    const what = entity === 'ingressi' ? 'questo ingresso' : 'questo ascensore';
    const msg = Number(n) > 0 ? `Eliminare ${what}? ${n} reparti lo usano e resteranno senza.` : `Eliminare ${what}?`;
    if (!confirm(msg)) return;
    await mutate(() => api('DELETE', `${entity}/${encodeURIComponent(id)}`), 'Eliminato');
  },
  mapClear: ({ osp }) => {
    S.map[osp].q = '';
    render();
  },

  draftSet: ({ field, value }) => {
    const d = S.draft;
    let v = value === '' ? null : value;
    if (field === 'piano') v = v == null ? null : Number(v);
    if (field === 'corpo' && v != null && v !== d.corpo) Object.assign(d, corpoPatch(X.osp[d.osp], d, v));
    else d[field] = d[field] === v && field !== 'ascensore_id' ? null : v;
    draftChanged();
    render();
  },
  kwDel: ({ i }) => {
    S.draft.kw.splice(Number(i), 1);
    draftChanged();
    render();
  },
  cancelDraft: ({ href }) => {
    S.draft = null;
    location.hash = href;
  },
  saveRep: async () => {
    const d = S.draft;
    addKw();
    if (!d.nome.trim()) return flash('Inserisci il nome del reparto', 'err');
    if (!d.sede_id) return flash('Scegli una sede', 'err');
    const body = {
      sede_id: d.sede_id, nome: d.nome, tipo: d.tipo || '', ingresso_id: d.ingresso_id, ascensore_id: d.ascensore_id,
      piano: d.piano, corpo: d.corpo, dove: d.dove, note: d.note, tel: d.tel, kw: d.kw.join(' ')
    };
    const saved = await mutate(() => (d.id ? api('PUT', `reparti/${encodeURIComponent(d.id)}`, body) : api('POST', 'reparti', body)), 'Reparto salvato');
    if (saved) {
      S.draft = null;
      location.hash = `#/reparto/${encodeURIComponent(saved.id)}`;
    }
  },
  deleteRep: async ({ id }) => {
    if (!confirm('Eliminare questo reparto?')) return;
    if (await mutate(() => api('DELETE', `reparti/${encodeURIComponent(id)}`), 'Reparto eliminato')) {
      S.draft = null;
      S.fav.delete(id);
      local.set('preferiti', [...S.fav]);
      location.hash = '#/';
    }
  },
  deleteEntity: async ({ entity, id }) => {
    if (!confirm(FORMS[entity].del)) return;
    if (await mutate(() => api('DELETE', `${entity}/${encodeURIComponent(id)}`), 'Eliminato')) {
      location.hash = '#/ospedali';
    }
  },
  geo: () => {
    if (!navigator.geolocation) return flash('Posizione non disponibile su questo dispositivo', 'err');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const f = document.getElementById('eform');
        f.lat.value = p.coords.latitude.toFixed(6);
        f.lng.value = p.coords.longitude.toFixed(6);
        flash(`Posizione acquisita (±${Math.round(p.coords.accuracy)} m)`);
      },
      () => flash('Impossibile ottenere la posizione', 'err'),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }
};

function addKw() {
  const d = S.draft;
  const words = norm(d.kwInput).split(/[\s,]+/).filter(Boolean);
  for (const w of words) if (!d.kw.includes(w)) d.kw.push(w);
  d.kwInput = '';
  return words.length > 0;
}

const INPUT = {
  gestQ: (el) => {
    S.gest[el.dataset.osp].q = el.value;
    render();
  },
  searchQ: (el) => {
    S.search.q = el.value;
    document.getElementById('results').innerHTML = String(searchList());
    $app.querySelector('[data-act="clearSearch"]').classList.toggle('hide', !el.value);
  },
  mapQ: (el) => {
    const st = S.map[el.dataset.osp];
    st.q = el.value;
    document.getElementById('maplist').innerHTML = String(mapList(X.osp[el.dataset.osp], st));
    $app.querySelector('[data-act="mapClear"]').classList.toggle('hide', !el.value);
  },
  draftText: (el) => {
    S.draft[el.dataset.field] = el.value;
    draftChanged();
  },
  kwInput: (el) => {
    S.draft.kwInput = el.value;
    if (/[\s,]$/.test(el.value) && addKw()) {
      draftChanged();
      render();
    }
  }
};

const CHANGE = {
  // Inline edits in "Gestisci": one field, saved immediately.
  quick: async (el) => {
    const { entity, id, field, type } = el.dataset;
    let v = el.value.trim();
    if (type === 'int') v = v === '' ? null : Number(v);
    else if (field.endsWith('_id') || field === 'corpo' || field === 'badge') v = v || null;
    if ((field === 'nome' || field === 'sigla') && !v) {
      flash('Questo campo non può restare vuoto', 'err');
      return;
    }
    let patch = { [field]: v };
    let msg = 'Salvato';
    if (entity === 'reparti' && field === 'corpo' && v) {
      const r = X.rep[id];
      patch = corpoPatch(r._osp, r, v);
      if (patch.ascensore_id || patch.dove) msg = 'Salvato: aggiornati anche ascensore e indicazioni';
    }
    await mutate(() => api('PUT', `${entity}/${encodeURIComponent(id)}`, patch), msg);
  },
  gestSede: (el) => {
    S.sedeTab[el.dataset.osp] = el.value;
    render();
  },
  pianiRange: async (el) => {
    const o = X.osp[el.dataset.osp];
    const floors = floorOptions(o);
    const range = { min: floors[0], max: floors[floors.length - 1], [el.dataset.k]: Number(el.value) };
    if (!Number.isInteger(range.min) || !Number.isInteger(range.max) || range.min > range.max || range.max - range.min > 60) {
      flash('Intervallo non valido', 'err');
      render();
      return;
    }
    await mutate(() => api('PUT', `ospedali/${encodeURIComponent(o.id)}`, { piani: { ...(o.piani || {}), ...range } }), 'Salvato');
  },
  pianoNome: async (el) => {
    const o = X.osp[el.dataset.osp];
    const floors = floorOptions(o);
    const nomi = { ...(o.piani?.nomi || {}) };
    if (el.value.trim()) nomi[el.dataset.p] = el.value.trim();
    else delete nomi[el.dataset.p];
    const piani = { min: floors[0], max: floors[floors.length - 1], ...(o.piani || {}), nomi };
    await mutate(() => api('PUT', `ospedali/${encodeURIComponent(o.id)}`, { piani }), 'Salvato');
  },
  draftOsp: (el) => {
    const d = S.draft;
    d.osp = el.value;
    d.sede_id = X.sediByOsp[el.value]?.[0]?.id || null;
    d.ingresso_id = d.ascensore_id = d.corpo = null;
    draftChanged();
    render();
  },
  draftSede: (el) => {
    const d = S.draft;
    d.sede_id = el.value;
    d.ingresso_id = d.ascensore_id = null;
    draftChanged();
    render();
  }
};

const SUBMIT = {
  saveEntity: async (form) => {
    const { entity, id, parent, back, scegli } = form.dataset;
    const body = {};
    for (const [name, , type] of FORMS[entity].fields) {
      const v = form.elements[name].value.trim();
      body[name] = type === 'number' ? (v === '' ? null : Number(v)) : v;
    }
    if (entity === 'ospedali') body.uso_livelli = body.uso_livelli === '1';
    if (entity === 'sedi' && parent) body.ospedale_id = parent;
    if ((entity === 'ingressi' || entity === 'ascensori') && parent) body.sede_id = parent;
    const missing = FORMS[entity].fields.find(([name, , , opt]) => opt?.required && !body[name]);
    if (missing) return flash(`Compila il campo “${missing[1]}”`, 'err');
    const saved = await mutate(() => (id ? api('PUT', `${entity}/${encodeURIComponent(id)}`, body) : api('POST', entity, body)), 'Salvato');
    if (!saved) return;
    if (scegli && !id) S.pendingSelect = { field: scegli, id: saved.id };
    if (entity === 'ospedali' && !id) location.hash = `#/ospedale/${encodeURIComponent(saved.id)}/nuova-sede`;
    else if (entity === 'sedi' && !id) {
      S.sedeTab[saved.ospedale_id] = saved.id;
      location.hash = `#/ospedale/${encodeURIComponent(saved.ospedale_id)}`;
    } else location.hash = back;
  }
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || !ACT[el.dataset.act]) return;
  e.preventDefault();
  ACT[el.dataset.act](el.dataset, el, e);
});
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (el && INPUT[el.dataset.input]) INPUT[el.dataset.input](el, e);
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el && CHANGE[el.dataset.change]) CHANGE[el.dataset.change](el, e);
});
document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-submit]');
  if (!form) return;
  e.preventDefault();
  SUBMIT[form.dataset.submit](form);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.dataset?.input === 'kwInput') {
    e.preventDefault();
    if (addKw()) { draftChanged(); render(); }
  }
});

let lastRoute = null;
window.addEventListener('hashchange', () => {
  render();
  const path = location.hash.split('?')[0];
  if (path !== lastRoute) {
    window.scrollTo(0, 0);
    $app.querySelector('.scroll')?.scrollTo(0, 0);
  }
  lastRoute = path;
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

async function start() {
  S.loadError = null;
  render();
  await Promise.all([loadData(), loadMe()]);
  lastRoute = location.hash.split('?')[0];
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
