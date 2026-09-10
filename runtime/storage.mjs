import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

class Statement {
  constructor(database, sql, parameters = []) {
    this.database = database;
    this.sql = sql;
    this.parameters = parameters;
  }
  bind(...parameters) { return new Statement(this.database, this.sql, parameters); }
  execute() {
    const statement = this.database.prepare(this.sql);
    if (statement.columns().length) {
      const results = statement.all(...this.parameters).map(row => ({ ...row }));
      return { success: true, results, meta: { changes: 0 } };
    }
    const result = statement.run(...this.parameters);
    return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
  async all() { return this.execute(); }
  async run() { return this.execute(); }
  async first(column) {
    const row = this.execute().results[0];
    return row ? (column ? row[column] : row) : null;
  }
  async raw() {
    const statement = this.database.prepare(this.sql);
    statement.setReturnArrays(true);
    return statement.all(...this.parameters);
  }
}

export function openDatabase(filename, migrationsDirectory = resolve('drizzle')) {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
  const sqlite = new DatabaseSync(filename);
  try {
    sqlite.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
    sqlite.exec('CREATE TABLE IF NOT EXISTS _railway_migrations (name TEXT PRIMARY KEY, sha256 TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    const journal = JSON.parse(readFileSync(join(migrationsDirectory, 'meta', '_journal.json'), 'utf8'));
    for (const { tag } of journal.entries) {
      const sql = readFileSync(join(migrationsDirectory, `${tag}.sql`), 'utf8');
      const hash = createHash('sha256').update(sql).digest('hex');
      const applied = sqlite.prepare('SELECT sha256 FROM _railway_migrations WHERE name = ?').get(tag);
      if (applied) {
        if (applied.sha256 !== hash) throw new Error(`Applied migration changed: ${tag}`);
        continue;
      }
      // Table rebuild migrations need foreign keys disabled before BEGIN.
      sqlite.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;');
      try {
        sqlite.exec(sql);
        const violations = sqlite.prepare('PRAGMA foreign_key_check').all();
        if (violations.length) throw new Error(`Foreign key violations in migration: ${tag}`);
        sqlite.prepare('INSERT INTO _railway_migrations (name, sha256) VALUES (?, ?)').run(tag, hash);
        sqlite.exec('COMMIT;');
      } catch (error) { sqlite.exec('ROLLBACK;'); throw error; }
    }
    sqlite.exec('PRAGMA foreign_keys=ON;');
  } catch (error) { sqlite.close(); throw error; }
  return {
    prepare(sql) { return new Statement(sqlite, sql); },
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE;');
      try {
        // Execute synchronously so no request can interleave within this batch.
        const results = statements.map(statement => statement.execute());
        sqlite.exec('COMMIT;');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK;'); throw error; }
    },
    close() { sqlite.close(); },
  };
}

export class LocalBucket {
  constructor(directory) { this.directory = resolve(directory); }
  path(key) {
    if (!key || isAbsolute(key) || key.includes('\\') || key.includes('\0')) throw new Error('Invalid object key');
    const target = resolve(this.directory, key);
    const rel = relative(this.directory, target);
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Invalid object key');
    return target;
  }
  async put(key, value) {
    const target = this.path(key);
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    try { await writeFile(temporary, Buffer.from(value)); await rename(temporary, target); }
    finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  async get(key) {
    try {
      const bytes = await readFile(this.path(key));
      return { body: new Response(bytes).body, httpEtag: `"${createHash('sha256').update(bytes).digest('hex')}"` };
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  async delete(key) {
    await unlink(this.path(key)).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

export function dataDirectory() {
  if (process.env.RAILWAY_ENVIRONMENT_ID && !process.env.RAILWAY_VOLUME_MOUNT_PATH) {
    throw new Error('Railway requires a persistent volume before startup.');
  }
  return process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DATA_DIR || resolve('.data');
}

const runtimeKey = Symbol.for('cortou-anotou.storage');
export function getStorage() {
  if (!globalThis[runtimeKey]) {
    const directory = dataDirectory();
    globalThis[runtimeKey] = {
      DB: openDatabase(join(directory, 'app.sqlite')),
      BUCKET: new LocalBucket(join(directory, 'uploads')),
    };
  }
  return globalThis[runtimeKey];
}
