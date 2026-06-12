/**
 * Blocks backend URLs that resolve to private/reserved IP ranges.
 * Prevents SSRF attacks via cloud metadata endpoints and internal services.
 */

const BLOCKED_RANGES = [
  // Loopback
  /^127\./,
  /^::1$/,
  // Private RFC-1918
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  // Link-local / AWS metadata
  /^169\.254\./,
  // Carrier-grade NAT (also used by some cloud metadata)
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  // IPv6 private / link-local
  /^fc/i,
  /^fd/i,
  /^fe80/i,
  // 0.x.x.x
  /^0\./,
  // Broadcast
  /^255\./,
];

export function isSsrfSafe(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    // Only allow http/https
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    // Block raw IP addresses that match private ranges
    return !BLOCKED_RANGES.some((re) => re.test(host));
  } catch {
    return false;
  }
}
