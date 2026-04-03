const GOOGLE_PLACES_API_BASE_URL = "https://maps.googleapis.com/maps/api/place";

function getGooglePlacesApiKey() {
  return String(process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || "").trim();
}

function requireApiKey() {
  const apiKey = getGooglePlacesApiKey();
  if (!apiKey) {
    throw new Error("Google Places API key is not configured.");
  }

  return apiKey;
}

function toPredictionItem(prediction) {
  if (!prediction?.place_id) {
    return null;
  }

  return {
    placeId: prediction.place_id,
    primaryText:
      prediction?.structured_formatting?.main_text ||
      prediction?.description ||
      "",
    secondaryText:
      prediction?.structured_formatting?.secondary_text || "",
    description: prediction?.description || "",
  };
}

async function requestJson(path, params) {
  const url = `${GOOGLE_PLACES_API_BASE_URL}/${path}?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Google Places request failed.");
  }

  return response.json();
}

export async function searchGooglePlaces({
  input,
  cityName = "",
  language = "ko",
  sessionToken = "",
}) {
  const query = String(input || "").trim();
  if (query.length < 2) {
    return [];
  }

  const key = requireApiKey();
  const params = new URLSearchParams({
    key,
    input: cityName ? `${query} ${cityName}` : query,
    language,
    types: "establishment",
  });
  if (sessionToken) {
    params.set("sessiontoken", sessionToken);
  }

  const data = await requestJson("autocomplete/json", params);
  const status = String(data?.status || "");
  if (status !== "OK" && status !== "ZERO_RESULTS") {
    throw new Error(data?.error_message || "Google Places autocomplete failed.");
  }

  return (data?.predictions || []).map(toPredictionItem).filter(Boolean);
}

export async function fetchGooglePlaceDetails({
  placeId,
  language = "ko",
  sessionToken = "",
}) {
  const normalizedPlaceId = String(placeId || "").trim();
  if (!normalizedPlaceId) {
    throw new Error("placeId is required.");
  }

  const key = requireApiKey();
  const params = new URLSearchParams({
    key,
    place_id: normalizedPlaceId,
    language,
    fields: "name,formatted_address,geometry/location,place_id",
  });
  if (sessionToken) {
    params.set("sessiontoken", sessionToken);
  }

  const data = await requestJson("details/json", params);
  const status = String(data?.status || "");
  if (status !== "OK") {
    throw new Error(data?.error_message || "Google Places details failed.");
  }

  const result = data?.result;
  const latitude = Number(result?.geometry?.location?.lat);
  const longitude = Number(result?.geometry?.location?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Google Places details did not include valid coordinates.");
  }

  return {
    placeId: result?.place_id || normalizedPlaceId,
    name: result?.name || "",
    formattedAddress: result?.formatted_address || "",
    latitude,
    longitude,
  };
}
