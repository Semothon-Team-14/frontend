import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';

const DEFAULT_PORT = '8080';
const DEFAULT_API_BASE_URL = `http://localhost:${DEFAULT_PORT}`;

function isLoopbackHost(host) {
  return host === 'localhost' || host === '127.0.0.1';
}

function extractHost(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  const normalized = value.includes('://') ? value : `http://${value}`;

  try {
    return new URL(normalized).hostname;
  } catch {
    return null;
  }
}

function extractDevServerHost() {
  const scriptUrl =
    NativeModules?.SourceCode?.scriptURL ||
    NativeModules?.SourceCode?.scriptURL?.url ||
    null;

  if (typeof scriptUrl !== 'string' || scriptUrl.length === 0) {
    return null;
  }

  try {
    return new URL(scriptUrl).hostname;
  } catch {
    return null;
  }
}

function extractExpoHost() {
  const hostUri =
    Constants?.expoConfig?.hostUri ||
    Constants?.manifest2?.extra?.expoClient?.hostUri ||
    Constants?.manifest?.debuggerHost ||
    null;

  return extractHost(hostUri);
}

function getDefaultApiBaseUrl() {
  const fallbackLanHost = process.env.EXPO_PUBLIC_DEV_LAN_IP?.trim() || null;
  const devServerHost = extractDevServerHost() || extractExpoHost();

  if (devServerHost) {
    if (Platform.OS === 'android' && isLoopbackHost(devServerHost)) {
      return `http://10.0.2.2:${DEFAULT_PORT}`;
    }

    const resolvedHost = isLoopbackHost(devServerHost) && fallbackLanHost
      ? fallbackLanHost
      : devServerHost;

    return `http://${resolvedHost}:${DEFAULT_PORT}`;
  }

  if (fallbackLanHost) {
    return `http://${fallbackLanHost}:${DEFAULT_PORT}`;
  }

  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${DEFAULT_PORT}`;
  }

  return DEFAULT_API_BASE_URL;
}

export function getApiBaseUrl() {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.replace(/\/$/, '');
  }

  return getDefaultApiBaseUrl();
}

export function getChatWebSocketUrl() {
  const base = getApiBaseUrl();
  if (base.startsWith('https://')) {
    return `${base.replace('https://', 'wss://')}/ws-chat`;
  }

  return `${base.replace('http://', 'ws://')}/ws-chat`;
}

export const API_TIMEOUT_MS = 15000;
