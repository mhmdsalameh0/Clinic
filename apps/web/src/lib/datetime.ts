export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ar-LB", {
    timeZone: "Asia/Beirut",
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("ar-LB", {
    timeZone: "Asia/Beirut",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

export function formatDateInput(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Beirut",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

export function formatTimeInput(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Beirut",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}
