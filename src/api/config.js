const DEFAULT_API_BASE_URL = 'http://localhost:8080';

export function getApiBaseUrl() {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.replace(/\/$/, '');
  }

  return DEFAULT_API_BASE_URL;
}

export const API_TIMEOUT_MS = 15000;
