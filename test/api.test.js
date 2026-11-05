import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp, configFromEnv } from '../server/index.js';
import { snapshot } from '../server/backup.js';
import { openDb } from '../server/db.js';
import { updateSeededMaps, applyDataFixes } from '../server/seed.js';

let server, store, base, dir;
const EDITOR = { 'x-forwarded-preferred-username': 'mario', 'x-forwarded-groups': 'role:reparti-editor,altro' };
const READER = { 'x-forwarded-preferred-username': 'lucia', 'x-forwarded-groups': 'altro' };

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reparti-'));
  const cfg = configFromEnv({ DATA_DIR: dir, SEED_DEMO: 'true', EDITOR_GROUPS: 'role:reparti-editor', APP_VERSION: 'test123' });
  ({ server, store } = createApp(cfg));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const req = (method, url, { headers = {}, body } = {}) =>
  fetch(base + url, { method, headers: { 'content-type': 'application/json', ...headers }, body: body && JSON.stringify(body) });

test('seeds Jesi and demo data on first start', async () => {
  const data = await (await req('GET', '/api/data')).json();
  const jesi = data.ospedali.find((o) => o.id === 'jesi');
  assert.ok(jesi.mappa.blocks.length > 0);
  assert.equal(data.reparti.filter((r) => r.sede_id === 'jesi-sede').length, 40);
  const byId = Object.fromEntries(data.reparti.map((r) => [r.id, r]));
  assert.equal(byId['jesi-orto-deg'].corpo, 'D');
  assert.equal(byId['jesi-gessi'].corpo, 'D');
  assert.equal(byId['jesi-pneumologia'].corpo, 'B');
  assert.equal(byId['jesi-urologia'].corpo, byId['jesi-endoscopia'].corpo);
  assert.ok(data.ospedali.some((o) => o.id === 'demo-riviera'));
});

test('reports who is logged in and whether they can edit', async () => {
  assert.deepEqual(await (await req('GET', '/api/me', { headers: EDITOR })).json(), {
    user: { name: 'mario', email: null, groups: ['role:reparti-editor', 'altro'] },
    canEdit: true,
    editorGroups: ['role:reparti-editor'],
    version: 'test123'
  });
  assert.equal((await (await req('GET', '/api/me', { headers: READER })).json()).canEdit, false);
  assert.equal((await (await req('GET', '/api/me')).json()).user, null);
});

test('only editors can write', async () => {
  const body = { sede_id: 'jesi-sede', nome: 'Test' };
  assert.equal((await req('POST', '/api/reparti', { headers: READER, body })).status, 403);
  assert.equal((await req('POST', '/api/reparti', { body })).status, 403);
});

test('creates, updates, verifies and deletes a ward', async () => {
  let res = await req('POST', '/api/reparti', {
    headers: EDITOR,
    body: { sede_id: 'jesi-sede', nome: 'Nuovo reparto', tipo: 'Degenza', piano: 3, ingresso_id: 'ing-principale', ascensore_id: 'asc-ab', kw: 'nuovo test' }
  });
  assert.equal(res.status, 201);
  const r = await res.json();
  assert.equal(r.verificato_da, 'mario');
  assert.equal(r.piano, 3);

  res = await req('PUT', `/api/reparti/${r.id}`, { headers: EDITOR, body: { note: 'Citofonare' } });
  assert.equal((await res.json()).note, 'Citofonare');

  res = await req('POST', `/api/reparti/${r.id}/verifica`, { headers: EDITOR });
  assert.equal(res.status, 200);

  assert.equal((await req('DELETE', `/api/reparti/${r.id}`, { headers: EDITOR })).status, 204);
  assert.equal((await req('DELETE', `/api/reparti/${r.id}`, { headers: EDITOR })).status, 404);
});

test('rejects invalid data', async () => {
  let res = await req('POST', '/api/reparti', { headers: EDITOR, body: { sede_id: 'jesi-sede' } });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /nome/);

  // Entrance from another site
  res = await req('POST', '/api/reparti', { headers: EDITOR, body: { sede_id: 'jesi-sede', nome: 'X', ingresso_id: 'demo-r-ing16' } });
  assert.equal(res.status, 400);

  res = await req('POST', '/api/sedi', { headers: EDITOR, body: { ospedale_id: 'nope', nome: 'X' } });
  assert.equal(res.status, 400);

  res = await req('POST', '/api/ingressi', { headers: EDITOR, body: { sede_id: 'jesi-sede', nome: 'X', badge: 'boh' } });
  assert.equal(res.status, 400);
});

test('deleting a hospital cascades to its sites and wards', async () => {
  const o = await (await req('POST', '/api/ospedali', { headers: EDITOR, body: { nome: 'Da cancellare' } })).json();
  const s = await (await req('POST', '/api/sedi', { headers: EDITOR, body: { ospedale_id: o.id, nome: 'Sede' } })).json();
  await req('POST', '/api/reparti', { headers: EDITOR, body: { sede_id: s.id, nome: 'R' } });
  assert.equal((await req('DELETE', `/api/ospedali/${o.id}`, { headers: EDITOR })).status, 204);
  const data = await (await req('GET', '/api/data')).json();
  assert.ok(!data.sedi.some((x) => x.id === s.id));
  assert.ok(!data.reparti.some((x) => x.sede_id === s.id));
});

test('saves floor range and names, and keeps the 3D map when editing a hospital', async () => {
  const piani = { min: 0, max: 5, nomi: { 2: 'Livello ingresso' } };
  const res = await req('PUT', '/api/ospedali/jesi', { headers: EDITOR, body: { piani } });
  assert.equal(res.status, 200);
  const data = await (await req('GET', '/api/data')).json();
  const jesi = data.ospedali.find((o) => o.id === 'jesi');
  assert.deepEqual(jesi.piani, piani);
  assert.ok(jesi.mappa.blocks.length > 0);
  assert.equal(jesi.mappa.corpi.B.ascensore, 'asc-ab');
});

test('moves a ward to another body with a single field change', async () => {
  const res = await req('PUT', '/api/reparti/jesi-orto-deg', { headers: EDITOR, body: { corpo: 'D', ascensore_id: 'asc-cd' } });
  const r = await res.json();
  assert.equal(r.corpo, 'D');
  assert.equal(r.ascensore_id, 'asc-cd');
  assert.equal(r.piano, 3);
});

test('entrances have a floor and a position on the 3D map; wards can have a precise point', async () => {
  let data = await (await req('GET', '/api/data')).json();
  const main = data.ingressi.find((i) => i.id === 'ing-principale');
  assert.equal(main.piano, 2);
  assert.equal(main.corpo, 'nC');
  assert.ok(!('lat' in main));

  let res = await req('POST', '/api/ingressi', { headers: EDITOR, body: { sede_id: 'jesi-sede', nome: 'Ingresso C', piano: 3, corpo: 'C', punto: { x: 25.123, y: 1.5 } } });
  assert.equal(res.status, 201);
  res = await req('PUT', '/api/reparti/jesi-dialisi', { headers: EDITOR, body: { punto: { x: 26, y: 4 } } });
  assert.equal(res.status, 200);
  res = await req('PUT', '/api/reparti/jesi-dialisi', { headers: EDITOR, body: { punto: { x: 'a' } } });
  assert.equal(res.status, 400);

  data = await (await req('GET', '/api/data')).json();
  assert.deepEqual(data.ingressi.find((i) => i.nome === 'Ingresso C').punto, { x: 25.12, y: 1.5 });
  assert.deepEqual(data.reparti.find((r) => r.id === 'jesi-dialisi').punto, { x: 26, y: 4 });
});

test('adds the new per-body fields to maps seeded by an older release', () => {
  const mappa = JSON.parse(store.get('ospedali', 'jesi').mappa);
  for (const c of Object.values(mappa.corpi)) { delete c.ascensore; delete c.dove; }
  store.db.prepare('UPDATE ospedali SET mappa = ? WHERE id = ?').run(JSON.stringify(mappa), 'jesi');
  updateSeededMaps(store);
  const after = JSON.parse(store.get('ospedali', 'jesi').mappa);
  assert.equal(after.corpi.DX.ascensore, 'asc-cd');
  assert.match(after.corpi.A.dove, /corridoio verso i corpi A-B/);
  assert.equal(after.blocks.length, mappa.blocks.length);
});

test('replaces a stored map with a newer drawing from the seed', () => {
  const old = JSON.parse(store.get('ospedali', 'jesi').mappa);
  delete old.versione;
  old.rot = -28;
  store.db.prepare('UPDATE ospedali SET mappa = ? WHERE id = ?').run(JSON.stringify(old), 'jesi');
  updateSeededMaps(store);
  const now = JSON.parse(store.get('ospedali', 'jesi').mappa);
  assert.equal(now.versione, 2);
  assert.equal(now.rot, -12);
});

test('one-off data fixes update an old database once, without overwriting manual edits', () => {
  // Put the database back as an older release had seeded it, with one ward already edited by hand.
  store.db.prepare("UPDATE reparti SET corpo = 'B' WHERE id = 'jesi-orto-deg'").run();
  store.db.prepare("UPDATE reparti SET corpo = 'A' WHERE id = 'jesi-gessi'").run();
  store.db.prepare("DELETE FROM reparti WHERE id = 'jesi-pneumologia'").run();
  store.db.prepare("DELETE FROM reparti WHERE id = 'jesi-urologia'").run();
  store.db.exec('DELETE FROM correzioni');

  applyDataFixes(store);
  assert.equal(store.get('reparti', 'jesi-urologia').piano, 2);
  assert.equal(store.get('reparti', 'jesi-orto-deg').corpo, 'D');
  assert.equal(store.get('reparti', 'jesi-orto-deg').ascensore_id, 'asc-cd');
  assert.equal(store.get('reparti', 'jesi-gessi').corpo, 'A', 'a ward edited by hand is left alone');
  assert.equal(store.get('reparti', 'jesi-pneumologia').piano, 3);

  // Runs only once: undoing the change by hand is not reverted at the next start.
  store.db.prepare("UPDATE reparti SET corpo = 'B' WHERE id = 'jesi-orto-deg'").run();
  applyDataFixes(store);
  assert.equal(store.get('reparti', 'jesi-orto-deg').corpo, 'B');
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM reparti WHERE lower(nome) LIKE '%pneumologia –%'").get().n, 1);
});

test('names and keywords from the Blocco fucsia sign reach an old database once', () => {
  // As seeded before the check on site; Centro prelievi had already been renamed by hand.
  store.db.prepare("UPDATE reparti SET nome = 'Pediatria – Degenze', kw = 'pediatria bambini degenza' WHERE id = 'jesi-pediatria'").run();
  store.db.prepare("UPDATE reparti SET nome = 'Prelievi (a mano)' WHERE id = 'jesi-prelievi'").run();
  store.db.prepare("UPDATE reparti SET kw = 'medicina b area medica degenza' WHERE id = 'jesi-medicina-b'").run();
  store.db.prepare("DELETE FROM reparti WHERE id = 'jesi-bar'").run();
  store.db.prepare("DELETE FROM correzioni WHERE id = '2026-11-05-jesi-cartello-blocco-fucsia'").run();

  applyDataFixes(store);
  assert.equal(store.get('reparti', 'jesi-pediatria').nome, 'Pediatria e Neonatologia – Degenze');
  assert.match(store.get('reparti', 'jesi-pediatria').kw, /\bneonatologia\b/);
  assert.equal(store.get('reparti', 'jesi-prelievi').nome, 'Prelievi (a mano)', 'a ward renamed by hand is left alone');
  assert.equal(store.get('reparti', 'jesi-medicina-b').kw, 'medicina b area medica degenza broncopneumologia dermatologia nefrologia dialisi');
  const bar = store.get('reparti', 'jesi-bar');
  assert.equal(bar.piano, 2);
  assert.equal(bar.corpo, 'nC');

  // Runs once: a second start adds no second bar and no repeated keywords.
  applyDataFixes(store);
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM reparti WHERE lower(nome) = 'bar' AND sede_id = 'jesi-sede'").get().n, 1);
});

test('seeds Senigallia with its 2D plan, numbered doors and every floor', async () => {
  const data = await (await req('GET', '/api/data')).json();
  const sen = data.ospedali.find((o) => o.id === 'senigallia');
  assert.equal(sen.mappa.tipo, 'pianta');
  const reps = data.reparti.filter((r) => r.sede_id === 'senigallia-sede');
  const blocks = new Set(sen.mappa.blocks.map((b) => b.id));
  assert.ok(reps.length >= 60);
  assert.ok(reps.every((r) => blocks.has(r.corpo) && r.piano >= -1 && r.piano <= 6));
  const ingById = Object.fromEntries(data.ingressi.map((i) => [i.id, i]));
  assert.equal(ingById[reps.find((r) => r.nome === 'Dialisi').ingresso_id].sigla, '11');
  assert.equal(reps.find((r) => r.nome === 'Ortopedia').piano, 5);
  assert.ok(data.ingressi.filter((i) => i.sede_id === 'senigallia-sede').every((i) => i.punto && blocks.has(i.corpo)));
});

test('adds Senigallia once to a database created before it existed', () => {
  store.remove('ospedali', 'senigallia', 'test');
  store.db.exec("DELETE FROM correzioni WHERE id = '2026-11-04-senigallia'");
  applyDataFixes(store);
  assert.ok(store.get('reparti', 'sen-dialisi'));
  // Deleted on purpose afterwards: it does not come back at the next start.
  store.remove('ospedali', 'senigallia', 'test');
  applyDataFixes(store);
  assert.equal(store.get('ospedali', 'senigallia'), null);
});

test('writes one consistent backup per day and keeps the last N', () => {
  const bdir = path.join(dir, 'backup');
  for (const day of ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']) {
    assert.ok(snapshot(store, bdir, 3, new Date(day + 'T10:00:00Z')));
  }
  assert.equal(snapshot(store, bdir, 3, new Date('2026-11-02T22:00:00Z')), null);
  assert.deepEqual(fs.readdirSync(bdir).sort(), ['reparti-2026-10-31.db', 'reparti-2026-11-01.db', 'reparti-2026-11-02.db']);
  const copy = openDb(path.join(bdir, 'reparti-2026-11-02.db'));
  assert.ok(copy.all().reparti.length > 0);
  copy.close();
});

test('serves the app shell with the build version', async () => {
  const sw = await (await req('GET', '/sw.js')).text();
  assert.match(sw, /VERSION = 'test123'/);
  // The offline cache lists every file of the app, modules in subfolders and photos included.
  const files = JSON.parse(sw.match(/const SHELL = (\[.*?\]);/)[1]);
  for (const f of ['/', '/app.js', '/app.css', '/views/mappa.js', '/map/map3d.js', '/img/jesi.webp']) assert.ok(files.includes(f), f);
  assert.ok(!files.includes('/sw.js') && !files.includes('/index.html'));
  for (const f of files.filter((x) => x !== '/')) assert.equal((await req('GET', f)).status, 200, f);
  const page = await req('GET', '/reparto/qualcosa');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<div id="app"/);
  assert.equal((await req('GET', '/../server/db.js')).status, 404);
  assert.equal((await req('GET', '/healthz')).status, 200);
});

test('hospital cards have a photo that is served as an image', async () => {
  // (Senigallia was deleted on purpose by an earlier test, so only its photo file is checked.)
  const data = await (await req('GET', '/api/data')).json();
  assert.equal(data.ospedali.find((o) => o.id === 'jesi').foto, '/img/jesi.webp');
  for (const f of ['/img/jesi.webp', '/img/senigallia.webp']) {
    const res = await req('GET', f);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/webp');
  }
});
