import { get, post } from '../api/httpClient';

export function fetchQuickMatches({ cityId, targetType } = {}) {
  return get('/quick-matches', {
    cityId,
    targetType,
  });
}

export function fetchQuickMatch(quickMatchId) {
  return get(`/quick-matches/${quickMatchId}`);
}

export function createQuickMatch({ cityId, message, targetType = 'ANY' }) {
  return post('/quick-matches', {
    cityId,
    message,
    targetType,
  });
}

export function acceptQuickMatch(quickMatchId) {
  return post(`/quick-matches/${quickMatchId}/accept`);
}

export function declineQuickMatch(quickMatchId) {
  return post(`/quick-matches/${quickMatchId}/decline`);
}
