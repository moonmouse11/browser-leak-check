import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';

// The e2e build's test-only IP-echo source (lib/extra-sources.e2e.ts): it
// answers like a real one - the caller's address as plain text, with CORS
// - and remembers every request's headers so the suite can check what the
// browser actually sent.

export interface LoggedRequest {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
}

export interface EchoServer {
  url: string;
  requests: LoggedRequest[];
  close(): Promise<void>;
}

export async function startEchoServer(port = 8787, host = '127.0.0.1'): Promise<EchoServer> {
  const requests: LoggedRequest[] = [];

  const server = createServer((request, response) => {
    if (request.url === '/__log') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(requests));
      return;
    }

    requests.push({ method: request.method ?? '', path: request.url ?? '', headers: request.headers });
    // IPv4-mapped IPv6 ("::ffff:127.0.0.1") isn't a bare address the
    // extension's parser would accept.
    const address = (request.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
    response.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' });
    response.end(`${address}\n`);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  const { port: boundPort } = server.address() as AddressInfo;
  return {
    url: `http://${host}:${boundPort}/`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
