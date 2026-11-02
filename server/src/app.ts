import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { requireAuth } from './auth.js';
import { env } from './env.js';
import { errorHandler } from './http.js';
import { authRoutes, dashboardRoutes, itemRoutes, meRoutes, settingsRoutes, userRoutes } from './routes/misc.js';
import { orders } from './routes/orders.js';
import { webhook } from './routes/webhook.js';

export function buildApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',') }));

  // Webhook needs the raw body for signature checking, so it goes before express.json()
  app.use('/webhooks/whatsapp', webhook);
  app.use(express.json({ limit: '200kb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/auth', authRoutes);
  app.use('/me', requireAuth, meRoutes);
  app.use('/items', requireAuth, itemRoutes);
  app.use('/orders', requireAuth, orders);
  app.use('/settings', requireAuth, settingsRoutes);
  app.use('/users', requireAuth, userRoutes);
  app.use('/dashboard', requireAuth, dashboardRoutes);

  app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use(errorHandler);
  return app;
}
