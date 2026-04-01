import { get } from '../api/httpClient';

function toUiCity(city) {
  if (!city) {
    return null;
  }

  return {
    ...city,
    name: city.cityNameKorean || city.cityNameEnglish || '',
  };
}

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
  const response = await get('/cities');
  const nationalities = response?.nationalities ?? [];
  const cities = nationalities.flatMap((entry) => entry?.cities ?? []);
  return cities.map(toUiCity).filter(Boolean);
}
