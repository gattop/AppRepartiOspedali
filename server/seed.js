import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'seed');

// Seed files are nested: ospedali > sedi > ingressi/ascensori/reparti.
// Wards point to their entrance and lift by id (`ingresso`, `ascensore`).
export function loadSeed(store, data, user = 'seed') {
  store.tx(() => {
    for (const o of data.ospedali) {
      const { sedi = [], ...osp } = o;
      store.insertRaw('ospedali', osp, user);
      sedi.forEach((s, i) => {
        const { ingressi = [], ascensori = [], reparti = [], ...sede } = s;
        store.insertRaw('sedi', { ordine: i, ...sede, ospedale_id: osp.id }, user);
        ingressi.forEach((x, j) => store.insertRaw('ingressi', { ordine: j, ...x, sede_id: sede.id }, user));
        ascensori.forEach((x, j) => store.insertRaw('ascensori', { ordine: j, ...x, sede_id: sede.id }, user));
        for (const r of reparti) {
          const { ingresso, ascensore, ...rep } = r;
          store.insertRaw('reparti', {
            ...rep,
            sede_id: sede.id,
            ingresso_id: ingresso || null,
            ascensore_id: ascensore || null,
            verificato_il: rep.verificato_il || null,
            verificato_da: rep.verificato_da || null
          }, user);
        }
      });
    }
  });
}

// Hospitals seeded by an older release keep their map, but get the per-body fields added
// later (default lift and directions, used when a ward moves to another body).
export function updateSeededMaps(store) {
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json'))) {
    for (const o of JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')).ospedali) {
      // Photo added after the hospital was seeded: fill it in once (and move the first release's .jpg to the .webp).
      if (o.foto) store.db.prepare('UPDATE ospedali SET foto = ? WHERE id = ? AND (foto IS NULL OR foto = ?)').run(o.foto, o.id, o.foto.replace(/\.webp$/, '.jpg'));
      if (!o.mappa?.corpi) continue;
      const row = store.get('ospedali', o.id);
      if (!row?.mappa) continue;
      let mappa = JSON.parse(row.mappa);
      let changed = false;
      // A newer drawing of the map in the seed replaces the stored one (bodies keep their ids,
      // so wards and entrances stay where they are).
      if ((o.mappa.versione || 1) > (mappa.versione || 1)) {
        mappa = o.mappa;
        changed = true;
      }
      for (const [k, extra] of Object.entries(o.mappa.corpi)) {
        const cur = mappa.corpi?.[k];
        if (!cur) continue;
        for (const [field, value] of Object.entries(extra)) {
          if (!(field in cur)) { cur[field] = value; changed = true; }
        }
      }
      if (changed) store.db.prepare('UPDATE ospedali SET mappa = ? WHERE id = ?').run(JSON.stringify(mappa), o.id);
      // Entrances seeded before they had a floor and a position: fill them in once.
      for (const s of o.sedi || []) {
        for (const ing of s.ingressi || []) {
          if (ing.piano == null && !ing.corpo) continue;
          store.db.prepare('UPDATE ingressi SET piano = ?, corpo = ? WHERE id = ? AND piano IS NULL AND corpo IS NULL')
            .run(ing.piano ?? null, ing.corpo ?? null, ing.id);
        }
        // Lifts seeded before they had a position on the map.
        for (const asc of s.ascensori || []) {
          if (!asc.corpo) continue;
          store.db.prepare('UPDATE ascensori SET corpo = ? WHERE id = ? AND corpo IS NULL').run(asc.corpo, asc.id);
        }
      }
    }
  }
}

// One-off corrections to data already in production (seeded by an older release). Each runs once,
// and only touches a row that is still as originally seeded, so manual edits are never overwritten.
const DATA_FIXES = [
  {
    // Urologia shares the Polo endoscopico (L2, body A).
    id: '2026-11-04-jesi-urologia',
    run(store, log) {
      const polo = store.get('reparti', 'jesi-endoscopia');
      const exists = store.db.prepare("SELECT 1 FROM reparti WHERE sede_id = 'jesi-sede' AND (lower(nome) LIKE 'urologia%' OR lower(nome) LIKE '% urologia%')").get();
      if (!polo || exists) return;
      store.insertRaw('reparti', {
        id: 'jesi-urologia', sede_id: polo.sede_id, nome: 'Urologia (Polo endoscopico)', tipo: 'Ambulatorio', piano: polo.piano, corpo: polo.corpo,
        ingresso_id: polo.ingresso_id, ascensore_id: polo.ascensore_id, dove: polo.dove, note: 'Nello stesso polo del Polo endoscopico',
        kw: 'urologia urologo cistoscopia prostata reni vescica endoscopia'
      }, 'aggiornamento dati');
      log('reparti', 'jesi-urologia', { nome: 'Urologia (Polo endoscopico)' });
    }
  },
  {
    // Hospitals added to the seed after the database was created.
    id: '2026-11-04-senigallia',
    run(store) {
      if (!store.get('ospedali', 'senigallia')) loadSeedFile(store, 'senigallia.json', 'aggiornamento dati');
    }
  },
  {
    id: '2026-11-04-jesi-ortopedia-pneumologia-gessi',
    run(store, log) {
      const corpi = JSON.parse(store.get('ospedali', 'jesi')?.mappa || '{}').corpi || {};
      const dove = (k) => corpi[k]?.dove || '';
      const orto = store.get('reparti', 'jesi-orto-deg');
      // L3: Ortopedia degenze moved to body D, together with Clinica reumatologica.
      if (orto && orto.corpo === 'B' && orto.piano === 3) {
        store.db.prepare('UPDATE reparti SET corpo = ?, ascensore_id = ?, dove = ?, punto = NULL WHERE id = ?')
          .run('D', store.get('ascensori', 'asc-cd') ? 'asc-cd' : orto.ascensore_id, dove('D') || orto.dove, orto.id);
        log('reparti', orto.id, { corpo: 'D' });
      }
      // L3 body B is now Pneumologia.
      const hasPneumo = store.db.prepare("SELECT 1 FROM reparti WHERE sede_id = 'jesi-sede' AND piano = 3 AND lower(nome) LIKE '%pneumologia%'").get();
      if (store.get('sedi', 'jesi-sede') && !hasPneumo && !store.get('reparti', 'jesi-pneumologia')) {
        store.insertRaw('reparti', {
          id: 'jesi-pneumologia', sede_id: 'jesi-sede', nome: 'Pneumologia – Degenze', tipo: 'Degenza', piano: 3, corpo: 'B',
          ingresso_id: store.get('ingressi', 'ing-principale') ? 'ing-principale' : null,
          ascensore_id: store.get('ascensori', 'asc-ab') ? 'asc-ab' : null,
          dove: dove('B'), kw: 'pneumologia pneumo polmoni respiratorio degenza ricovero'
        }, 'aggiornamento dati');
        log('reparti', 'jesi-pneumologia', { nome: 'Pneumologia – Degenze' });
      }
      // L2: Sala gessi is on the right, with Ambulatori Ortopedia (body D).
      const gessi = store.get('reparti', 'jesi-gessi');
      if (gessi && gessi.corpo === 'B' && gessi.piano === 2) {
        store.db.prepare('UPDATE reparti SET corpo = ?, dove = ?, punto = NULL WHERE id = ?').run('D', dove('D') || gessi.dove, gessi.id);
        log('reparti', gessi.id, { corpo: 'D' });
      }
    }
  },
  {
    // Names and keywords as on the "Blocco fucsia" sign (lifts C-D, level 1, checked on site 2026-11-05);
    // the Bar next to the porter's lodge. A ward already renamed by hand is left alone.
    id: '2026-11-05-jesi-cartello-blocco-fucsia',
    run(store, log) {
      const rename = (id, from, to, kw) => {
        const r = store.get('reparti', id);
        if (!r || r.nome !== from) return;
        store.db.prepare('UPDATE reparti SET nome = ?, kw = ? WHERE id = ?').run(to, kw ? addWords(r.kw, kw) : r.kw, id);
        log('reparti', id, { nome: to });
      };
      const addKw = (id, words) => {
        const r = store.get('reparti', id);
        if (!r) return;
        const kw = addWords(r.kw, words);
        if (kw === r.kw) return;
        store.db.prepare('UPDATE reparti SET kw = ? WHERE id = ?').run(kw, id);
        log('reparti', id, { kw });
      };
      rename('jesi-pediatria', 'Pediatria – Degenze', 'Pediatria e Neonatologia – Degenze', 'neonatologia neonati');
      rename('jesi-prelievi', 'Punto prelievi', 'Centro prelievi');
      for (const id of ['jesi-medicina-b', 'jesi-medicina-c']) addKw(id, 'broncopneumologia dermatologia nefrologia dialisi');
      const hasBar = store.db.prepare("SELECT 1 FROM reparti WHERE sede_id = 'jesi-sede' AND lower(nome) LIKE 'bar%'").get();
      if (store.get('sedi', 'jesi-sede') && !hasBar && !store.get('reparti', 'jesi-bar')) {
        store.insertRaw('reparti', {
          id: 'jesi-bar', sede_id: 'jesi-sede', nome: 'Bar', tipo: 'Servizio', piano: 2, corpo: 'nC',
          ingresso_id: store.get('ingressi', 'ing-principale') ? 'ing-principale' : null,
          dove: 'Accanto alla portineria, nel corpo centrale', kw: 'bar caffe ristoro colazione'
        }, 'aggiornamento dati');
        log('reparti', 'jesi-bar', { nome: 'Bar' });
      }
    }
  }
];

// Keywords with the new words appended, each word once.
function addWords(kw, words) {
  const have = String(kw || '').split(/\s+/).filter(Boolean);
  for (const w of words.split(/\s+/)) if (!have.includes(w)) have.push(w);
  return have.join(' ');
}

export function applyDataFixes(store) {
  store.db.exec('CREATE TABLE IF NOT EXISTS correzioni (id TEXT PRIMARY KEY, ts TEXT NOT NULL)');
  for (const fix of DATA_FIXES) {
    if (store.db.prepare('SELECT 1 FROM correzioni WHERE id = ?').get(fix.id)) continue;
    store.tx(() => {
      fix.run(store, (entity, id, data) => store.log('aggiornamento dati', entity, id, 'modifica', data));
      store.db.prepare('INSERT INTO correzioni (id, ts) VALUES (?, ?)').run(fix.id, new Date().toISOString());
    });
    console.log(`Correzione dati applicata: ${fix.id}`);
  }
}

function loadSeedFile(store, f, user) {
  loadSeed(store, JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')), user);
  console.log(`Dati iniziali caricati da ${f}`);
}

export function seed(store, { demo = false } = {}) {
  for (const f of ['jesi.json', 'senigallia.json', ...(demo ? ['demo.json'] : [])]) loadSeedFile(store, f);
}
