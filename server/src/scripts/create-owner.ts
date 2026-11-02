/**
 * First-time setup: create the owner account.
 *   npm run create-owner -- "Owner Name" 9800000000 1234
 */
import { hashPin, validPin } from '../auth.js';
import { normPhone } from '../http.js';
import { pool, q } from '../db.js';
import { migrate } from './migrate.js';

const [name, phoneRaw, pin] = process.argv.slice(2);
if (!name || !phoneRaw || !pin || !validPin(pin)) {
  console.error('Usage: npm run create-owner -- "Owner Name" <mobile> <4-6 digit PIN>');
  process.exit(1);
}
await migrate();
const phone = normPhone(phoneRaw);
await q(
  `insert into users(name, phone, role, pin_hash) values ($1, $2, 'owner', $3)
   on conflict (phone) do update set role = 'owner', pin_hash = excluded.pin_hash, active = true, token_version = users.token_version + 1`,
  [name, phone, await hashPin(pin)],
);
console.log(`Owner ${name} (${phone}) ready. Log in with this number and PIN.`);
await pool.end();
