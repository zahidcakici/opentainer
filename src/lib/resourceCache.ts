/**
 * Last-known data per resource, kept for the app's lifetime.
 *
 * Tab views unmount when the user switches away, which drops their hook
 * state. Hooks seed their state from here so a revisited tab renders its last
 * data immediately and refreshes in the background (stale-while-revalidate),
 * instead of starting empty on every visit.
 */
const cache = new Map<string, unknown>();

export function getCached<T>(key: string): T | undefined {
    return cache.get(key) as T | undefined;
}

export function hasCached(key: string): boolean {
    return cache.has(key);
}

export function setCached<T>(key: string, value: T): void {
    cache.set(key, value);
}

export function clearCache(): void {
    cache.clear();
}
