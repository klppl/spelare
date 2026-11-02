// Map.set that evicts the oldest entries beyond `limit` (insertion order).
export function setBounded(map, key, value, limit) {
  map.set(key, value);
  while (map.size > limit) map.delete(map.keys().next().value);
}
