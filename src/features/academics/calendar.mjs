// @ts-check
/** Calendar arithmetic uses date-only UTC values, never the browser timezone.
 * @param {string} value @param {number} amount */
export function addDays(value, amount) {
  const date = new Date(value + "T00:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw new Error("Choose a valid calendar date.");
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
/** @param {string} date @param {string} view */
export function calendarPeriod(date, view) {
  addDays(date, 0);
  const current = new Date(date + "T00:00:00Z"),
    day = (current.getUTCDay() + 6) % 7;
  let from = date,
    to = date,
    previous = addDays(date, -1),
    next = addDays(date, 1);
  if (view === "week") {
    from = addDays(date, -day);
    to = addDays(from, 6);
    previous = addDays(date, -7);
    next = addDays(date, 7);
  } else if (view === "month") {
    const first = new Date(
        Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1),
      ),
      last = new Date(
        Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0),
      );
    from = addDays(
      first.toISOString().slice(0, 10),
      -((first.getUTCDay() + 6) % 7),
    );
    to = addDays(
      last.toISOString().slice(0, 10),
      6 - ((last.getUTCDay() + 6) % 7),
    );
    previous = new Date(
      Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 1, 1),
    )
      .toISOString()
      .slice(0, 10);
    next = new Date(
      Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1),
    )
      .toISOString()
      .slice(0, 10);
  } else if (view !== "day")
    throw new Error("Choose a day, week or month view.");
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return { from, to, previous, next, days };
}
