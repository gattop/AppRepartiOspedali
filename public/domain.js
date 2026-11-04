// Rules about hospitals that don't depend on the screen: floor names, bodies/buildings,
// directions, phone numbers, the route drawn on the map.
import { X } from './data.js';

// The word for a floor in this hospital: some number "livelli" (L0, L1…), most "piani" (T, 1°…).
const FLOOR_WORDS = {
  livelli: { word: 'livello', words: 'livelli', Word: 'Livello', Words: 'Livelli', abbr: 'LIV.' },
  piani: { word: 'piano', words: 'piani', Word: 'Piano', Words: 'Piani', abbr: 'PIANO' }
};
export const floorWord = (osp) => FLOOR_WORDS[osp?.uso_livelli ? 'livelli' : 'piani'];

// Short floor tag as written on the maps and in lists: "L2" (levels) or "2", "T" (floors).
export const floorTag = (osp, p) => (osp?.uso_livelli ? 'L' + (p ?? '?') : pianoInfo(osp, p).short);

export function pianoDefault(osp, p) {
  const title = floorWord(osp).Word.toUpperCase();
  if (p == null) return { short: '—', long: 'Piano non indicato', title };
  if (osp?.uso_livelli) return { short: String(p), long: 'Livello ' + p, title };
  if (p === 0) return { short: 'T', long: 'Piano terra', title };
  if (p < 0) return { short: String(p), long: 'Piano ' + p, title };
  return { short: String(p), long: p + '° piano', title };
}

// Same as the default, but with the hospital's own floor name when one is set (e.g. "Piano rialzato").
export function pianoInfo(osp, p) {
  const info = pianoDefault(osp, p);
  const nome = p != null && osp?.piani?.nomi?.[p];
  return nome ? { ...info, long: nome } : info;
}

// Floors offered in the editors: the hospital's own range, else the 3D map levels, else -2..8.
export function floorOptions(osp) {
  const pr = osp?.piani;
  if (pr && Number.isInteger(pr.min) && Number.isInteger(pr.max) && pr.min <= pr.max) {
    return Array.from({ length: pr.max - pr.min + 1 }, (_, i) => pr.min + i);
  }
  return osp?.mappa?.livelli || [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8];
}

export const corpoName = (osp, k) => osp?.mappa?.corpi?.[k]?.label || k || '';
// Hospitals drawn as a flat plan from above (no 3D) are split into buildings ("palazzine").
export const isPlan = (osp) => osp?.mappa?.tipo === 'pianta';
export const corpoWord = (osp) => (isPlan(osp) ? 'palazzina' : 'corpo');
export const Corpo = (osp) => (isPlan(osp) ? 'Palazzina' : 'Corpo');
export const mapWord = (osp) => (isPlan(osp) ? 'pianta' : 'mappa 3D');

// When a ward moves to another body of a mapped hospital, carry over that body's lift and
// standard directions, but only where the ward still had the old body's defaults.
export function corpoPatch(osp, cur, corpo) {
  const corpi = osp?.mappa?.corpi || {};
  const was = corpi[cur.corpo] || {}, now = corpi[corpo] || {};
  const patch = { corpo };
  // A precise point belongs to the old block: drop it.
  if (corpo !== cur.corpo && cur.punto) patch.punto = null;
  if (now.ascensore && X.asc[now.ascensore] && cur.ascensore_id && cur.ascensore_id === was.ascensore) patch.ascensore_id = now.ascensore;
  if (now.dove && (!cur.dove || cur.dove === was.dove)) patch.dove = now.dove;
  return patch;
}

export const ingShort = (ing) => (ing ? ing.sigla || ing.nome.split(' ')[0] : '—');
export const ingPill = (ing) => (ing ? ing.nome.split(' – ')[0] : null);
export const ascPill = (asc) => (asc ? 'Ascensore ' + asc.sigla : 'Nessun ascensore');
export const sedeLabel = (r) => (r._sede && X.sediByOsp[r._osp.id]?.length > 1 ? r._sede.nome : r._osp?.citta || r._sede?.nome || '');

export function telInfo(osp, tel) {
  const t = String(tel || '').replace(/[^\d+]/g, '');
  if (!t) return null;
  if (t.length <= 5) {
    const pre = String(osp?.prefisso_tel || '').replace(/[^\d+]/g, '');
    return { href: pre ? 'tel:' + pre + t : null, label: 'Int. ' + tel };
  }
  return { href: 'tel:' + t, label: tel };
}

// Entrances placed on the map, drawn as markers (`amb`: the one recommended for ambulances).
export function entrancePoints(o) {
  const out = [];
  for (const s of X.sediByOsp[o.id] || []) {
    for (const g of X.ingBySede[s.id] || []) {
      if (!g.corpo || g.piano == null) continue;
      out.push({ corpo: g.corpo, liv: g.piano, punto: g.punto, text: g.sigla || g.nome.split(' – ')[0], amb: g.badge === 'ambulanze' });
    }
  }
  return out;
}

// Route on the 3D map: entrance -> lift shaft on the entrance floor -> lift shaft on the ward floor
// -> ward. Without a placed entrance there's nothing to start from; without a placed lift the
// line goes straight from the entrance to the ward.
export function routeFor(r) {
  if (!r?._osp?.mappa || !r.corpo || r.piano == null) return null;
  const ing = r._ing;
  if (!ing?.corpo || ing.piano == null) return null;
  const pts = [{ corpo: ing.corpo, liv: ing.piano, punto: ing.punto, kind: 'ing' }];
  const shaft = r._asc?.corpo;
  if (shaft && ing.piano !== r.piano) {
    pts.push({ corpo: shaft, liv: ing.piano, kind: 'asc' }, { corpo: shaft, liv: r.piano, kind: 'asc' });
  }
  pts.push({ corpo: r.corpo, liv: r.piano, punto: r.punto, kind: 'rep' });
  return pts;
}

// "Sali di 2 livelli" / "stesso piano dell'ingresso", from the entrance floor to the ward floor.
export function movement(r) {
  const from = r._ing?.piano, to = r.piano;
  if (from == null || to == null) return '';
  const fw = floorWord(r._osp);
  if (from === to) return `Stesso ${fw.word} dell'ingresso`;
  const n = Math.abs(to - from);
  return `${to > from ? 'Sali' : 'Scendi'} di ${n} ${n === 1 ? fw.word : fw.words}`;
}

export const placeText = (o, corpo, punto) => (corpo ? `${Corpo(o)} ${corpoName(o, corpo)}${punto ? ' · punto preciso' : isPlan(o) ? '' : ' · intera ala'}` : 'Non indicata');
