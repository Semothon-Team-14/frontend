function normalizeDate(dateText) {
  if (!dateText) {
    return null;
  }

  const text = String(dateText).trim();

  const fullDateMatch = text.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (fullDateMatch) {
    const year = Number(fullDateMatch[1]);
    const month = Number(fullDateMatch[2]) - 1;
    const day = Number(fullDateMatch[3]);
    const parsed = new Date(year, month, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const shortDateMatch = text.match(/^(\d{1,2})[./-](\d{1,2})$/);
  if (shortDateMatch) {
    const now = new Date();
    const year = now.getFullYear();
    const month = Number(shortDateMatch[1]) - 1;
    const day = Number(shortDateMatch[2]);
    const parsed = new Date(year, month, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

export function pickCurrentTrip(trips) {
  if (!Array.isArray(trips) || trips.length === 0) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overlappingTrips = trips
    .filter((trip) => {
      const start = normalizeDate(trip?.startDate);
      const end = normalizeDate(trip?.endDate);
      if (!start || !end) {
        return false;
      }
      return start <= today && end >= today;
    })
    .sort((a, b) => {
      const aStart = normalizeDate(a?.startDate);
      const bStart = normalizeDate(b?.startDate);
      return (bStart?.getTime() || 0) - (aStart?.getTime() || 0);
    });

  return overlappingTrips[0] || null;
}
