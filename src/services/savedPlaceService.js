import { del, get, post } from '../api/httpClient';

export function fetchSavedRestaurants() {
  return get('/saved-restaurants');
}

export function createSavedRestaurant(restaurantId) {
  return post('/saved-restaurants', { restaurantId });
}

export function deleteSavedRestaurant(savedRestaurantId) {
  return del(`/saved-restaurants/${savedRestaurantId}`);
}

export function fetchSavedCafes() {
  return get('/saved-cafes');
}

export function createSavedCafe(cafeId) {
  return post('/saved-cafes', { cafeId });
}

export function deleteSavedCafe(savedCafeId) {
  return del(`/saved-cafes/${savedCafeId}`);
}
