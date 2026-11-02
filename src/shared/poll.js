// Calls probe() up to `attempts` times, `intervalMs` apart, and resolves with
// its first truthy result, or null when attempts run out or isCurrent()
// reports the caller's request is stale (checked before each attempt).
export async function pollFor(
  probe,
  { attempts, intervalMs, isCurrent = () => true },
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (!isCurrent()) return null;
    const value = probe();
    if (value) return value;
    if (attempt < attempts - 1)
      await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }
  return null;
}
