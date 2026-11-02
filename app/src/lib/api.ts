import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** Set EXPO_PUBLIC_API_URL in app/.env (see .env.example). On a phone, "localhost" means the phone itself. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

const KEY = 'bod_token';
export const tokenStore = {
  async get(): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return globalThis.localStorage?.getItem(KEY) ?? null;
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(KEY);
  },
  async set(t: string) {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.setItem(KEY, t);
      } catch {}
      return;
    }
    await SecureStore.setItemAsync(KEY, t);
  },
  async clear() {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.removeItem(KEY);
      } catch {}
      return;
    }
    await SecureStore.deleteItemAsync(KEY);
  },
};

let token: string | null = null;
let onUnauthorized: () => void = () => {};
export const setToken = (t: string | null) => {
  token = t;
};
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, opts: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown } = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(API_URL + path, {
      method: opts.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your internet connection.");
  }
  const j: any = await r.json().catch(() => ({}));
  if (r.status === 401 && token) onUnauthorized();
  if (!r.ok) throw new ApiError(r.status, j?.error || `Something went wrong (${r.status}).`);
  return j as T;
}
