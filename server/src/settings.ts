import { one, q } from './db.js';
import { DEFAULT_SETTINGS, type Settings } from './status.js';

export async function getSettings(): Promise<Settings> {
  const row = await one<{ value: Partial<Settings> }>(`select value from settings where key = 'app'`);
  return { ...DEFAULT_SETTINGS, ...(row?.value ?? {}) };
}

export async function saveSettings(s: Settings): Promise<Settings> {
  await q(
    `insert into settings(key, value) values ('app', $1)
     on conflict (key) do update set value = excluded.value`,
    [JSON.stringify(s)],
  );
  return s;
}
