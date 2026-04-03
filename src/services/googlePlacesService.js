const GOOGLE_PLACES_API_BASE_URL = "https://places.googleapis.com/v1";

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
  const placeId = prediction?.placeId;
  const text = String(prediction?.text?.text || "").trim();
  if (!placeId || !text) {
    return null;
  }

  const [primaryText, ...secondaryParts] = text
    .split(",")
    .map((part) => String(part || "").trim())
    .filter(Boolean);

  return {
    placeId,
    primaryText: primaryText || text,
    secondaryText: secondaryParts.join(", "),
    description: text,
  };
}

async function requestJson({ path, method = "GET", params, body, fieldMask }) {
  const url = params
    ? `${GOOGLE_PLACES_API_BASE_URL}/${path}?${params.toString()}`
    : `${GOOGLE_PLACES_API_BASE_URL}/${path}`;
  const key = requireApiKey();
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      ...(fieldMask ? { "X-Goog-FieldMask": fieldMask } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      data?.error?.message || "Google Places request failed.",
    );
  }

  return data;
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

  const data = await requestJson({
    path: "places:autocomplete",
    method: "POST",
    fieldMask:
      "suggestions.placePrediction.placeId,suggestions.placePrediction.text",
    body: {
      input: cityName ? `${query} ${cityName}` : query,
      languageCode: language,
      ...(sessionToken ? { sessionToken } : {}),
    },
  });

  return (data?.suggestions || [])
    .map((item) => toPredictionItem(item?.placePrediction))
    .filter(Boolean);
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

  const params = new URLSearchParams({
    languageCode: language,
  });
  if (sessionToken) {
    params.set("sessionToken", sessionToken);
  }

  const data = await requestJson({
    path: `places/${encodeURIComponent(normalizedPlaceId)}`,
    method: "GET",
    params,
    fieldMask: "id,displayName,formattedAddress,location",
  });
  const latitude = Number(data?.location?.latitude);
  const longitude = Number(data?.location?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Google Places details did not include valid coordinates.");
  }

  return {
    placeId: data?.id || normalizedPlaceId,
    name: data?.displayName?.text || "",
    formattedAddress: data?.formattedAddress || "",
    latitude,
    longitude,
  };
}
