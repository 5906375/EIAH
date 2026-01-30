#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../.."

LOCK_DIR=".tmp"
LOCK_FILE="$LOCK_DIR/prisma-generate.lock"

mkdir -p "$LOCK_DIR"

if command -v flock >/dev/null 2>&1; then
  (
    flock 9
    pnpm --filter @apps/api prisma:generate >/dev/null
  ) 9>"$LOCK_FILE"
else
  pnpm --filter @apps/api prisma:generate >/dev/null
fi
