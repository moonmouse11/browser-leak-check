import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Fails if anything from the e2e-only echo source (lib/extra-sources.e2e.ts)
// made it into a release build under .output/. E2E builds belong in
// .output-e2e/ - see wxt.config.ts.
const RELEASE_DIR = process.argv[2] ?? '.output';
const MARKERS = ['e2e-echo', 'WXT_E2E_ECHO_URL', 'extra-sources.e2e'];

if (!existsSync(RELEASE_DIR)) {
  console.error(`${RELEASE_DIR}/ not found - run npm run build first`);
  process.exit(1);
}

const offenders = readdirSync(RELEASE_DIR, { recursive: true, encoding: 'utf8' })
  .map((file) => join(RELEASE_DIR, file))
  .filter((file) => /\.(js|json|html|css|map)$/.test(file))
  .flatMap((file) => {
    const content = readFileSync(file, 'utf8');
    return MARKERS.filter((marker) => content.includes(marker)).map((marker) => `${file}: ${marker}`);
  });

if (offenders.length > 0) {
  console.error(`e2e-only code found in ${RELEASE_DIR}/:\n  ${offenders.join('\n  ')}`);
  process.exit(1);
}
console.log(`${RELEASE_DIR}/ contains no e2e-only code`);
