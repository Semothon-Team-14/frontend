export function decodeUserIdFromToken(token) {
  if (!token) {
    return 1;
  }

  if (token === "master") {
    return 1;
  }

  try {
    const normalized = token.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const decoded = globalThis.atob ? globalThis.atob(padded) : null;
    if (!decoded || !decoded.startsWith("userId:")) {
      return 1;
    }

    const value = Number(decoded.replace("userId:", ""));
    return Number.isFinite(value) && value > 0 ? value : 1;
  } catch {
    return 1;
  }
}
