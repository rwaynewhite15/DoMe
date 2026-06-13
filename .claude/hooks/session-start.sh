#!/bin/bash
# Install dependencies at the start of Claude Code on the web sessions, so the
# project can build, lint, and run scripts immediately. Containers are ephemeral
# and start without node_modules; without this, `next build`/`eslint` fail.
set -euo pipefail

# Only needed in the remote (web) environment; local machines manage their own.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Idempotent: a no-op when node_modules is already populated from the cache.
# `postinstall` regenerates the Prisma client; we also run it explicitly so the
# client exists even if install scripts were skipped.
npm install --no-audit --no-fund
npx prisma generate
