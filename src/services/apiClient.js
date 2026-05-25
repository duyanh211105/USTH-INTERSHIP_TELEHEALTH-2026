const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const TOKEN_KEY = 'telehealth_token';
const USER_KEY = 'telehealth_user';

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser() {
  const value = localStorage.getItem(USER_KEY);

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function storeSession({ token, user }) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function buildUrl(path) {
  if (path.startsWith('http')) {
    return path;
  }

  return `${API_BASE_URL.replace(/\/$/, '')}${path}`;
}

export function buildAssetUrl(path) {
  if (!path || path.startsWith('http') || path.startsWith('blob:') || path.startsWith('data:')) {
    return path;
  }

  if (path.startsWith('/')) {
    return buildUrl(path);
  }

  return path;
}

export async function apiRequest(path, options = {}) {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  const hasBody = options.body !== undefined;
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let body = options.body;

  if (hasBody && !isFormData && typeof options.body !== 'string') {
    body = JSON.stringify(options.body);
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(buildUrl(path), {
    ...options,
    headers,
    body,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    const error = new Error(payload.error?.message || payload.message || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload.data;
}
