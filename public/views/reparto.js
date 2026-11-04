// The ward page: where it is (entrance, lift, floor), the 4 steps, the small map, call, verify.
import { html, local, fmtDate } from '../util.js';
import { S, X, api } from '../data.js';
import { ICON, repIcon } from '../icons.js';
import { pianoInfo, corpoName, corpoWord, mapWord, ingShort, telInfo, movement } from '../domain.js';
import { render, mutate } from '../ui.js';
import { repStageHtml } from '../map/stage.js';
import { href, goBack } from '../router.js';
import { banner, tabbar, viewNotFound } from './common.js';

function steps(r) {
  const pi = pianoInfo(r._osp, r.piano);
  const multi = X.sediByOsp[r._osp.id]?.length > 1;
  return html`<div class="panel steps">
    <span class="panel-title">Percorso</span>
    <div class="step"><span class="num">1</span><div class="col"><span class="lbl">Vai a</span><b>${multi ? r._sede.nome : r._osp.nome}</b><span class="muted">${[r._sede.indirizzo || r._osp.indirizzo, r._osp.citta].filter(Boolean).join(', ')}</span></div></div>
    <div class="step"><span class="num red">2</span><div class="col"><span class="lbl">Entra da</span><b>${r._ing ? r._ing.nome : 'Ingresso non indicato'}</b>${r._ing && html`<span class="muted">${[r._ing.piano != null ? pianoInfo(r._osp, r._ing.piano).long : '', r._ing.nota].filter(Boolean).join(' · ')}</span>`}</div></div>
    <div class="step"><span class="num blue">3</span><div class="col"><span class="lbl">Prendi</span><b>${r._asc ? `Ascensore ${r._asc.sigla}${r._asc.tipo ? ' (' + r._asc.tipo + ')' : ''}` : movement(r).startsWith('S') ? 'Scale o ascensore' : 'Nessun ascensore'}</b>${(movement(r) || r._asc?.nota) && html`<span class="muted">${[movement(r), r._asc?.nota].filter(Boolean).join(' · ')}</span>`}</div></div>
    <div class="step"><span class="num dark">4</span><div class="col"><span class="lbl">Vai al</span><b>${pi.long}${r.corpo && r._osp.mappa ? `, ${corpoWord(r._osp)} ` + corpoName(r._osp, r.corpo) : ''}</b>${r.dove && html`<span class="muted">${r.dove}</span>`}</div></div>
  </div>`;
}

export function viewReparto(id) {
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
        <div class="row gap14 start"><span class="ricon big">${repIcon(r, 30)}</span><h1>${r.nome}</h1></div>
        <a class="hero-sub" href="${href('ospedale', r._osp.id)}">${r._osp.nome} · ${r._sede.nome}</a>
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
          ${repStageHtml(r._osp, r)}
          <a class="mappanel-link" href="${href('ospedale', r._osp.id, { sel: r.id })}">${ICON.layers(16)}Apri la ${mapWord(r._osp)} completa</a>
        </div>`}
        <div class="g-steps">${steps(r)}</div>
        <div class="col gap14 g-rest">
          ${r.note && html`<div class="note">${ICON.info()}<div class="col"><b>Da sapere</b><span>${r.note}</span></div></div>`}
          ${tel && (tel.href
            ? html`<a class="btn primary big" href="${tel.href}">${ICON.phone()}Chiama il reparto · ${tel.label}</a>`
            : html`<div class="btn secondary disabled">${ICON.phone()}Interno ${r.tel}</div>`)}
          ${r._osp.fonte && html`<p class="fonte">${r._osp.fonte}</p>`}
          <div class="verif">
            ${r.verificato_il ? `Verificato il ${fmtDate(r.verificato_il)}${r.verificato_da ? ' da ' + r.verificato_da : ''}` : 'Mai verificato sul posto'}
            ${S.me.canEdit && html` · <a href="${href('repartoModifica', r.id)}">Modifica</a>`}
          </div>
          ${S.me.canEdit && html`<button type="button" class="btn ghost" data-act="verify" data-id="${r.id}">${ICON.check()}Ho controllato: i dati sono corretti</button>`}
        </div>
      </div>
    </main>
    ${tabbar('')}`;
}

export const handlers = {
  act: {
    back: () => goBack(),
    toggleFav: ({ id }) => {
      S.fav.has(id) ? S.fav.delete(id) : S.fav.add(id);
      local.set('preferiti', [...S.fav]);
      render();
    },
    verify: async ({ id }) => { await mutate(() => api('POST', `reparti/${encodeURIComponent(id)}/verifica`), 'Grazie, verifica registrata'); },
  }
};
