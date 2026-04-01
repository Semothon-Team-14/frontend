import { del, get, post } from '../api/httpClient';

export function fetchMingles({ cityId } = {}) {
  return get('/mingles', { cityId });
}

export function fetchMingle(mingleId) {
  return get(`/mingles/${mingleId}`);
}

export function fetchMingleMinglers(mingleId) {
  return get(`/mingles/${mingleId}/minglers`);
}

export function joinMingle(mingleId) {
  return post(`/mingles/${mingleId}/minglers`);
}

export function leaveMingle(mingleId) {
  return del(`/mingles/${mingleId}/minglers/me`);
}
