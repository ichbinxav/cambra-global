export const PUBLIC_HTTP_EGRESS_VERSION = 'public-http-egress-1.0.0';

export class PublicHttpEgressError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 422) {
    super(code);
    this.name = 'PublicHttpEgressError';
    this.code = code;
    this.status = status;
  }
}

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

function ipv4Parts(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length !== 4 || parts.some((x) => !/^\d{1,3}$/.test(x))) return null;
  const nums = parts.map(Number);
  return nums.every((x) => x >= 0 && x <= 255) ? nums : null;
}

export function isPublicIpAddress(raw: unknown): boolean {
  const host = String(raw ?? '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  const v4 = ipv4Parts(host);
  if (v4) {
    const [a, b, c] = v4;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0 && c === 0) return false;
    if (a === 192 && b === 0 && c === 2) return false;
    if (a === 192 && b === 88 && c === 99) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  if (!host.includes(':')) return false;
  if (host === '::' || host === '::1') return false;
  if (/^(fc|fd)/.test(host) || /^fe[89ab]/.test(host) || /^ff/.test(host)) return false;
  if (/^2001:db8(?::|$)/.test(host)) return false;
  const mapped = host.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicIpAddress(mapped[1]);
  // Publicly routable IPv6 is currently global unicast 2000::/3.
  return /^[23]/.test(host);
}

export function normalizePublicHttpsUrl(raw: unknown, base?: string): URL {
  const value = String(raw ?? '').trim();
  if (!value) throw new PublicHttpEgressError('public_url_required', 400);
  let url: URL;
  try {
    const candidate = base ? new URL(value, base) : new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`,
    );
    url = candidate;
  } catch {
    throw new PublicHttpEgressError('public_url_invalid', 400);
  }
  if (url.protocol !== 'https:') throw new PublicHttpEgressError('public_url_https_required');
  if (url.username || url.password) throw new PublicHttpEgressError('public_url_credentials_forbidden');
  // Infrastructure discovery needs a public document, never a personalized or
  // signed URL. Query strings and fragments commonly carry email addresses,
  // session identifiers, API keys, or reset tokens; reject them before DNS,
  // transport, persistence, and logging instead of trying to redact selectively.
  if (url.search || url.hash) {
    throw new PublicHttpEgressError(
      'public_url_query_or_fragment_forbidden',
      422,
    );
  }
  if (url.port && url.port !== '443') throw new PublicHttpEgressError('public_url_port_forbidden');
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new PublicHttpEgressError('public_url_hostname_forbidden');
  }
  if ((ipv4Parts(hostname) || hostname.includes(':')) && !isPublicIpAddress(hostname)) {
    throw new PublicHttpEgressError('public_url_private_address_forbidden');
  }
  return url;
}

export async function defaultPublicDnsResolver(hostname: string): Promise<string[]> {
  if (ipv4Parts(hostname) || hostname.includes(':')) return [hostname];
  const resolveDns = (Deno as any).resolveDns;
  if (typeof resolveDns !== 'function') {
    throw new PublicHttpEgressError('public_dns_unavailable', 503);
  }
  const answers = await Promise.allSettled([
    resolveDns(hostname, 'A'),
    resolveDns(hostname, 'AAAA'),
  ]);
  const addresses = answers.flatMap((row) => row.status === 'fulfilled' ? row.value : []);
  if (!addresses.length) throw new PublicHttpEgressError('public_dns_unavailable', 503);
  return addresses;
}

export async function assertPublicDns(
  url: URL,
  resolver: (hostname: string) => Promise<string[]> = defaultPublicDnsResolver,
) {
  let addresses: string[];
  try {
    addresses = await resolver(url.hostname.replace(/^\[|\]$/g, ''));
  } catch (error) {
    if (error instanceof PublicHttpEgressError) throw error;
    throw new PublicHttpEgressError('public_dns_unavailable', 503);
  }
  if (!addresses.length || addresses.some((address) => !isPublicIpAddress(address))) {
    throw new PublicHttpEgressError('public_dns_private_or_ambiguous');
  }
  return addresses;
}

export async function fetchPublicHttps(
  raw: unknown,
  init: RequestInit = {},
  deps: {
    fetchImpl?: typeof fetch;
    resolver?: (hostname: string) => Promise<string[]>;
    maxRedirects?: number;
  } = {},
) {
  const fetchImpl = deps.fetchImpl || fetch;
  const resolver = deps.resolver || defaultPublicDnsResolver;
  const maxRedirects = Math.max(0, Math.min(Number(deps.maxRedirects ?? 4), 8));
  let url = normalizePublicHttpsUrl(raw);
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await assertPublicDns(url, resolver);
    const response = await fetchImpl(url.toString(), { ...init, redirect: 'manual' });
    if (!REDIRECT_CODES.has(response.status)) return { response, finalUrl: url.toString(), redirectCount: hop };
    const location = response.headers.get('location');
    if (!location) throw new PublicHttpEgressError('public_redirect_location_required');
    if (hop === maxRedirects) throw new PublicHttpEgressError('public_redirect_limit_exceeded');
    url = normalizePublicHttpsUrl(location, url.toString());
  }
  throw new PublicHttpEgressError('public_redirect_limit_exceeded');
}
