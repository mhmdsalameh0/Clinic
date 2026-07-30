export function prependItem<T extends { id: string }>(items: T[], item: T) {
  return [item, ...items.filter((current) => current.id !== item.id)];
}

export function replaceItem<T extends { id: string }>(items: T[], item: T) {
  return items.map((current) => (current.id === item.id ? item : current));
}

export function removeItem<T extends { id: string }>(items: T[], id: string) {
  return items.filter((current) => current.id !== id);
}
