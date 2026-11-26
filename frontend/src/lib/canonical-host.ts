/**
 * One address for the public site. With CANONICAL_HOST set (the live site: www.sindhusmathswizclasses.com), a request
 * that reaches the site by its bare domain or over plain HTTP is sent to https://<CANONICAL_HOST>, same path and
 * query. Sign-in cookies are secure-only and tied to that host, so this keeps sign-in working wherever a visitor
 * starts. Any other host (localhost, the LAN address, staging) is left alone.
 *
 * Behind Cloudflare Tunnel the app itself receives plain HTTP from cloudflared on this PC; the visitor's scheme
 * arrives in X-Forwarded-Proto.
 */
export function canonicalRedirect(url: URL, headers: Headers, canonicalHost: string | undefined): string | null {
  const canonical = canonicalHost?.trim().toLowerCase();
  if (!canonical) return null;
  const host = (headers.get('x-forwarded-host') ?? headers.get('host') ?? url.host).split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
  const bare = canonical.replace(/^www\./, '');
  if (host !== canonical && host !== bare) return null;
  const proto = (headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')).split(',')[0].trim().toLowerCase();
  if (host === canonical && proto === 'https') return null;
  return `https://${canonical}${url.pathname}${url.search}`;
}

/** The visitor's address: Cloudflare's own header first (it cannot be set by the visitor), then the usual ones. */
export function clientIp(headers: Headers): string {
  return headers.get('cf-connecting-ip')?.trim()
    || headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || headers.get('x-real-ip')?.trim()
    || 'unknown';
}
