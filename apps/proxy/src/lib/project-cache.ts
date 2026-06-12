/**
 * In-memory cache for proxy hot path.
 * Eliminates 2 DB round-trips (~10-40ms) on every proxied request.
 * TTL: 30s. Invalidated immediately on project/backend mutations.
 */

interface CachedProject {
  id: string;
  proxySlug: string;
  userId: string;
  shieldEnabled: boolean;
  shieldRateLimit: number;
  maintenanceHtml: string | null;
  backends: CachedBackend[];
  expiresAt: number;
}

interface CachedBackend {
  id: string;
  url: string;
  active: boolean;
  circuitOpen: boolean;
  failureStreak: number;
}

const TTL_MS = 30_000;
const cache = new Map<string, CachedProject>();

export function getCachedProject(slug: string): CachedProject | null {
  const entry = cache.get(slug);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(slug);
    return null;
  }
  return entry;
}

export function setCachedProject(
  slug: string,
  project: Omit<CachedProject, "expiresAt">,
) {
  cache.set(slug, { ...project, expiresAt: Date.now() + TTL_MS });
}

export function invalidateProject(slug: string) {
  cache.delete(slug);
}

export function invalidateBackend(backendId: string) {
  // Evict any project that contains this backend
  for (const [slug, proj] of cache.entries()) {
    if (proj.backends.some((b) => b.id === backendId)) {
      cache.delete(slug);
    }
  }
}

/** Patch cached backend fields without full eviction (e.g. after health check). */
export function patchCachedBackend(
  backendId: string,
  patch: Partial<CachedBackend>,
) {
  for (const proj of cache.values()) {
    const b = proj.backends.find((b) => b.id === backendId);
    if (b) Object.assign(b, patch);
  }
}

export function cacheSize() {
  return cache.size;
}
