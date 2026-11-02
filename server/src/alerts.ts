import { q } from './db.js';
import { listOrders } from './orders.js';
import { pushToRoles, pushToUser } from './push.js';

/**
 * Runs every few minutes. Each alert (order + problem + stage) is pushed once,
 * to the owner and to whoever has to fix it.
 */
export async function runAlerts() {
  const open = await listOrders({ scope: 'open', limit: 500 });
  let sent = 0;
  for (const o of open) {
    for (const a of o.alerts) {
      const key = `${o.id}:${a.type}:${o.status}`;
      const fresh = await q(`insert into alert_log(key) values ($1) on conflict do nothing returning key`, [key]);
      if (!fresh.length) continue;
      sent++;
      const title = a.level === 'crit' ? `⚠ ${o.code}` : o.code;
      const body = `${o.customer_name}: ${a.text}`;
      await pushToRoles(['owner'], title, body, { orderId: o.id });
      if (a.owner === 'staff') await pushToUser(o.created_by, title, body, { orderId: o.id });
      else await pushToRoles(['factory'], title, body, { orderId: o.id });
    }
  }
  return sent;
}

export function startAlertLoop(minutes: number) {
  const tick = () => runAlerts().catch((e) => console.error('alerts failed', e));
  setTimeout(tick, 10_000);
  return setInterval(tick, minutes * 60_000);
}
