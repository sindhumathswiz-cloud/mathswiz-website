import dns from 'node:dns';
import net from 'node:net';

/**
 * The socket the database pool connects through, with a name lookup that recovers on its own.
 *
 * A dev server left running overnight on Windows stopped reaching the database: every query failed at once with
 * "Can't reach database server at aws-1-ap-south-1.pooler.supabase.com" (the driver's ENOTFOUND), while a freshly
 * started process reached it in half a second. The system lookup (getaddrinfo) in a long-running process can keep
 * failing after the computer sleeps or the network changes. When it does, the name is looked up again with a fresh
 * resolver -- which reads the DNS servers of the network the computer is on now -- and the connection goes to that
 * address; TLS still checks the database's own name (pg sets it from the host, not the socket).
 */

const LOOKUP_FAILURES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL', 'ESERVFAIL', 'ETIMEOUT', 'ECONNREFUSED']);

type LookupAddress = { address: string; family: number };
type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

let warned = 0;

export function resilientLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback): void {
  dns.lookup(hostname, options as dns.LookupOptions, (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => {
    if (!err || !LOOKUP_FAILURES.has(err.code ?? '')) return callback(err, address, family);
    new dns.Resolver().resolve4(hostname, (fallbackErr, addresses) => {
      if (fallbackErr || !addresses?.length) return callback(err, options.all ? [] : '', undefined);
      if (warned++ < 5) console.warn(`[db] system lookup of ${hostname} failed (${err.code}); reached it through a fresh resolver instead`);
      if (options.all) return callback(null, addresses.map((a) => ({ address: a, family: 4 })));
      callback(null, addresses[0], 4);
    });
  });
}

/** A socket for pg's `stream` option: pg calls connect(port, host), which goes through resilientLookup. */
export function databaseSocket(): net.Socket {
  const socket = new net.Socket();
  const connect = socket.connect.bind(socket) as (...args: unknown[]) => net.Socket;
  socket.connect = ((...args: unknown[]) =>
    typeof args[0] === 'number' && typeof args[1] === 'string'
      ? connect({ port: args[0], host: args[1], lookup: resilientLookup })
      : connect(...args)) as typeof socket.connect;
  return socket;
}
