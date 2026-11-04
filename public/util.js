// Small helpers with no knowledge of the app: HTML templating, text normalisation, storage, dates.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// Markup that must not be escaped again when interpolated into `html`.
export class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(String(s));

function fmt(v) {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(fmt).join('');
  if (v instanceof Raw) return v.s;
  return esc(v);
}

// Tagged template: interpolated values are escaped, nested `html` results and arrays are not.
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += fmt(v) + strings[i + 1]; });
  return new Raw(out);
}

// Lower case without accents, for searching.
export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// localStorage that never throws (private mode, blocked storage).
export const local = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } }
};

// "04 nov 2026" from an ISO date or timestamp.
export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}
