import { DatabaseSync } from 'node:sqlite';
import { existsSync, chmodSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// SQLite creates a consistent snapshot, including committed WAL data, without copying live files.
export function snapshotDatabase(source, destination) {
  source = resolve(source); destination = resolve(destination);
  if (!existsSync(source)) throw new Error('Source database does not exist');
  if (existsSync(destination) || source === destination) throw new Error('Destination must be a new file');
  const db = new DatabaseSync(source, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout=5000');
    db.prepare('VACUUM INTO ?').run(destination);
    chmodSync(destination, 0o600);
    const restored = new DatabaseSync(destination, { readOnly: true });
    try {
      const integrity = restored.prepare('PRAGMA integrity_check').all();
      if (integrity.some(row => Object.values(row)[0] !== 'ok')) throw new Error('Snapshot integrity check failed');
      if (restored.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Snapshot foreign key check failed');
    } finally { restored.close(); }
  } catch (error) { if (existsSync(destination)) unlinkSync(destination); throw error; }
  finally { db.close(); }
  return { verified: true };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) throw new Error('Usage: node scripts/backup-database.mjs SOURCE NEW_SNAPSHOT');
  console.info(snapshotDatabase(process.argv[2], process.argv[3]));
}
