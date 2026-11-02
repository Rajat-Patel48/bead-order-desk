import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { env } from './env.js';
import { one, q } from './db.js';
import { HttpError, normPhone } from './http.js';
import type { Role } from './status.js';

export interface AuthUser {
  id: string;
  name: string;
  phone: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export const hashPin = (pin: string) => bcrypt.hash(pin, 10);

export function validPin(pin: string) {
  return /^\d{4,6}$/.test(pin);
}

export async function login(phoneRaw: string, pin: string) {
  const phone = normPhone(phoneRaw);
  const u = await one(`select * from users where phone = $1`, [phone]);
  // same message for unknown number and wrong PIN, so nobody can probe which numbers exist
  const bad = new HttpError(401, 'Wrong mobile number or PIN.');
  if (!u || !u.active) throw bad;
  if (u.locked_until && new Date(u.locked_until) > new Date()) {
    throw new HttpError(429, `Too many wrong PINs. Try again after ${LOCK_MINUTES} minutes or ask the owner to reset your PIN.`);
  }
  const ok = await bcrypt.compare(pin, u.pin_hash);
  if (!ok) {
    const attempts = u.failed_attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await q(`update users set failed_attempts = 0, locked_until = now() + make_interval(mins => $2) where id = $1`, [u.id, LOCK_MINUTES]);
    } else {
      await q(`update users set failed_attempts = $2 where id = $1`, [u.id, attempts]);
    }
    throw bad;
  }
  await q(`update users set failed_attempts = 0, locked_until = null where id = $1`, [u.id]);
  const token = jwt.sign({ sub: u.id, v: u.token_version }, env.JWT_SECRET, { expiresIn: '60d' });
  return { token, user: { id: u.id, name: u.name, phone: u.phone, role: u.role as Role } };
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const h = req.headers.authorization ?? '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!token) throw new HttpError(401, 'Please log in.');
    let payload: { sub: string; v: number };
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as { sub: string; v: number };
    } catch {
      throw new HttpError(401, 'Your login has expired. Please log in again.');
    }
    const u = await one(`select id, name, phone, role, active, token_version from users where id = $1`, [payload.sub]);
    if (!u || !u.active || u.token_version !== payload.v) throw new HttpError(401, 'Your login is no longer valid. Please log in again.');
    req.user = { id: u.id, name: u.name, phone: u.phone, role: u.role };
    next();
  } catch (e) {
    next(e);
  }
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return next(new HttpError(403, 'You are not allowed to do this.'));
    next();
  };
