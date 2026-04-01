import { API_TIMEOUT_MS, getApiBaseUrl } from './config';
import { getAccessToken } from './authTokenStore';

function buildUrl(path, query) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBaseUrl();
  const url = new URL(`${base}${normalizedPath}`);

  if (query && typeof query === 'object') {
    Object.entries(query).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        return;
      }

      url.searchParams.set(key, String(value));
    });
  }

  return url.toString();
}

function normalizeHeaders(headers = {}) {
  const merged = {
    Accept: 'application/json',
    ...headers,
  };

  const token = getAccessToken();
  if (token) {
    merged.accessToken = token;
  }

  return merged;
}

async function parseResponse(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function ensureJsonHeaders(headers, body) {
  if (body == null) {
    return headers;
  }

  if (body instanceof FormData) {
    return headers;
  }

  return {
    'Content-Type': 'application/json',
    ...headers,
  };
}

export async function request(path, options = {}) {
  const { method = 'GET', query, body, headers } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  const requestHeaders = ensureJsonHeaders(normalizeHeaders(headers), body);
  const requestBody = body == null || body instanceof FormData ? body : JSON.stringify(body);

  try {
    const response = await fetch(buildUrl(path, query), {
      method,
      headers: requestHeaders,
      body: requestBody,
      signal: controller.signal,
    });

    const data = await parseResponse(response);

    if (!response.ok) {
      const errorMessage = data?.reason || data?.message || `HTTP ${response.status}`;
      const error = new Error(errorMessage);
      error.status = response.status;
      error.payload = data;
      throw error;
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function get(path, query) {
  return request(path, { method: 'GET', query });
}

export function post(path, body, query) {
  return request(path, { method: 'POST', body, query });
}

export function put(path, body, query) {
  return request(path, { method: 'PUT', body, query });
}

export function del(path, query) {
  return request(path, { method: 'DELETE', query });
}
