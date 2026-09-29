#!/bin/sh
# Entry point of the test container (Dockerfile.test / compose.test.yaml):
# builds, type-check, unit tests, Chromium e2e and Firefox e2e, one exit
# code. Run it with npm run test:docker from the host, not directly.
set -u
cd /work
mkdir -p "$HOME"

# node_modules lives in a named volume (Linux-native binaries, host's copy
# untouched); reinstall only when the lockfile changed.
LOCK_HASH=$(sha256sum package-lock.json | cut -d' ' -f1)
if [ "$(cat node_modules/.lock-hash 2>/dev/null)" != "$LOCK_HASH" ]; then
  npm ci --no-audit --no-fund || exit 1
  echo "$LOCK_HASH" > node_modules/.lock-hash
fi

status=0
step() {
  echo
  echo "=== $1"
  shift
  "$@" || { echo "=== FAILED: $*"; status=1; }
}

step "release builds" sh -c 'npm run -s build && npm run -s build:firefox'
step "e2e Firefox build" npm run -s build:e2e:firefox
step "release builds contain no e2e-only code" npm run -s check:release
step "type-check" npm run -s compile
step "unit tests" npm test
step "Chromium e2e" npm run -s test:e2e
step "Firefox e2e" npm run -s test:e2e:firefox

echo
[ "$status" -eq 0 ] && echo "=== all passed" || echo "=== some steps failed"
exit "$status"
