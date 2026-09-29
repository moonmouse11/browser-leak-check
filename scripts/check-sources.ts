import { HTTP_SOURCES, STUN_SOURCES } from '../lib/config';
import { CANDIDATE_SOURCES } from './candidates';
import {
  checkDnsSource,
  checkHttpSource,
  checkStunSource,
  detectConnectivity,
  exitCode,
  formatTable,
  type CheckRow,
} from './source-checks';

const USAGE = `usage: npm run check:sources -- [--candidates] [--json]

Checks every source in lib/config.ts the way the extension uses it:
  ip-echo services  CORS for an extension origin, response parses, ASN label matches
  stun servers      a STUN Binding Request gets an answer, per IP family
  bash.ws           the DNS-leak test-id endpoint answers with CORS

  --candidates  also check the IPv6-only candidates in scripts/candidates.ts
                (reported, but never affect the exit code)
  --json        print one JSON document instead of the table

Every checked service sees this machine's IP address.
Exit code 1 if any registry source failed.`;

const args = new Set(process.argv.slice(2));
if (args.has('--help') || args.has('-h')) {
  console.log(USAGE);
  process.exit(0);
}

const fetchImpl = globalThis.fetch as unknown as Parameters<typeof checkHttpSource>[1]['fetch'];
const connectivity = await detectConnectivity(fetchImpl);
if (!args.has('--json')) console.error('checking sources...');

const rows: CheckRow[] = (
  await Promise.all([
    ...HTTP_SOURCES.map((source) => checkHttpSource(source, { fetch: fetchImpl, connectivity }).then((row) => [row])),
    ...STUN_SOURCES.map((source) => checkStunSource(source, { connectivity })),
    checkDnsSource({ fetch: fetchImpl }).then((row) => [row]),
    ...(args.has('--candidates')
      ? CANDIDATE_SOURCES.map((source) =>
          checkHttpSource(source, { fetch: fetchImpl, connectivity, candidate: true }).then((row) => [row]),
        )
      : []),
  ])
).flat();

console.log(args.has('--json') ? JSON.stringify({ connectivity, rows }, null, 2) : formatTable(rows, connectivity));
process.exit(exitCode(rows));
