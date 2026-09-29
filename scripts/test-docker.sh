#!/bin/sh
# npm run test:docker - builds the test image if needed and runs
# scripts/docker-test.sh in it. See README "Running tests in Docker".
set -eu

# Files the container writes through the bind mount (build output,
# test-results) must end up owned by the host user:
# - rootless Docker maps container root to the host user, so run as root;
# - rootful Docker maps uids 1:1, so run as the host user's uid.
if docker info --format '{{json .SecurityOptions}}' 2>/dev/null | grep -q rootless; then
  HOST_UID=0 HOST_GID=0
else
  HOST_UID=$(id -u) HOST_GID=$(id -g)
fi
export HOST_UID HOST_GID

exec docker compose -f compose.test.yaml run --rm --build test "$@"
