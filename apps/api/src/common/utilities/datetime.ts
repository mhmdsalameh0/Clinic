const DEFAULT_TIMEZONE = "Asia/Beirut";

function getOffsetMinutes(date: Date, timezone = DEFAULT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );
  return (asUtc - date.getTime()) / 60_000;
}

export function localDateTimeToUtc(date: string, time: string, timezone = DEFAULT_TIMEZONE) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const naiveUtc = new Date(Date.UTC(year!, month! - 1, day!, hour!, minute!, 0));
  const offset = getOffsetMinutes(naiveUtc, timezone);
  return new Date(naiveUtc.getTime() - offset * 60_000);
}

export function getLocalDayBounds(date: Date, timezone = DEFAULT_TIMEZONE) {
  const localDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
  return getLocalDayBoundsFromDateString(localDate, timezone);
}

export function getLocalDayBoundsFromDateString(date: string, timezone = DEFAULT_TIMEZONE) {
  const start = localDateTimeToUtc(date, "00:00", timezone);
  const next = new Date(start);
  next.setUTCDate(next.getUTCDate() + 1);
  return { start, end: next };
}

export function addLocalDays(date: Date, days: number, timezone = DEFAULT_TIMEZONE) {
  const localDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
  const [year, month, day] = localDate.split("-").map(Number);
  const shifted = new Date(Date.UTC(year!, month! - 1, day! + days));
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(shifted);
}

export function formatLocalTime(date: Date, timezone = DEFAULT_TIMEZONE) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}
