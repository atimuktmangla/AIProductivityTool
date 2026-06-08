export function makeTtlCache<T>(ttlMs: number) {
  let cached: T | null = null;
  let expiry = 0;
  return async (fetcher: () => Promise<T>): Promise<T> => {
    if (cached !== null && Date.now() < expiry) return cached;
    cached = await fetcher();
    expiry = Date.now() + ttlMs;
    return cached;
  };
}

export function makeKeyedTtlCache<T>(ttlMs: number) {
  const store = new Map<string, { value: T; expiry: number }>();
  return async (key: string, fetcher: () => Promise<T>): Promise<T> => {
    const entry = store.get(key);
    if (entry && Date.now() < entry.expiry) return entry.value;
    const value = await fetcher();
    store.set(key, { value, expiry: Date.now() + ttlMs });
    return value;
  };
}
