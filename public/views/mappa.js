// A hospital's map page: the 3D map or 2D plan, the floors bar, the search, the ward list.
import { html, norm } from '../util.js';
import { S, X } from '../data.js';
import { ICON, repIcon } from '../icons.js';
import { pianoInfo, floorWord, floorTag, isPlan, corpoWord, Corpo, telInfo, movement } from '../domain.js';
import { $app, render } from '../ui.js';
import { mapStageHtml, newStage, homeView } from '../map/stage.js';
import { href } from '../router.js';
import { banner, tabbar, viewNotFound } from './common.js';

// State of a hospital's map page (see map/stage.js): q = search, sel = ward selected, lvl = level shown.
const mapSt = (ospId) => S.stages['map:' + ospId];

// Opening the page with ?sel=<ward> (from a ward page) starts on that ward and its level.
function mapState(o, query) {
  let st = mapSt(o.id);
  const sel = query.get('sel');
  if (!st || (sel && st.fromQuery !== sel)) {
    const r = sel && X.rep[sel];
    st = S.stages['map:' + o.id] = newStage(o, { q: '', sel: r ? r.id : null, lvl: r && r.piano != null ? r.piano : 'all', fromQuery: sel });
  }
  return st;
}

// Wards of the hospital matching the search text, lowest floor first.
function mapMatches(o, q) {
  const corpi = o.mappa.corpi || {};
  const words = norm(q).split(/\s+/).filter(Boolean);
  return (X.repByOsp[o.id] || [])
    .filter((r) => {
      const hay = r._hay + ' ' + norm(`${corpoWord(o)} ${corpi[r.corpo]?.short || ''} livello ${r.piano}`);
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => (a.piano ?? 99) - (b.piano ?? 99));
}

// One row of a ward list on the map page (the list under the map and the search drop-down).
function mapRow(o, r, act, on = false) {
  const ci = o.mappa.corpi?.[r.corpo];
  return html`<button type="button" class="mrow ${on ? 'on' : ''}" data-act="${act}" data-id="${r.id}">
    <span class="mrow-l">${floorTag(o, r.piano)}</span>
    <span class="ricon">${repIcon(r, 18)}</span>
    <span class="col gap2 grow"><b>${r.nome}</b><span class="sub">${ci ? Corpo(o) + ' ' + ci.label : ''}${r._asc ? ' · ascensori ' + r._asc.sigla : ''}</span></span>
  </button>`;
}

// ---- search drop-down: the matches right under the search box. It closes on Enter only if there's
// nothing to choose (one match opens the ward), and on any scroll, tap elsewhere or Esc; the list
// under the map keeps showing the same matches.
let dropGuard = 0;

function dropShow(o, q) {
  const box = document.getElementById('search-drop');
  if (!box) return;
  if (!norm(q).trim()) return dropHide();
  const res = mapMatches(o, q);
  box.innerHTML = String(html`${res.map((r) => mapRow(o, r, 'dropOpen'))}${!res.length && html`<div class="search-none">Nessun reparto trovato</div>`}`);
  box.hidden = false;
  box.scrollTop = 0;
  box.closest('.hero')?.classList.add('dropping');
}

function dropHide() {
  const box = document.getElementById('search-drop');
  if (!box || box.hidden) return;
  box.hidden = true;
  box.closest('.hero')?.classList.remove('dropping');
}

function mapList(o, st) {
  const all = X.repByOsp[o.id] || [];
  const words = norm(st.q).split(/\s+/).filter(Boolean);
  let res;
  if (words.length) {
    res = mapMatches(o, st.q);
  } else if (st.lvl !== 'all') {
    res = all.filter((r) => r.piano === st.lvl);
  } else {
    res = all.slice();
  }
  res.sort((a, b) => (a.piano ?? 99) - (b.piano ?? 99));
  const title = words.length ? 'Risultati' : st.lvl === 'all' ? 'Tutti i reparti' : o.uso_livelli ? 'Reparti al livello ' + st.lvl : 'Reparti: ' + pianoInfo(o, st.lvl).long.toLowerCase();
  return html`
    <div class="row between list-head"><b>${title}</b><span class="muted strong">${res.length} ${res.length === 1 ? 'reparto' : 'reparti'}</span></div>
    <div class="panel list tight">
      ${res.map((r) => mapRow(o, r, 'mapSel', r.id === st.sel))}
      ${!res.length && html`<div class="pad muted center">Nessun reparto trovato.</div>`}
    </div>`;
}

export function viewMappa(id, query) {
  const o = X.osp[id];
  if (!o || !o.mappa) return viewNotFound();
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
        <div class="row gap12 start minw0"><span class="ricon big">${repIcon(sel, 26)}</span><div class="col gap3 minw0"><span class="eyebrow red">${sel.tipo}</span><b class="selname">${sel.nome}</b></div></div>
        <button type="button" class="sqbtn" data-act="mapSel" data-id="" aria-label="Chiudi scheda">${ICON.close(16)}</button>
      </div>
      <div class="tiles small">
        <div class="tile dark"><span>${pianoInfo(o, sel.piano).title}</span><b>${pianoInfo(o, sel.piano).short}</b></div>
        <div class="tile pink"><span>${corpoWord(o).toUpperCase()}</span><b>${ci?.short || '—'}</b></div>
        <div class="tile lblue"><span>ASCENSORI</span><b>${sel._asc ? sel._asc.sigla : '—'}</b></div>
      </div>
      <div class="col gap10 ministeps">
        <div><span class="num">1</span><span>${sel._ing ? sel._ing.nome : 'Ingresso non indicato'}${sel._ing?.piano != null ? ' · ' + pianoInfo(o, sel._ing.piano).long : ''}${sel._ing?.nota ? ' (' + sel._ing.nota + ')' : ''}</span></div>
        <div><span class="num red">2</span><span>${sel.dove || '—'}</span></div>
        <div><span class="num blue">3</span><span>${[sel._asc ? `Ascensori ${sel._asc.tipo || sel._asc.sigla}` : movement(sel).startsWith('S') ? 'Scale o ascensore' : 'Nessun ascensore', movement(sel)].filter(Boolean).join(': ')}</span></div>
        <div><span class="num dark">4</span><b>${pianoInfo(o, sel.piano).long}${ci ? `, ${corpoWord(o)} ` + ci.label : ''} – ${sel.nome}</b></div>
      </div>
      <div class="row gap8">
        <a class="btn primary grow" href="${href('reparto', sel.id)}">Apri la scheda</a>
        ${tel && tel.href && html`<a class="btn secondary" href="${tel.href}">${ICON.phone(16)}${tel.label}</a>`}
      </div>
      ${o.fonte && html`<span class="fonte">${o.fonte}</span>`}
    </div>`;
  }
  return html`
    ${banner()}
    <header class="hero compact">
      <div class="row between gap10">
        <div class="row gap10 minw0">
          <a class="hbtn icon" href="${href('home')}" aria-label="Torna agli ospedali">${ICON.back()}</a>
          <div class="col minw0">
            <span class="brand">${o.nome}</span>
            <span class="brand-sub">${[o.citta, `${nCorpi} ${isPlan(o) ? 'palazzine' : 'corpi'}`, levels.length && o.uso_livelli ? `livelli ${levels[0]}–${levels[levels.length - 1]}` : '', `${(X.repByOsp[o.id] || []).length} reparti`].filter(Boolean).join(' · ')}</span>
          </div>
        </div>
        <div class="row gap6 flexnone">
          <a class="hbtn" href="${href('scheda', o.id)}">${ICON.door(18)}<span class="hide-sm">Ingressi e piani</span><span class="show-sm">Scheda</span></a>
          ${S.me.canEdit && html`<a class="hbtn icon" href="${href('gestisci', o.id)}" aria-label="Gestisci ospedale" title="Gestisci">${ICON.edit()}</a>`}
        </div>
      </div>
      <div class="search-wrap">
        <label class="search">
          ${ICON.search(20)}
          <span class="sr">Cerca un reparto in questo ospedale</span>
          <input type="search" data-input="mapQ" data-osp="${o.id}" value="${st.q}" placeholder="Cerca: orto, TAC, dialisi, UTIC…" autocomplete="off" enterkeyhint="search" aria-controls="search-drop">
          <button type="button" class="clear ${st.q ? '' : 'hide'}" data-act="mapClear" data-osp="${o.id}" aria-label="Cancella ricerca">${ICON.close(16)}</button>
        </label>
        <div class="search-drop" id="search-drop" role="listbox" aria-label="Reparti trovati" hidden></div>
      </div>
    </header>
    <div class="map-layout">
      <div class="map-col">
        ${mapStageHtml(o)}
        <div class="levelbar">
          <span class="lbl">${floorWord(o).Word}</span>
          ${['all', ...levels].map((k) => html`<button type="button" class="lvl ${k === st.lvl ? 'on' : ''}" data-act="mapLvl" data-osp="${o.id}" data-lvl="${k}" title="${k === 'all' ? '' : pianoInfo(o, k).long}">${k === 'all' ? 'Tutti' : pianoInfo(o, k).short}</button>`)}
        </div>
      </div>
      <main class="scroll pad col gap12 side-col">
        ${card}
        <div id="maplist" class="col gap8">${mapList(o, st)}</div>
      </main>
    </div>
    ${tabbar('ospedali')}`;
}

export const handlers = {
  act: {
    mapPick: ({ id, liv }, el) => {
      // On a ward page the small map just links to the ward that was tapped.
      if (el.closest('.map-stage').dataset.rep) {
        location.hash = href('reparto', id);
        return;
      }
      const r = X.rep[id];
      const st = mapSt(r._osp.id);
      st.sel = id;
      if (st.lvl !== (liv === undefined ? r.piano ?? 'all' : Number(liv))) homeView(st);
      // The 2D plan shows every floor at once: tapping a building opens its first ward's floor.
      st.lvl = liv === undefined ? r.piano ?? 'all' : Number(liv);
      render();
    },
    mapSel: ({ id }) => {
      const r = X.rep[id];
      const stage = $app.querySelector('.map-stage');
      const st = mapSt(stage.dataset.osp);
      st.sel = r ? r.id : null;
      if (r && r.piano != null) {
        if (st.lvl !== r.piano) homeView(st);
        st.lvl = r.piano;
      }
      render();
      if (r) $app.querySelector('.selcard')?.scrollIntoView({ block: 'nearest' });
    },
    mapLvl: ({ osp, lvl }) => {
      const st = mapSt(osp);
      st.lvl = lvl === 'all' ? 'all' : Number(lvl);
      st.sel = null;
      homeView(st);
      render();
    },
    mapClear: ({ osp }) => {
      mapSt(osp).q = '';
      render();
    },
    dropOpen: ({ id }) => {
      dropHide();
      location.hash = href('reparto', id);
    },
  },
  input: {
    mapQ: (el) => {
      const st = mapSt(el.dataset.osp);
      st.q = el.value;
      document.getElementById('maplist').innerHTML = String(mapList(X.osp[el.dataset.osp], st));
      $app.querySelector('[data-act="mapClear"]').classList.toggle('hide', !el.value);
      dropShow(X.osp[el.dataset.osp], el.value);
    }
  },
  key: {
    // Enter closes the keyboard: one match opens its ward, several stay listed under the box.
    mapQ: (el, e) => {
      if (e.key === 'Escape') return dropHide();
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const o = X.osp[el.dataset.osp];
      const res = norm(el.value).trim() ? mapMatches(o, el.value) : [];
      // Closing the keyboard scrolls/resizes the page on phones: that mustn't close the list.
      dropGuard = performance.now() + 700;
      el.blur();
      if (res.length === 1) {
        dropHide();
        location.hash = href('reparto', res[0].id);
      } else dropShow(o, el.value);
    }
  }
};

// The drop-down goes away with anything else: a scroll (except inside it), or a tap outside the search;
// it comes back when the search box gets the focus again.
export function installSearchDrop() {
  document.addEventListener('scroll', (e) => {
    if (performance.now() < dropGuard || e.target?.closest?.('.search-drop')) return;
    dropHide();
  }, true);
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.search-wrap')) dropHide();
  });
  document.addEventListener('focusin', (e) => {
    if (e.target.dataset?.input === 'mapQ') dropShow(X.osp[e.target.dataset.osp], e.target.value);
  });
}
