import { get } from '../api/httpClient';

export function fetchNationalities() {
  return get('/nationalities');
}

export function fetchCitiesByNationality(nationalityId) {
  return get(`/cities/nationalities/${nationalityId}`);
}

export function fetchRestaurantsByCity(cityId) {
  return get(`/restaurants/cities/${cityId}`);
}

export function fetchRestaurantImages(restaurantId) {
  return get(`/restaurants/${restaurantId}/images`);
}

export function fetchCafesByCity(cityId) {
  return get(`/cafes/cities/${cityId}`);
}

export function fetchCafeImages(cafeId) {
  return get(`/cafes/${cafeId}/images`);
}
