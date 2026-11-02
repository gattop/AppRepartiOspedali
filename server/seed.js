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

export function seed(store, { demo = false } = {}) {
  const files = ['jesi.json', ...(demo ? ['demo.json'] : [])];
  for (const f of files) {
    loadSeed(store, JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
    console.log(`Dati iniziali caricati da ${f}`);
  }
}
