function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);

  if (typeof globalThis.atob !== "function") {
    throw new Error("atob is unavailable in this runtime");
  }

  return globalThis.atob(padded);
}

export function decodeUserIdFromToken(token) {
  if (!token) {
    return 1;
  }

  if (token === "master") {
    return 1;
  }

  try {
    const decoded = decodeBase64Url(token);
    if (!decoded.startsWith("userId:")) {
      return 1;
    }

    const value = Number(decoded.replace("userId:", ""));
    return Number.isFinite(value) && value > 0 ? value : 1;
  } catch {
    return 1;
  }
}
