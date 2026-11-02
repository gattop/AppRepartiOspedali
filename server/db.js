import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ospedali (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  citta TEXT NOT NULL DEFAULT '',
  indirizzo TEXT NOT NULL DEFAULT '',
  uso_livelli INTEGER NOT NULL DEFAULT 0,
  prefisso_tel TEXT NOT NULL DEFAULT '',
  fonte TEXT NOT NULL DEFAULT '',
  mappa TEXT,
  updated_at TEXT,
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS sedi (
  id TEXT PRIMARY KEY,
  ospedale_id TEXT NOT NULL REFERENCES ospedali(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  indirizzo TEXT NOT NULL DEFAULT '',
  ordine INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT,
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS ingressi (
  id TEXT PRIMARY KEY,
  sede_id TEXT NOT NULL REFERENCES sedi(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  sigla TEXT NOT NULL DEFAULT '',
  nota TEXT NOT NULL DEFAULT '',
  badge TEXT,
  lat REAL,
  lng REAL,
  ordine INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT,
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS ascensori (
  id TEXT PRIMARY KEY,
  sede_id TEXT NOT NULL REFERENCES sedi(id) ON DELETE CASCADE,
  sigla TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT '',
  nota TEXT NOT NULL DEFAULT '',
  ordine INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT,
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS reparti (
  id TEXT PRIMARY KEY,
  sede_id TEXT NOT NULL REFERENCES sedi(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT '',
  ingresso_id TEXT REFERENCES ingressi(id) ON DELETE SET NULL,
  ascensore_id TEXT REFERENCES ascensori(id) ON DELETE SET NULL,
  piano INTEGER,
  dove TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  tel TEXT NOT NULL DEFAULT '',
  kw TEXT NOT NULL DEFAULT '',
  corpo TEXT,
  verificato_il TEXT,
  verificato_da TEXT,
  updated_at TEXT,
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS modifiche (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  utente TEXT,
  entita TEXT NOT NULL,
  entita_id TEXT NOT NULL,
  azione TEXT NOT NULL,
  dati TEXT
);
CREATE INDEX IF NOT EXISTS idx_sedi_osp ON sedi(ospedale_id);
CREATE INDEX IF NOT EXISTS idx_ingressi_sede ON ingressi(sede_id);
CREATE INDEX IF NOT EXISTS idx_ascensori_sede ON ascensori(sede_id);
CREATE INDEX IF NOT EXISTS idx_reparti_sede ON reparti(sede_id);
`;

// Fields the API may write for each entity, with their type.
// `parent` is the foreign key that must point to an existing row.
export const ENTITIES = {
  ospedali: {
    fields: { nome: 'text!', citta: 'text', indirizzo: 'text', uso_livelli: 'bool', prefisso_tel: 'text', fonte: 'text', mappa: 'json' },
    order: 'nome'
  },
  sedi: {
    fields: { ospedale_id: 'ref!', nome: 'text!', indirizzo: 'text', ordine: 'int' },
    parent: { field: 'ospedale_id', table: 'ospedali' },
    order: 'ordine, nome'
  },
  ingressi: {
    fields: { sede_id: 'ref!', nome: 'text!', sigla: 'text', nota: 'text', badge: 'badge', lat: 'real', lng: 'real', ordine: 'int' },
    parent: { field: 'sede_id', table: 'sedi' },
    order: 'ordine, nome'
  },
  ascensori: {
    fields: { sede_id: 'ref!', sigla: 'text!', tipo: 'text', nota: 'text', ordine: 'int' },
    parent: { field: 'sede_id', table: 'sedi' },
    order: 'ordine, sigla'
  },
  reparti: {
    fields: {
      sede_id: 'ref!', nome: 'text!', tipo: 'text', ingresso_id: 'ref', ascensore_id: 'ref', piano: 'int',
      dove: 'text', note: 'text', tel: 'text', kw: 'text', corpo: 'textnull'
    },
    parent: { field: 'sede_id', table: 'sedi' },
    order: 'nome'
  }
};

const BADGES = ['ambulanze', 'no_barelle'];

export class ValidationError extends Error {}

function coerce(type, value, name) {
  const required = type.endsWith('!');
  const t = type.replace('!', '');
  const empty = value === undefined || value === null || value === '';
  if (empty) {
    if (required) throw new ValidationError(`Campo obbligatorio: ${name}`);
    if (t === 'text') return '';
    if (t === 'bool' || (t === 'int' && name === 'ordine')) return 0;
    return null;
  }
  switch (t) {
    case 'text':
    case 'textnull':
    case 'ref': {
      const s = String(value).trim();
      if (required && !s) throw new ValidationError(`Campo obbligatorio: ${name}`);
      if (s.length > 2000) throw new ValidationError(`Campo troppo lungo: ${name}`);
      return s || (t === 'text' ? '' : null);
    }
    case 'bool':
      return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0;
    case 'int': {
      const n = Number(value);
      if (!Number.isInteger(n)) throw new ValidationError(`Numero intero non valido: ${name}`);
      return n;
    }
    case 'real': {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new ValidationError(`Numero non valido: ${name}`);
      return n;
    }
    case 'badge':
      if (!BADGES.includes(value)) throw new ValidationError(`Valore non valido: ${name}`);
      return value;
    case 'json': {
      const s = typeof value === 'string' ? value : JSON.stringify(value);
      try { JSON.parse(s); } catch { throw new ValidationError(`JSON non valido: ${name}`); }
      return s;
    }
  }
  throw new Error(`Tipo sconosciuto ${type}`);
}

export function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  return new Store(db);
}

class Store {
  constructor(db) {
    this.db = db;
  }

  tx(fn) {
    this.db.exec('BEGIN');
    try {
      const r = fn();
      this.db.exec('COMMIT');
      return r;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  close() {
    this.db.close();
  }

  backupTo(file) {
    this.db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
  }

  isEmpty() {
    return this.db.prepare('SELECT COUNT(*) AS n FROM ospedali').get().n === 0;
  }

  all() {
    const out = {};
    for (const [name, cfg] of Object.entries(ENTITIES)) {
      out[name] = this.db.prepare(`SELECT * FROM ${name} ORDER BY ${cfg.order}`).all();
    }
    for (const o of out.ospedali) o.mappa = o.mappa ? JSON.parse(o.mappa) : null;
    // Last change across all tables, so clients can tell whether their copy is current.
    const row = this.db.prepare('SELECT MAX(ts) AS ts FROM modifiche').get();
    out.aggiornato = row.ts || null;
    return out;
  }

  get(entity, id) {
    return this.db.prepare(`SELECT * FROM ${entity} WHERE id = ?`).get(id) || null;
  }

  clean(entity, input, partial) {
    const cfg = ENTITIES[entity];
    const row = {};
    for (const [name, type] of Object.entries(cfg.fields)) {
      if (partial && !(name in input)) continue;
      row[name] = coerce(type, input[name], name);
    }
    return row;
  }

  checkRefs(entity, row, sedeId) {
    const cfg = ENTITIES[entity];
    if (cfg.parent && row[cfg.parent.field] != null && !this.get(cfg.parent.table, row[cfg.parent.field])) {
      throw new ValidationError(`Riferimento non trovato: ${cfg.parent.field}`);
    }
    // Entrance and lift must belong to the same site as the ward.
    for (const [field, table] of [['ingresso_id', 'ingressi'], ['ascensore_id', 'ascensori']]) {
      if (row[field] == null) continue;
      const ref = this.get(table, row[field]);
      if (!ref || ref.sede_id !== sedeId) throw new ValidationError(`${field} non appartiene alla sede scelta`);
    }
  }

  log(user, entity, id, action, data) {
    this.db.prepare('INSERT INTO modifiche (ts, utente, entita, entita_id, azione, dati) VALUES (?, ?, ?, ?, ?, ?)')
      .run(new Date().toISOString(), user, entity, id, action, data ? JSON.stringify(data) : null);
  }

  // Insert without opening a transaction or logging; used by the seed, which wraps everything
  // in one transaction and sets ids and verification fields itself.
  insertRaw(entity, input, user) {
    const row = this.clean(entity, input, false);
    row.id = input.id || randomUUID();
    row.updated_at = new Date().toISOString();
    row.updated_by = user;
    if (entity === 'reparti') {
      row.verificato_il = input.verificato_il ?? null;
      row.verificato_da = input.verificato_da ?? null;
    }
    if (this.get(entity, row.id)) throw new ValidationError('Id già esistente');
    this.checkRefs(entity, row, row.sede_id);
    const cols = Object.keys(row);
    this.db.prepare(`INSERT INTO ${entity} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
      .run(...cols.map((c) => row[c]));
    return row;
  }

  insert(entity, input, user) {
    const { id, ...fields } = input;
    const data = { ...fields };
    // Saving a ward from the form counts as checking it on site.
    if (entity === 'reparti') {
      data.verificato_il = new Date().toISOString().slice(0, 10);
      data.verificato_da = user;
    }
    return this.tx(() => {
      const row = this.insertRaw(entity, data, user);
      this.log(user, entity, row.id, 'crea', row);
      return this.get(entity, row.id);
    });
  }

  update(entity, id, input, user) {
    return this.tx(() => {
      const current = this.get(entity, id);
      if (!current) return null;
      const row = this.clean(entity, input, true);
      const sedeId = row.sede_id ?? current.sede_id;
      // When a ward moves to another site, its old entrance/lift no longer apply.
      if (entity === 'reparti' && sedeId !== current.sede_id) {
        if (!('ingresso_id' in row)) row.ingresso_id = null;
        if (!('ascensore_id' in row)) row.ascensore_id = null;
      }
      this.checkRefs(entity, row, sedeId);
      row.updated_at = new Date().toISOString();
      row.updated_by = user;
      if (entity === 'reparti') {
        row.verificato_il = row.updated_at.slice(0, 10);
        row.verificato_da = user;
      }
      const cols = Object.keys(row);
      this.db.prepare(`UPDATE ${entity} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
        .run(...cols.map((c) => row[c]), id);
      this.log(user, entity, id, 'modifica', row);
      return this.get(entity, id);
    });
  }

  verify(id, user) {
    return this.tx(() => {
      if (!this.get('reparti', id)) return null;
      const today = new Date().toISOString().slice(0, 10);
      this.db.prepare('UPDATE reparti SET verificato_il = ?, verificato_da = ? WHERE id = ?').run(today, user, id);
      this.log(user, 'reparti', id, 'verifica', null);
      return this.get('reparti', id);
    });
  }

  remove(entity, id, user) {
    return this.tx(() => {
      const current = this.get(entity, id);
      if (!current) return false;
      this.db.prepare(`DELETE FROM ${entity} WHERE id = ?`).run(id);
      this.log(user, entity, id, 'elimina', current);
      return true;
    });
  }
}
