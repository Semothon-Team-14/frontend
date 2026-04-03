import { get, post, put } from '../api/httpClient';

export function fetchLocals() {
  return get('/locals');
}

export function createLocal({ cityId }) {
  return post('/locals', { cityId });
}

export function updateLocal(localId, patch) {
  return put(`/locals/${localId}`, patch);
}
