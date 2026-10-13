// Talks to the Fernway API. Adds the login token and turns errors into
// ApiError objects with a message that's safe to show to customers.
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_PORT = 4000;

/**
 * Works out where the API is:
 *  1. EXPO_PUBLIC_API_URL from mobile/.env, if you set one (e.g. a deployed server).
 *  2. In the browser preview: the same computer, port 4000.
 *  3. On a phone using Expo Go: the computer running "npm run mobile" — Expo
 *     tells us its address (e.g. 192.168.1.20), and the API runs on port 4000 there.
 */
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;
  }

  const hostUri = Constants.expoConfig?.hostUri; // e.g. "192.168.1.20:8081"
  const host = hostUri?.split(':')[0];
  if (host) return `http://${host}:${API_PORT}`;

  // Fallbacks: the Android emulator reaches your computer at 10.0.2.2.
  return Platform.OS === 'android' ? `http://10.0.2.2:${API_PORT}` : `http://localhost:${API_PORT}`;
}

export const API_URL = resolveApiUrl();

export interface FieldError {
  field: string | null;
  message: string;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** e.g. { postcode: 'Please enter a valid postcode' } */
  get fieldErrors(): Record<string, string> {
    const fields = (this.details as { fields?: FieldError[] } | undefined)?.fields ?? [];
    const result: Record<string, string> = {};
    for (const f of fields) if (f.field && !result[f.field]) result[f.field] = f.message;
    return result;
  }
}

let authToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

/** Called when the API says our login has expired. */
export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler;
}

export async function request<T>(path: string, options: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  // 30 s: a free hosting plan can take a while to "wake up" the API after a quiet period.
  const { method = 'GET', body, timeoutMs = 30_000 } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };
  const tokenUsed = authToken; // remember which login this request was sent with
  if (tokenUsed) headers.Authorization = `Bearer ${tokenUsed}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      "We couldn't reach the store. Check your internet connection and that the API is running, then try again.",
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    // Only log out if the token we actually sent was rejected (and is still the current one).
    if (response.status === 401 && tokenUsed && tokenUsed === authToken) unauthorizedHandler?.();
    const error = data?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'HTTP_ERROR',
      error?.message ?? 'Something went wrong. Please try again.',
      error?.details,
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/** "/uploads/products/x.jpg" → full URL the phone can load. */
export function imageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return /^https?:\/\//.test(path) ? path : `${API_URL}${path}`;
}

export function queryString(params: Record<string, string | number | boolean | null | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '' && value !== false)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}
