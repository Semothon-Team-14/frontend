const HOME_MODE_TRAVELER = "TRAVELER";
const HOME_MODE_LOCAL = "LOCAL";

let currentHomeMode = HOME_MODE_TRAVELER;
const listeners = new Set();

export { HOME_MODE_LOCAL, HOME_MODE_TRAVELER };

export function getCurrentHomeMode() {
  return currentHomeMode;
}

export function setCurrentHomeMode(nextMode) {
  const normalized =
    nextMode === HOME_MODE_LOCAL ? HOME_MODE_LOCAL : HOME_MODE_TRAVELER;
  if (normalized === currentHomeMode) {
    return;
  }
  currentHomeMode = normalized;
  listeners.forEach((listener) => {
    try {
      listener(currentHomeMode);
    } catch {
      // Ignore isolated listener failures.
    }
  });
}

export function subscribeHomeMode(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
