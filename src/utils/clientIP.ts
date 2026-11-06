/**
 * Returns the client IP as seen by the first trusted proxy: the rightmost
 * X-Forwarded-For entry (earlier entries are client-supplied and spoofable).
 */
export function getClientIP(forwardedFor: string | string[] | undefined, fallback: string): string {
  const header = Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor;
  if (header) {
    const parts = header.split(',').map(p => p.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  return fallback;
}
