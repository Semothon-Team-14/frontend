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

export function fetchMinglePlacePhotos(mingleId) {
  return get(`/mingles/${mingleId}/place-photos`);
}

function guessMimeType(uri) {
  const normalized = String(uri || "").toLowerCase();
  if (normalized.endsWith(".png")) {
    return "image/png";
  }
  if (normalized.endsWith(".webp")) {
    return "image/webp";
  }
  if (normalized.endsWith(".heic")) {
    return "image/heic";
  }
  return "image/jpeg";
}

export function uploadMinglePlacePhoto(mingleId, fileUri) {
  const safeUri = String(fileUri || "").trim();
  if (!safeUri) {
    throw new Error("업로드할 이미지 파일이 없습니다.");
  }

  const extension = safeUri.split(".").pop() || "jpg";
  const formData = new FormData();
  formData.append("file", {
    uri: safeUri,
    name: `mingle-place-${Date.now()}.${extension}`,
    type: guessMimeType(safeUri),
  });

  return post(`/mingles/${mingleId}/place-photos`, formData);
}

export function createMingle({ cityId, title, description = null, placeName = null, meetDateTime = null, latitude = null, longitude = null, targetParticipantCount = null }) {
  return post('/mingles', {
    cityId,
    title,
    description,
    placeName,
    meetDateTime,
    latitude,
    longitude,
    targetParticipantCount,
  });
}

export function joinMingle(mingleId) {
  return post(`/mingles/${mingleId}/minglers`);
}

export function leaveMingle(mingleId) {
  return del(`/mingles/${mingleId}/minglers/me`);
}
