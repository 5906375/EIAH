#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../.."

if ! command -v corepack >/dev/null 2>&1; then
  npm install -g corepack >/dev/null 2>&1 || true
fi

corepack enable
pnpm config set store-dir /pnpm/store >/dev/null
export CI=${CI:-true}

if [ ! -d node_modules/.pnpm ]; then
  pnpm install --frozen-lockfile=false
fi

pnpm --filter @eiah/web dev --host 0.0.0.0 --port 5173 --strict-port
