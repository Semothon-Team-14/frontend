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

export async function fetchAllCities() {
  const nationalityResponse = await fetchNationalities();
  const nationalities = nationalityResponse?.nationalities ?? [];

  const cityResponses = await Promise.all(
    nationalities.map((nationality) => fetchCitiesByNationality(nationality.id)),
  );

  return cityResponses.flatMap((response) => response?.cities ?? []);
}
