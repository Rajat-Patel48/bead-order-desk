import { q } from './db.js';
import type { Role } from './status.js';

/** Expo push notifications. Failures are logged and never block the request. */
async function send(tokens: string[], title: string, body: string, data: Record<string, unknown> = {}) {
  const valid = [...new Set(tokens.filter((t) => t && t.startsWith('ExponentPushToken')))];
  if (!valid.length || process.env.NODE_ENV === 'test') return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(valid.map((to) => ({ to, title, body, data, sound: 'default', priority: 'high' }))),
    });
  } catch (e) {
    console.warn('push failed', e);
  }
}

export async function pushToRoles(roles: Role[], title: string, body: string, data?: Record<string, unknown>, exceptUserId?: string) {
  const rows = await q<{ push_token: string }>(
    `select push_token from users where active and push_token is not null and role = any($1) and ($2::uuid is null or id <> $2)`,
    [roles, exceptUserId ?? null],
  );
  await send(rows.map((r) => r.push_token), title, body, data);
}

export async function pushToUser(userId: string | null | undefined, title: string, body: string, data?: Record<string, unknown>) {
  if (!userId) return;
  const rows = await q<{ push_token: string }>(`select push_token from users where id = $1 and active and push_token is not null`, [userId]);
  await send(rows.map((r) => r.push_token), title, body, data);
}
