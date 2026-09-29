import type { CheckResults } from './checks';
import { networkOwner, sourceName } from './format';
import { classifyAgreement, normalizeIp, type IpFamily } from './ip-sources';

// One row of the report's per-source table.
export interface SourceRow {
  sourceId: string;
  name: string;
  kind: 'http' | 'stun';
  state: 'ok' | 'failed';
  address: string;
  // What the service itself reported - never attributed from another source.
  owner: string;
  // Whether this source's address is its family's majority address; empty
  // when the source produced no address.
  match: 'yes' | 'no' | '';
}

export function sourceRows(results: CheckResults): SourceRow[] {
  const majority: Record<IpFamily, string | undefined> = {
    v4: classifyAgreement(results.http, 'v4').majority,
    v6: classifyAgreement(results.http, 'v6').majority,
  };
  const matches = (address: string) => {
    const ip = normalizeIp(address);
    return ip !== null && majority[ip.family] === ip.address;
  };

  const httpRows: SourceRow[] = results.http.map((result) =>
    result.status === 'ok'
      ? {
          sourceId: result.sourceId,
          name: sourceName(result.sourceId),
          kind: 'http',
          state: 'ok',
          address: result.address,
          owner: networkOwner(result.asn, result.org),
          match: matches(result.address) ? 'yes' : 'no',
        }
      : {
          sourceId: result.sourceId,
          name: sourceName(result.sourceId),
          kind: 'http',
          state: 'failed',
          address: `failed (${result.reason})`,
          owner: '',
          match: '',
        },
  );

  const stunRows: SourceRow[] = results.webrtc.servers.map((server) => ({
    sourceId: server.serverId,
    name: sourceName(server.serverId),
    kind: 'stun',
    state: server.status === 'ok' ? 'ok' : 'failed',
    address: server.status === 'ok' ? server.addresses.join(', ') : server.status.replace('-', ' '),
    owner: '',
    match: server.status !== 'ok' ? '' : server.addresses.every(matches) ? 'yes' : 'no',
  }));

  return [...httpRows, ...stunRows];
}
