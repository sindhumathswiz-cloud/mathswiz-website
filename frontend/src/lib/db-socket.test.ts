import dns from 'node:dns';
import net from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { databaseSocket, resilientLookup } from './db-socket';

const lookupError = (code: string) => Object.assign(new Error(`getaddrinfo ${code} db.example.com`), { code });

function lookup(options: dns.LookupOptions) {
  return new Promise<{ err: NodeJS.ErrnoException | null; address: unknown; family?: number }>((resolve) =>
    resilientLookup('db.example.com', options, (err, address, family) => resolve({ err, address, family })),
  );
}

afterEach(() => vi.restoreAllMocks());

describe('resilientLookup', () => {
  it('passes a working system lookup straight through, without asking another resolver', async () => {
    vi.spyOn(dns, 'lookup').mockImplementation(((_h: string, _o: unknown, cb: (...a: unknown[]) => void) => cb(null, '10.0.0.1', 4)) as never);
    const resolve4 = vi.spyOn(dns.Resolver.prototype, 'resolve4');
    expect(await lookup({})).toEqual({ err: null, address: '10.0.0.1', family: 4 });
    expect(resolve4).not.toHaveBeenCalled();
  });

  it('falls back to a fresh resolver when the system lookup fails with ENOTFOUND', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(dns, 'lookup').mockImplementation(((_h: string, _o: unknown, cb: (...a: unknown[]) => void) => cb(lookupError('ENOTFOUND'))) as never);
    vi.spyOn(dns.Resolver.prototype, 'resolve4').mockImplementation(((_h: string, cb: (...a: unknown[]) => void) => cb(null, ['10.0.0.2', '10.0.0.3'])) as never);
    expect(await lookup({})).toEqual({ err: null, address: '10.0.0.2', family: 4 });
    expect(await lookup({ all: true })).toEqual({ err: null, address: [{ address: '10.0.0.2', family: 4 }, { address: '10.0.0.3', family: 4 }], family: undefined });
  });

  it('reports the original lookup error when the fresh resolver fails too', async () => {
    vi.spyOn(dns, 'lookup').mockImplementation(((_h: string, _o: unknown, cb: (...a: unknown[]) => void) => cb(lookupError('EAI_AGAIN'))) as never);
    vi.spyOn(dns.Resolver.prototype, 'resolve4').mockImplementation(((_h: string, cb: (...a: unknown[]) => void) => cb(lookupError('ESERVFAIL'))) as never);
    const { err } = await lookup({});
    expect(err?.code).toBe('EAI_AGAIN');
  });

  it('does not retry an error that is not a failed lookup', async () => {
    vi.spyOn(dns, 'lookup').mockImplementation(((_h: string, _o: unknown, cb: (...a: unknown[]) => void) => cb(lookupError('EINVAL'))) as never);
    const resolve4 = vi.spyOn(dns.Resolver.prototype, 'resolve4');
    expect((await lookup({})).err?.code).toBe('EINVAL');
    expect(resolve4).not.toHaveBeenCalled();
  });
});

describe('databaseSocket', () => {
  it("turns pg's connect(port, host) into a connect that looks the host up through resilientLookup", () => {
    const connect = vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(function (this: net.Socket) { return this; } as never);
    databaseSocket().connect(6543, 'db.example.com');
    expect(connect).toHaveBeenCalledWith({ port: 6543, host: 'db.example.com', lookup: resilientLookup });
  });

  it('leaves any other form of connect alone', () => {
    const connect = vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(function (this: net.Socket) { return this; } as never);
    databaseSocket().connect({ path: '/tmp/.s.PGSQL.5432' });
    expect(connect).toHaveBeenCalledWith({ path: '/tmp/.s.PGSQL.5432' });
  });
});
