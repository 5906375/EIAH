#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../.."

if ! command -v corepack >/dev/null 2>&1; then
  npm install -g corepack >/dev/null 2>&1 || true
fi

corepack enable
pnpm config set store-dir /pnpm/store
export CI=${CI:-true}

if [ ! -d node_modules/.pnpm ]; then
  pnpm install --frozen-lockfile=false
fi

./scripts/dev/prisma-generate.sh
pnpm --filter @workers/action-runner dev
