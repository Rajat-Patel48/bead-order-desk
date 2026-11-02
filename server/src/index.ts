import { buildApp } from './app.js';
import { startAlertLoop } from './alerts.js';
import { env, waEnabled } from './env.js';
import { migrate } from './scripts/migrate.js';

await migrate();
buildApp().listen(env.PORT, () => {
  console.log(`Bead Order Desk API on :${env.PORT} · WhatsApp Cloud API ${waEnabled() ? 'ON' : 'off (using tap-to-send links)'}`);
});
startAlertLoop(env.ALERT_INTERVAL_MINUTES);
