// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { startEchoServer, type EchoServer } from './echo-server';

let server: EchoServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe('echo server', () => {
  it('answers with the caller address and CORS, like a real IP-echo source', async () => {
    server = await startEchoServer(0);

    const response = await fetch(server.url);

    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect((await response.text()).trim()).toBe('127.0.0.1');
  });

  it('records the headers of each request, and serves them on /__log', async () => {
    server = await startEchoServer(0);

    await fetch(server.url, { headers: { Origin: 'moz-extension://example' } });
    const log = await (await fetch(`${server.url}__log`)).json();

    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]!.headers.origin).toBe('moz-extension://example');
    expect(log).toEqual(JSON.parse(JSON.stringify(server.requests)));
  });
});
