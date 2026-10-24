// @ts-check
/** @param {Date} now @param {string} zone @param {string} preset */
export function financePeriod(now, zone, preset) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  if (preset === "today") return { from: today, to: today };
  if (preset === "week") {
    const date = new Date(today + "T00:00:00Z");
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return { from: date.toISOString().slice(0, 10), to: today };
  }
  return { from: today.slice(0, 8) + "01", to: today };
}
