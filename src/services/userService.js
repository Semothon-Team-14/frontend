import { get, post, put } from '../api/httpClient';

export function fetchUsers() {
  return get('/users');
}

export function fetchUser(userId) {
  return get(`/users/${userId}`);
}

export function updateUser(userId, patch) {
  return put(`/users/${userId}`, patch);
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

export function uploadUserProfileImage(userId, fileUri) {
  const safeUri = String(fileUri || "").trim();
  if (!safeUri) {
    throw new Error("업로드할 이미지 파일이 없습니다.");
  }

  const extension = safeUri.split(".").pop() || "jpg";
  const formData = new FormData();
  formData.append("file", {
    uri: safeUri,
    name: `profile-${Date.now()}.${extension}`,
    type: guessMimeType(safeUri),
  });
  return post(`/users/${userId}/profile-image`, formData);
}
