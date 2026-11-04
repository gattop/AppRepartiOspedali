// A hospital's sheet: entrances, lifts and the wards floor by floor, for each site.
import { html } from '../util.js';
import { S, X } from '../data.js';
import { ICON, repIcon } from '../icons.js';
import { pianoInfo, floorWord, isPlan, ingShort } from '../domain.js';
import { render } from '../ui.js';
import { href } from '../router.js';
import { banner, tabbar, viewNotFound, linkOrDiv } from './common.js';

export function viewOspedale(id) {
  const o = X.osp[id];
  if (!o) return viewNotFound();
  const sedi = X.sediByOsp[o.id] || [];
  const sede = sedi.find((s) => s.id === S.sedeTab[o.id]) || sedi[0];
  const ingressi = sede ? X.ingBySede[sede.id] || [] : [];
  const ascensori = sede ? X.ascBySede[sede.id] || [] : [];
  const reparti = sede ? X.repBySede[sede.id] || [] : [];
  const nIng = sedi.reduce((n, s) => n + (X.ingBySede[s.id]?.length || 0), 0);
  const nRep = (X.repByOsp[o.id] || []).length;
  const ritorno = location.hash;

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
          ? html`<a class="hbtn" href="${href('ospedale', o.id)}">${ICON.back()}${isPlan(o) ? 'Pianta' : 'Mappa 3D'}</a>`
          : html`<a class="hbtn" href="${href('home')}">${ICON.back()}Ospedali</a>`}
        ${S.me.canEdit && html`<a class="hbtn" href="${href('gestisci', o.id)}">${ICON.edit(18)}Gestisci</a>`}
      </div>
      <div class="col gap6">
        <h1>${o.nome}</h1>
        <span class="hero-sub">${[o.indirizzo || o.citta, `${sedi.length} ${sedi.length === 1 ? 'sede' : 'sedi'}`, `${nIng} ingressi`, `${nRep} reparti`].filter(Boolean).join(' · ')}</span>
      </div>
      ${sedi.length > 1 && html`<div class="seg dark">${sedi.map((s) => html`<button type="button" class="${s.id === sede.id ? 'on' : ''}" data-act="sedeTab" data-osp="${o.id}" data-id="${s.id}">${s.nome}</button>`)}</div>`}
    </header>
    <main class="scroll">
      ${!sede
        ? html`<div class="pad"><div class="empty"><b>Nessuna sede</b><span>Un ospedale ha almeno una sede (plesso, padiglione…) con i suoi ingressi.</span>${S.me.canEdit && html`<a class="btn primary" href="${href('nuovaSede', o.id)}">Aggiungi sede</a>`}</div></div>`
        : html`
      <div class="sched-grid"><div class="col">
      <section class="sec">
        <div class="sec-head"><h2>Ingressi</h2><span class="muted strong">${ingressi.length} in questa sede</span></div>
        ${ingressi.map((g) => html`<div class="icard">
          <div class="icard-sig ${g.badge === 'no_barelle' ? 'grey' : ''} ${(g.sigla || '').length > 3 ? 'small' : ''}">${ingShort(g)}</div>
          ${linkOrDiv(S.me.canEdit, href('ingressoModifica', g.id, { ritorno }), 'col gap3 grow', html`
            <b>${g.nome}</b>
            ${g.nota && html`<span class="muted">${g.nota}</span>`}
            ${g.badge === 'ambulanze' && html`<span class="badge ok">CONSIGLIATO AMBULANZE</span>`}
            ${g.badge === 'no_barelle' && html`<span class="badge bad">NON ADATTO A BARELLE</span>`}
          `)}
          ${g.piano != null && html`<span class="ing-floor" title="${pianoInfo(o, g.piano).long}"><small>${floorWord(o).abbr}</small>${pianoInfo(o, g.piano).short}</span>`}
        </div>`)}
        ${S.me.canEdit && html`<a class="btn dashed" href="${href('nuovoIngresso', sede.id, { ritorno })}">+ Nuovo ingresso</a>`}
      </section>

      <section class="sec">
        <div class="sec-head"><h2>Ascensori</h2></div>
        ${ascensori.length ? html`<div class="panel list">${ascensori.map((a) => linkOrDiv(S.me.canEdit, href('ascensoreModifica', a.id, { ritorno }), 'lrow', html`
          <span class="asig">${a.sigla}</span>
          <span>${a.tipo && html`<b>${a.tipo}</b>`}${a.tipo && a.nota ? ' · ' : ''}${a.nota}</span>
        `))}</div>` : html`<p class="muted">Nessun ascensore registrato.</p>`}
        ${S.me.canEdit && html`<a class="btn dashed" href="${href('nuovoAscensore', sede.id, { ritorno })}">+ Nuovo ascensore</a>`}
      </section>

      ${S.me.canEdit && html`<section class="sec"><div class="row gap8 wrap">
        <a class="btn ghost small" href="${href('sedeModifica', sede.id, { ritorno })}">${ICON.edit(16)}Modifica sede</a>
        <a class="btn ghost small" href="${href('nuovaSede', o.id)}">${ICON.plus(16)}Nuova sede</a>
      </div></section>`}
      </div><div class="col">

      <section class="sec">
        <div class="sec-head"><h2>${floorWord(o).Words}</h2><span class="muted strong">${sede.nome}</span></div>
        ${floorKeys.length ? html`<div class="panel floors">${floorKeys.map((k) => {
          const p = k === 'x' ? null : Number(k);
          const pi = pianoInfo(o, p);
          return html`<div class="floor">
            <div class="floor-n ${p != null && p <= 0 ? 'grey' : ''}">${pi.short}</div>
            <div class="col gap6 grow">${floors[k].map((r) => html`<a class="floor-rep" href="${href('reparto', r.id)}">
              <span class="row between gap8"><span class="row gap8 minw0"><span class="ricon xs">${repIcon(r, 15)}</span><b>${r.nome}</b></span><span class="asc ${r._asc ? '' : 'walk'}">${r._asc ? 'Asc. ' + r._asc.sigla : 'a piedi'}</span></span>
              ${r._ing && r.ingresso_id !== usual && html`<span class="entra">Entra da ${r._ing.nome}</span>`}
            </a>`)}</div>
          </div>`;
        })}</div>` : html`<p class="muted">Nessun reparto in questa sede.</p>`}
        ${S.me.canEdit && html`<a class="btn dashed" href="${href('aggiungi', null, { sede: sede.id })}">+ Nuovo reparto</a>`}
      </section>
      </div></div>
      ${o.fonte && html`<p class="fonte pad">${o.fonte}</p>`}
      `}
    </main>
    ${tabbar('ospedali')}`;
}

export const handlers = {
  act: {
    sedeTab: ({ osp, id }) => { S.sedeTab[osp] = id; render(); },
  }
};
