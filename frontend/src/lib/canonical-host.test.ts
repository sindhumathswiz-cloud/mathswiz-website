import { describe, expect, it } from 'vitest';
import { canonicalRedirect, clientIp } from './canonical-host';

const WWW = 'www.sindhusmathswizclasses.com';
const req = (url: string, headers: Record<string, string> = {}) => [new URL(url), new Headers(headers)] as const;

describe('canonicalRedirect', () => {
  it('sends the bare domain to https://www, keeping the path and query', () => {
    const [url, headers] = req('http://localhost:3000/student/smartbook?page=4', { host: 'sindhusmathswizclasses.com', 'x-forwarded-proto': 'https' });
    expect(canonicalRedirect(url, headers, WWW)).toBe('https://www.sindhusmathswizclasses.com/student/smartbook?page=4');
  });

  it('sends plain http on www to https', () => {
    const [url, headers] = req('http://localhost:3000/login', { host: WWW, 'x-forwarded-proto': 'http' });
    expect(canonicalRedirect(url, headers, WWW)).toBe('https://www.sindhusmathswizclasses.com/login');
  });

  it('leaves https on www alone', () => {
    const [url, headers] = req('http://localhost:3000/', { host: WWW, 'x-forwarded-proto': 'https' });
    expect(canonicalRedirect(url, headers, WWW)).toBeNull();
  });

  it('leaves localhost, the LAN address and staging alone, and does nothing without CANONICAL_HOST', () => {
    for (const host of ['localhost:3000', '192.168.1.39:3000', 'localhost:3200']) {
      const [url, headers] = req(`http://${host}/`, { host });
      expect(canonicalRedirect(url, headers, WWW)).toBeNull();
    }
    const [url, headers] = req('http://localhost:3000/', { host: 'sindhusmathswizclasses.com', 'x-forwarded-proto': 'http' });
    expect(canonicalRedirect(url, headers, undefined)).toBeNull();
    expect(canonicalRedirect(url, headers, '  ')).toBeNull();
  });
});

describe('clientIp', () => {
  it("prefers Cloudflare's visitor address over a forwarded chain the visitor could have started", () => {
    expect(clientIp(new Headers({ 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '1.2.3.4, 203.0.113.9' }))).toBe('203.0.113.9');
    expect(clientIp(new Headers({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1' }))).toBe('198.51.100.7');
    expect(clientIp(new Headers())).toBe('unknown');
  });
});
