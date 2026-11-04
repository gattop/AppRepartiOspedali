// Forms: a ward (with its draft kept while you move around), and hospital, site, entrance, lift.
import { html, raw, norm, local } from '../util.js';
import { S, X, TIPI, api } from '../data.js';
import { ICON } from '../icons.js';
import { pianoInfo, floorOptions, floorWord, corpoPatch, ingPill, ascPill } from '../domain.js';
import { render, flash, mutate } from '../ui.js';
import { initPick, pickPanel, pickValues } from '../map/stage.js';
import { href, leave, cancelTo } from '../router.js';
import { banner, viewNotFound, viewForbidden } from './common.js';

function draftChanged() {
  S.draft.touched = true;
}

function addKw() {
  const d = S.draft;
  const words = norm(d.kwInput).split(/[\s,]+/).filter(Boolean);
  for (const w of words) if (!d.kw.includes(w)) d.kw.push(w);
  d.kwInput = '';
  return words.length > 0;
}

// ---------------------------------------------------------------- ward form
// The draft (S.draft) survives a trip to "+ Nuovo ingresso" and back, and a re-render.

function newDraft(r, query) {
  if (r) {
    return {
      key: r.id, id: r.id, osp: r._osp.id, sede_id: r.sede_id, nome: r.nome, tipo: r.tipo,
      ingresso_id: r.ingresso_id, ascensore_id: r.ascensore_id, piano: r.piano, corpo: r.corpo,
      dove: r.dove, note: r.note, tel: r.tel, kw: r.kw.split(/\s+/).filter(Boolean), kwInput: '', punto: r.punto
    };
  }
  const sede = X.sede[query.get('sede')] || null;
  const osp = sede ? X.osp[sede.ospedale_id] : S.data.ospedali[0];
  return {
    key: 'new', id: null, osp: osp?.id || null, sede_id: sede?.id || (osp && X.sediByOsp[osp.id]?.[0]?.id) || null,
    nome: '', tipo: '', ingresso_id: null, ascensore_id: null, piano: null, corpo: null, punto: null,
    dove: '', note: '', tel: '', kw: [], kwInput: ''
  };
}

export function viewRepForm(id, query) {
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
  const ritorno = location.hash;
  const cancel = id ? href('reparto', id) : href('home');
  const ing = X.ing[d.ingresso_id];
  const asc = X.asc[d.ascensore_id];
  const preview = [ing ? ingPill(ing) : 'Ingresso ?', asc ? ascPill(asc) : 'Nessun ascensore', pianoInfo(osp, d.piano).long].join(' → ');
  if (corpi.length) initPick('draft:' + d.key, osp, 'draft', {}, d.nome || 'Reparto');

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
          : osp && html`<p class="muted">Questo ospedale non ha ancora sedi. <a href="${href('nuovaSede', osp.id)}">Aggiungi una sede</a></p>`}
        <label class="field"><span>Nome reparto</span><input type="text" data-input="draftText" data-field="nome" value="${d.nome}" required></label>
        <div class="field"><span>Tipo</span><div class="chips wrap">${TIPI.map((t) => chip('tipo', t, t))}</div></div>
      </div>

      ${sede && html`<div class="panel col gap16">
        <span class="panel-title">COME ARRIVARCI</span>
        <div class="field"><span>Ingresso da usare</span><div class="chips wrap">
          ${ingressi.map((g) => chip('ingresso_id', g.id, g.nome.split(' – ')[0], 'chip sq red'))}
          <a class="chip sq dashed" href="${href('nuovoIngresso', sede.id, { ritorno, scegli: 'ingresso_id' })}">+ Nuovo ingresso</a>
        </div></div>
        <div class="field"><span>${floorWord(osp).Word}</span><div class="floorpick">
          ${piani.map((p) => chip('piano', p, pianoInfo(osp, p).short, 'fbtn'))}
        </div></div>
        ${corpi.length > 0 && pickPanel(osp, pickValues(), 'il reparto')}
        <div class="field"><span>Ascensore</span><div class="chips wrap">
          ${ascensori.map((a) => chip('ascensore_id', a.id, a.sigla, 'chip sq blue'))}
          ${chip('ascensore_id', null, 'Nessuno', 'chip sq')}
          <a class="chip sq dashed" href="${href('nuovoAscensore', sede.id, { ritorno, scegli: 'ascensore_id' })}">+ Nuovo</a>
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
      ['piano', 'Piano dell\'ingresso', 'floor', { hint: 'Il piano a cui si entra: da qui si calcola quanti piani salire o scendere.' }],
      ['nota', 'Nota', 'textarea', { hint: 'Es. Rampa barellati, sosta ambulanze 15 min' }],
      ['badge', 'Indicazione', 'select', { options: [['', 'Nessuna'], ['ambulanze', 'Consigliato ambulanze'], ['no_barelle', 'Non adatto a barelle']] }],
      ['posizione', 'Posizione sulla mappa', 'mappos'],
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

export function viewEntityForm(entity, id, parent, query) {
  if (!S.me.canEdit) return viewForbidden();
  const cfg = FORMS[entity];
  const table = { ospedali: 'osp', sedi: 'sede', ingressi: 'ing', ascensori: 'asc' }[entity];
  const row = id ? X[table][id] : null;
  if (id && !row) return viewNotFound();
  const back = query.get('ritorno') || (entity === 'ospedali' && id ? href('ospedale', id) : href('home'));
  const values = row || {};
  // Hospital of the entrance (for its floors and its 3D map).
  const osp = entity === 'ingressi' ? X.osp[X.sede[parent || row?.sede_id]?.ospedale_id] : null;
  if (osp?.mappa) {
    const key = 'ing:' + (id || 'new:' + parent);
    initPick(key, osp, 'form', { corpo: values.corpo ?? null, piano: values.piano ?? null, punto: values.punto ?? null }, values.nome || 'Ingresso');
  }
  // While choosing on the map, the form shows the floor chosen there, not the saved one.
  const pv = osp?.mappa ? pickValues() : null;
  return html`
    ${banner()}
    <div class="topbar">
      <a href="${back}" class="tlink" data-act="leave" data-href="${back}">Annulla</a>
      <span class="ttitle">${cfg.title[id ? 1 : 0]}</span>
      <button type="submit" form="eform" class="btn primary small" ${S.busy ? raw('disabled') : ''}>Salva</button>
    </div>
    <main class="scroll pad col gap18 form">
      <form id="eform" class="panel col gap14" data-submit="saveEntity" data-entity="${entity}" data-id="${id || ''}" data-parent="${parent || ''}" data-back="${back}" data-scegli="${query.get('scegli') || ''}" novalidate>
        ${cfg.fields.map(([name, label, type, opt = {}]) => {
          const v = values[name] ?? '';
          let input;
          if (type === 'mappos') {
            if (!osp?.mappa) return '';
            return html`<input type="hidden" name="corpo" value="${pv.corpo || ''}"><input type="hidden" name="punto" value="${pv.punto ? JSON.stringify(pv.punto) : ''}">
              ${pickPanel(osp, pv, 'l\'ingresso')}`;
          }
          if (type === 'floor') {
            const cur = pv ? pv.piano : values.piano ?? null;
            const floors = floorOptions(osp).slice();
            if (cur != null && !floors.includes(cur)) floors.push(cur), floors.sort((a, b) => a - b);
            input = html`<select name="${name}" data-change="pickPiano">
              <option value="">—</option>
              ${floors.map((p) => html`<option value="${p}" ${p === cur ? raw('selected') : ''}>${pianoInfo(osp, p).long}</option>`)}
            </select>`;
            label = `${floorWord(osp).Word} dell'ingresso`;
          } else if (type === 'textarea') input = html`<textarea name="${name}" rows="3">${v}</textarea>`;
          else if (type === 'select') input = html`<select name="${name}">${opt.options.map(([ov, ol]) => html`<option value="${ov}" ${String(v) === ov ? raw('selected') : ''}>${ol}</option>`)}</select>`;
          else input = html`<input type="${type}" name="${name}" value="${v}" ${opt.required ? raw('required') : ''} ${opt.step ? raw(`step="${opt.step}"`) : ''} ${opt.maxlength ? raw(`maxlength="${opt.maxlength}"`) : ''} ${opt.inputmode ? raw(`inputmode="${opt.inputmode}"`) : ''}>`;
          return html`<label class="field"><span>${label}${opt.required ? ' *' : ''}</span>${input}${opt.hint && html`<small>${opt.hint}</small>`}</label>`;
        })}
      </form>
      <button type="submit" form="eform" class="btn primary big" ${S.busy ? raw('disabled') : ''}>Salva</button>
      ${id && html`<button type="button" class="btn danger" data-act="deleteEntity" data-entity="${entity}" data-id="${id}">Elimina</button>`}
    </main>`;
}

export const handlers = {
  act: {
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
    cancelDraft: ({ href: to }) => {
      S.draft = null;
      cancelTo(to);
    },
    leave: ({ href: to }) => cancelTo(to),
    saveRep: async () => {
      const d = S.draft;
      addKw();
      if (!d.nome.trim()) return flash('Inserisci il nome del reparto', 'err');
      if (!d.sede_id) return flash('Scegli una sede', 'err');
      const body = {
        sede_id: d.sede_id, nome: d.nome, tipo: d.tipo || '', ingresso_id: d.ingresso_id, ascensore_id: d.ascensore_id,
        piano: d.piano, corpo: d.corpo, punto: d.corpo ? d.punto : null, dove: d.dove, note: d.note, tel: d.tel, kw: d.kw.join(' ')
      };
      const saved = await mutate(() => (d.id ? api('PUT', `reparti/${encodeURIComponent(d.id)}`, body) : api('POST', 'reparti', body)), 'Reparto salvato');
      if (saved) {
        S.draft = null;
        leave(href('reparto', saved.id));
      }
    },
    deleteRep: async ({ id }) => {
      if (!confirm('Eliminare questo reparto?')) return;
      if (await mutate(() => api('DELETE', `reparti/${encodeURIComponent(id)}`), 'Reparto eliminato')) {
        S.draft = null;
        S.fav.delete(id);
        local.set('preferiti', [...S.fav]);
        location.replace(href('home'));
      }
    },
    deleteEntity: async ({ entity, id }) => {
      if (!confirm(FORMS[entity].del)) return;
      if (await mutate(() => api('DELETE', `${entity}/${encodeURIComponent(id)}`), 'Eliminato')) {
        location.replace(href('home'));
      }
    },
  },
  input: {
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
    },
  },
  change: {
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
    },
  },
  key: {
    kwInput: (el, e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (addKw()) { draftChanged(); render(); }
    }
  },
  submit: {
    saveEntity: async (form) => {
      const { entity, id, parent, back, scegli } = form.dataset;
      const body = {};
      for (const [name, , type] of FORMS[entity].fields) {
        if (type === 'mappos') {
          // Hidden inputs filled by the 3D picker (absent for hospitals without a map).
          if (form.elements.corpo) {
            body.corpo = form.elements.corpo.value || null;
            body.punto = body.corpo && form.elements.punto.value ? JSON.parse(form.elements.punto.value) : null;
          }
          continue;
        }
        const v = form.elements[name].value.trim();
        body[name] = type === 'number' || type === 'floor' ? (v === '' ? null : Number(v)) : v;
      }
      if (entity === 'ospedali') body.uso_livelli = body.uso_livelli === '1';
      if (entity === 'sedi' && parent) body.ospedale_id = parent;
      if ((entity === 'ingressi' || entity === 'ascensori') && parent) body.sede_id = parent;
      const missing = FORMS[entity].fields.find(([name, , , opt]) => opt?.required && !body[name]);
      if (missing) return flash(`Compila il campo “${missing[1]}”`, 'err');
      const saved = await mutate(() => (id ? api('PUT', `${entity}/${encodeURIComponent(id)}`, body) : api('POST', entity, body)), 'Salvato');
      if (!saved) return;
      if (scegli && !id) S.pendingSelect = { field: scegli, id: saved.id };
      if (entity === 'ospedali' && !id) location.replace(href('nuovaSede', saved.id));
      else if (entity === 'sedi' && !id) {
        S.sedeTab[saved.ospedale_id] = saved.id;
        leave(href('ospedale', saved.ospedale_id));
      } else leave(back);
    },
  }
};
