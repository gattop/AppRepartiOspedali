// "Gestisci": quick editing of a hospital in tables, every field saved as soon as it changes.
import { html, raw, norm } from '../util.js';
import { S, X, api } from '../data.js';
import { ICON } from '../icons.js';
import { pianoInfo, pianoDefault, floorOptions, floorWord, isPlan, isPalazzine, mapWord, Corpo, corpoPatch } from '../domain.js';
import { render, flash, mutate } from '../ui.js';
import { href } from '../router.js';
import { banner, tabbar, viewNotFound, viewForbidden } from './common.js';

// Quick editing of everything that changes over time: where each ward is (floor, body,
// entrance, lift), entrance and lift names, floor names. Every field saves on change.
// The map drawing itself is deliberately not editable here.

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
  const floors = floorOptions(o).slice();
  for (const r of reps) if (r.piano != null && !floors.includes(r.piano)) floors.push(r.piano);
  floors.sort((a, b) => a - b);
  const floorOpts = [['', '—'], ...floors.map((p) => [p, pianoInfo(o, p).short + (o.piani?.nomi?.[p] ? ' · ' + o.piani.nomi[p] : '')])];
  const corpoOpts = corpoOptions(o);
  const ingOpts = [['', 'Nessuno'], ...ingressi.map((x) => [x.id, x.nome])];
  const ascOpts = [['', 'Nessuno (a piedi)'], ...ascensori.map((x) => [x.id, x.sigla + (x.tipo ? ' · ' + x.tipo : '')])];
  return html`
    <p class="hint">Ogni modifica si salva da sola appena cambi un campo.${corpi.length > 0 ? ` Se sposti un reparto in un${isPalazzine(o) ? 'a' : ''} altr${isPalazzine(o) ? 'a' : 'o'} ${Corpo(o).toLowerCase()}, ascensore e indicazioni standard si aggiornano di conseguenza.` : ''}</p>
    <div class="row gap8">
      <label class="search light grow">${ICON.search(18)}<span class="sr">Filtra reparti</span><input type="search" data-input="gestQ" data-osp="${o.id}" value="${g.q}" placeholder="Filtra reparti…" autocomplete="off"></label>
      <a class="btn primary small" href="${href('aggiungi', null, { sede: sede.id })}">${ICON.plus(16)}Reparto</a>
    </div>
    <div class="gtable reps ${corpi.length ? 'withc' : ''}">
      <div class="ghead"><span>Reparto</span><span>${floorWord(o).Word}</span>${corpi.length > 0 && html`<span>${Corpo(o)}</span>`}<span>Ingresso</span><span>Ascensore</span><span></span></div>
      ${reps.map((r) => html`<div class="grow-r">
        ${quickInput('reparti', r, 'nome', { label: 'Reparto', cls: 'name' })}
        ${quickSelect('reparti', r, 'piano', floorOpts, { label: floorWord(o).Word, type: 'int' })}
        ${corpi.length > 0 && quickSelect('reparti', r, 'corpo', corpoOpts, { label: Corpo(o) })}
        ${quickSelect('reparti', r, 'ingresso_id', ingOpts, { label: 'Ingresso' })}
        ${quickSelect('reparti', r, 'ascensore_id', ascOpts, { label: 'Ascensore' })}
        <a class="sqbtn gopen" href="${href('repartoModifica', r.id)}" aria-label="Tutti i campi di ${r.nome}" title="Tutti i campi (note, telefono, indicazioni…)">${ICON.edit(18)}</a>
      </div>`)}
      ${!reps.length && html`<div class="pad muted center">Nessun reparto${words.length ? ' corrisponde al filtro' : ' in questa sede'}.</div>`}
    </div>`;
}

// Bodies of the 3D map as select options; two bodies can share a label (e.g. "centrale"),
// so the code is added to tell them apart. Just [['', '—']] for hospitals without a map.
function corpoOptions(o) {
  const corpi = o.mappa?.corpi ? Object.entries(o.mappa.corpi) : [];
  const count = {};
  for (const [, c] of corpi) count[c.label] = (count[c.label] || 0) + 1;
  return [['', '—'], ...corpi.map(([k, c]) => [k, count[c.label] > 1 ? `${c.label} (${k})` : c.label])];
}

function usage(field, id) {
  return S.data.reparti.filter((r) => r[field] === id).length;
}

function gestIngressi(o, sede) {
  const rows = X.ingBySede[sede.id] || [];
  const badgeOpts = [['', 'Nessuna indicazione'], ['ambulanze', 'Consigliato ambulanze'], ['no_barelle', 'Non adatto a barelle']];
  const floors = floorOptions(o).slice();
  for (const x of rows) if (x.piano != null && !floors.includes(x.piano)) floors.push(x.piano);
  floors.sort((a, b) => a - b);
  const floorOpts = [['', '—'], ...floors.map((p) => [p, pianoInfo(o, p).short])];
  const corpi = o.mappa?.corpi ? Object.entries(o.mappa.corpi) : [];
  const corpoOpts = corpoOptions(o);
  return html`
    <p class="hint">Rinominare un ingresso aggiorna subito tutti i reparti che lo usano.${corpi.length > 0 ? ` Per mettere un puntino preciso sulla ${mapWord(o)} usa il pulsante con la mappa.` : ''}</p>
    <div class="gtable ings ${corpi.length ? 'withc' : ''}">
      <div class="ghead"><span>Sigla</span><span>Nome</span><span>${floorWord(o).Word}</span>${corpi.length > 0 && html`<span>${Corpo(o)}</span>`}<span>Nota</span><span>Indicazione</span><span></span></div>
      ${rows.map((x) => {
        const n = usage('ingresso_id', x.id);
        return html`<div class="grow-r">
          ${quickInput('ingressi', x, 'sigla', { label: 'Sigla', placeholder: '16, PS…' })}
          ${quickInput('ingressi', x, 'nome', { label: 'Nome', cls: 'name' })}
          ${quickSelect('ingressi', x, 'piano', floorOpts, { label: floorWord(o).Word, type: 'int' })}
          ${corpi.length > 0 && quickSelect('ingressi', x, 'corpo', corpoOpts, { label: Corpo(o) })}
          ${quickInput('ingressi', x, 'nota', { label: 'Nota', placeholder: 'Rampa, sosta…' })}
          ${quickSelect('ingressi', x, 'badge', badgeOpts, { label: 'Indicazione' })}
          <div class="row gap6 gact">
            <span class="usage" title="Reparti che usano questo ingresso">${n} rep.</span>
            <a class="sqbtn" href="${href('ingressoModifica', x.id, { ritorno: location.hash })}" aria-label="${corpi.length ? 'Posizione sulla ' + mapWord(o) : 'Tutti i campi'} di ${x.nome}" title="${corpi.length ? 'Posizione sulla ' + mapWord(o) : 'Tutti i campi'}">${corpi.length ? ICON.layers(18) : ICON.edit(18)}</a>
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
  const corpoOpts = corpoOptions(o);
  return html`
    <p class="hint">Rinominare un ascensore aggiorna subito tutti i reparti che lo usano.${corpoOpts.length > 1 ? ` ${isPalazzine(o) ? 'La palazzina' : 'Il corpo'} indica dove si trova il vano sulla ${mapWord(o)}: serve a disegnare il percorso.` : ''}</p>
    <div class="gtable ascs ${corpoOpts.length > 1 ? 'withc' : ''}">
      <div class="ghead"><span>Sigla</span><span>Tipo</span>${corpoOpts.length > 1 && html`<span>${Corpo(o)}</span>`}<span>Dove si trova</span><span></span></div>
      ${rows.map((x) => {
        const n = usage('ascensore_id', x.id);
        return html`<div class="grow-r">
          ${quickInput('ascensori', x, 'sigla', { label: 'Sigla', placeholder: 'C, A–B…' })}
          ${quickInput('ascensori', x, 'tipo', { label: 'Tipo', placeholder: 'Montalettighe…' })}
          ${corpoOpts.length > 1 && quickSelect('ascensori', x, 'corpo', corpoOpts, { label: Corpo(o) })}
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
  const fw = floorWord(o);
  const word = fw.word;
  const mapLv = o.mappa?.livelli;
  return html`
    <div class="panel col gap14">
      <span class="panel-title">${fw.Words} dell'ospedale</span>
      <div class="row gap10">
        <label class="field grow"><span>Dal ${word}</span><input type="number" id="q-piani-min" data-change="pianiRange" data-osp="${o.id}" data-k="min" value="${floors[0]}" step="1"></label>
        <label class="field grow"><span>Al ${word}</span><input type="number" id="q-piani-max" data-change="pianiRange" data-osp="${o.id}" data-k="max" value="${floors[floors.length - 1]}" step="1"></label>
      </div>
      <small class="muted">Sono i ${fw.words} proposti quando aggiungi o sposti un reparto. Per la numerazione (piani o livelli) usa “Dati ospedale”.</small>
      ${mapLv && !isPlan(o) && html`<small class="muted">La mappa 3D disegna i livelli ${mapLv[0]}–${mapLv[mapLv.length - 1]}: un reparto su un livello diverso resta nell'elenco ma non compare sulla piantina.</small>`}
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

export function viewGestisci(id) {
  if (!S.me.canEdit) return viewForbidden();
  const o = X.osp[id];
  if (!o) return viewNotFound();
  const g = (S.gest[o.id] ||= { tab: 'reparti', q: '' });
  const sedi = X.sediByOsp[o.id] || [];
  const sede = sedi.find((s) => s.id === S.sedeTab[o.id]) || sedi[0];
  const tabs = [['reparti', 'Reparti'], ['ingressi', 'Ingressi'], ['ascensori', 'Ascensori'], ['piani', floorWord(o).Words]];
  let body;
  if (g.tab === 'piani') body = gestPiani(o);
  else if (!sede) body = html`<div class="empty"><b>Nessuna sede</b><span>Aggiungi prima una sede (plesso, padiglione…).</span><a class="btn primary" href="${href('nuovaSede', o.id)}">Aggiungi sede</a></div>`;
  else body = { reparti: gestReparti, ingressi: gestIngressi, ascensori: gestAscensori }[g.tab](o, sede, g);
  return html`
    ${banner()}
    <div class="topbar">
      <a href="${href('ospedale', o.id)}" class="tlink" data-act="leave" data-href="${href('ospedale', o.id)}">${ICON.back(18)}Fine</a>
      <span class="ttitle">Gestisci</span>
      <a href="${href('ospedaleModifica', o.id, { ritorno: location.hash })}" class="tlink">Dati ospedale</a>
    </div>
    <div class="gest-head">
      <div class="col gap2"><b class="gest-title">${o.nome}</b><span class="muted">${[o.citta, sede && sedi.length > 1 ? sede.nome : ''].filter(Boolean).join(' · ')}</span></div>
      ${sedi.length > 1 && g.tab !== 'piani' && html`<label class="field"><span class="sr">Sede</span><select class="sedesel" data-change="gestSede" data-osp="${o.id}">${sedi.map((s) => html`<option value="${s.id}" ${s.id === sede.id ? raw('selected') : ''}>${s.nome}</option>`)}</select></label>`}
      <div class="seg light" role="tablist">${tabs.map(([k, l]) => html`<button type="button" role="tab" aria-selected="${k === g.tab}" class="${k === g.tab ? 'on' : ''}" data-act="gestTab" data-osp="${o.id}" data-tab="${k}">${l}</button>`)}</div>
    </div>
    <main class="scroll pad col gap12 gest">${body}</main>
    ${tabbar('ospedali')}`;
}

export const handlers = {
  act: {
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
  },
  input: {
    gestQ: (el) => {
      S.gest[el.dataset.osp].q = el.value;
      render();
    },
  },
  change: {
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
      } else if (field === 'corpo') {
        // A precise point only makes sense inside its block.
        patch.punto = null;
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
  }
};
