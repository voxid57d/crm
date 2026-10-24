// @ts-check
/** @param {string} iso @param {string} zone */
export function localDateTime(iso, zone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
/** @param {string} local @param {string} zone @returns {string} */
export function zonedTimeToIso(local, zone) {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:[0-5][0-9]$/.test(local)) {
    return new Date(
      Date.parse(zonedTimeToIso(local.slice(0, 16), zone)) +
        Number(local.slice(17)) * 1000,
    ).toISOString();
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))
    throw new Error("Choose a valid scheduled date and time.");
  const target = Date.parse(local + "Z");
  if (
    !Number.isFinite(target) ||
    new Date(target).toISOString().slice(0, 16) !== local
  )
    throw new Error("Invalid calendar date.");
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const rendered = Date.parse(
      localDateTime(new Date(guess).toISOString(), zone) + "Z",
    );
    guess += target - rendered;
  }
  if (localDateTime(new Date(guess).toISOString(), zone) !== local)
    throw new Error(
      "This time does not exist in the business timezone. Choose another time.",
    );
  return new Date(guess).toISOString();
}
/** @param {string} iso @param {string} zone */
export function financialDateTime(iso, zone) {
  return (
    localDateTime(iso, zone) +
    ":" +
    new Intl.DateTimeFormat("en-GB", { timeZone: zone, second: "2-digit" })
      .format(new Date(iso))
      .padStart(2, "0")
  );
}
