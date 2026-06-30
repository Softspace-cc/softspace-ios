import { useBackendStore } from '../store/useBackendStore';

// Central API + socket configuration. Override via Vite env vars
// (VITE_API_URL, VITE_SOCKET_URL) at build time for production.
const configuredApiUrl =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://softspace.cc';

export function resolveApiUrl() {
  try {
    return useBackendStore.getState().activeUrl;
  } catch (e) {
    if (typeof window !== 'undefined' && window.location.hostname === 'api.softspace.cc') {
      return window.location.origin;
    }
    return configuredApiUrl;
  }
}

export function resolveSocketUrl() {
  return resolveApiUrl();
}

// Deprecated constants kept for legacy imports - prefer resolveApiUrl()
export const API_URL = configuredApiUrl;
export const SOCKET_URL = configuredApiUrl;

/** Build a full asset URL out of an attachment / avatar / icon URL. */
export function assetUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path) || path.startsWith('data:')) return path;
  
  const base = resolveApiUrl();
  if (path.startsWith('/')) return `${base}${path}`;
  return `${base}/${path}`;
}

/** Build a URL for files from `public/` that works on web and Electron `file://`. */
export function publicAssetUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path) || path.startsWith('data:')) return path;

  const cleanPath = path.replace(/^\/+/, '');
  const baseUrl = import.meta.env.BASE_URL || '/';

  return new URL(`${baseUrl}${cleanPath}`, window.location.href).toString();
}

/** Wraps fetch with the API base URL, JSON content type, and bearer auth. */
export async function api(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<Response> {
  const activeUrl = resolveApiUrl();
  let url = path.startsWith('http') ? path : `${activeUrl}${path}`;
  
  // Cache busting for GET requests
  if (!options.method || options.method.toUpperCase() === 'GET') {
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}_t=${Date.now()}`;
  }

  const headers = new Headers(options.headers ?? {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (
    options.body &&
    !headers.has('Content-Type') &&
    typeof options.body === 'string'
  ) {
    headers.set('Content-Type', 'application/json');
  }
  
  // Disable cache to prevent stale data on reload
  const fetchOptions: RequestInit = {
    ...options,
    headers,
    cache: 'no-store'
  };
  
  try {
    const res = await fetch(url, fetchOptions);
    if (!res.ok && (res.status === 502 || res.status === 503 || res.status === 504)) {
      // Primary / active backend down, try failover
      const success = await useBackendStore.getState().handleRequestFailure();
      if (success) {
        // Retry fetch with new activeUrl
        const retryUrl = path.startsWith('http') ? path : `${resolveApiUrl()}${path}`;
        return fetch(retryUrl, fetchOptions);
      }
    }
    return res;
  } catch (err) {
    // Network connectivity failure
    const success = await useBackendStore.getState().handleRequestFailure();
    if (success) {
      // Retry fetch with new activeUrl
      const retryUrl = path.startsWith('http') ? path : `${resolveApiUrl()}${path}`;
      return fetch(retryUrl, fetchOptions);
    }
    throw err;
  }
}

/** Convenience helper that JSON-encodes the body and parses the JSON response. */
export async function apiJson<T = unknown>(
  path: string,
  options: Omit<RequestInit, 'body'> & { body?: unknown } = {},
  token?: string | null
): Promise<T> {
  const { body, ...rest } = options;
  const res = await api(
    path,
    {
      ...rest,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
    token
  );
  const text = await res.text();
  let json = null;
  if (text && text.length > 0) {
    try {
      json = JSON.parse(text);
    } catch (e) {
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 50)}...`);
      }
      return text as any as T;
    }
  }
  
  if (!res.ok) {
    const err = (json ?? {}) as Record<string, unknown>;
    const message =
      (err.message as string) ?? (err.error as string) ?? `HTTP ${res.status}`;
    const error = new Error(message) as Error & {
      status?: number;
      details?: unknown;
    };
    error.status = res.status;
    error.details = json;
    throw error;
  }
  return json as T;
}
