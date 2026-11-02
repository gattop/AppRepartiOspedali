import fs from 'node:fs';
import path from 'node:path';

const NAME = /^reparti-\d{4}-\d{2}-\d{2}\.db$/;

// One consistent snapshot per day (VACUUM INTO works on the live database), written under a
// temporary name and renamed, so an external backup job never copies a half-written file.
export function snapshot(store, dir, keep, now = new Date()) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `reparti-${now.toISOString().slice(0, 10)}.db`);
  if (fs.existsSync(file)) return null;
  const tmp = file + '.tmp';
  fs.rmSync(tmp, { force: true });
  store.backupTo(tmp);
  fs.renameSync(tmp, file);
  const old = fs.readdirSync(dir).filter((f) => NAME.test(f)).sort().reverse().slice(keep);
  for (const f of old) fs.rmSync(path.join(dir, f));
  return file;
}

export function scheduleBackups(store, dir, keep) {
  const run = () => {
    try {
      const file = snapshot(store, dir, keep);
      if (file) console.log(`Backup scritto: ${file}`);
    } catch (e) {
      console.error('Backup non riuscito:', e);
    }
  };
  run();
  // Checking every hour is cheap: a new file is written only when the day changes.
  setInterval(run, 60 * 60 * 1000).unref();
}
