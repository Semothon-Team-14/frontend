import { get } from '../api/httpClient';

export function fetchKeywords() {
  return get('/keywords');
}

