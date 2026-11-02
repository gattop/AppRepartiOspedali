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

export function seed(store, { demo = false } = {}) {
  const files = ['jesi.json', ...(demo ? ['demo.json'] : [])];
  for (const f of files) {
    loadSeed(store, JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
    console.log(`Dati iniziali caricati da ${f}`);
  }
}
