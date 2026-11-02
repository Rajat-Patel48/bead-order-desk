import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: bool,
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  CORS_ORIGIN: z.string().default('*'),

  // WhatsApp Cloud API (all optional: without them the app falls back to tap-to-send wa.me links)
  WA_TOKEN: z.string().optional(),
  WA_PHONE_NUMBER_ID: z.string().optional(),
  WA_VERIFY_TOKEN: z.string().optional(),
  WA_APP_SECRET: z.string().optional(),
  WA_API_VERSION: z.string().default('v21.0'),
  WA_TEMPLATE_LANG: z.string().default('en'),
  WA_TEMPLATE_FACTORY: z.string().default('new_order_factory'),
  WA_TEMPLATE_FACTORY_BUTTON: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  WA_TEMPLATE_CUSTOMER: z.string().default('order_ready_customer'),

  ALERT_INTERVAL_MINUTES: z.coerce.number().default(5),
});

export const env = schema.parse(process.env);
export const waEnabled = () => Boolean(env.WA_TOKEN && env.WA_PHONE_NUMBER_ID);
