import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, q } from '../db.js';

const sqlDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../sql');

export async function migrate() {
  await q(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
  const done = new Set((await q<{ name: string }>(`select name from schema_migrations`)).map((r) => r.name));
  for (const file of fs.readdirSync(sqlDir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query(fs.readFileSync(path.join(sqlDir, file), 'utf8'));
      await c.query(`insert into schema_migrations(name) values ($1)`, [file]);
      await c.query('commit');
      console.log(`applied ${file}`);
    } catch (e) {
      await c.query('rollback');
      throw e;
    } finally {
      c.release();
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  migrate()
    .then(() => pool.end())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
