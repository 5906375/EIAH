#!/usr/bin/env bash
# Run from repository root. Dedicated disposable database; no fallback to configured URLs.
set -euo pipefail

test -f packages/db/prisma.config.ts
test -f packages/db/src/p1RunTransitionPersistence.integration.test.ts
name="eiah_p1_transition_${RANDOM}_$$"
password="p1_ephemeral_local"
container_id=""
evidence_dir="$(mktemp -d /tmp/eiah-p1-transition-evidence.XXXXXX)"
echo "Registro local: $evidence_dir"
exec > >(tee "$evidence_dir/run.log") 2>&1
cleanup() {
  result=$?
  cleanup_ok=true
  if [ -n "$container_id" ]; then
    docker rm -fv "$container_id" >/dev/null 2>&1 || { cleanup_ok=false; result=1; }
  fi
  printf '{"exitCode":%s,"containerRemoved":%s,"sourceVerification":"not_demonstrated"}\n' \
    "$result" "$cleanup_ok" > "$evidence_dir/result.json"
  echo "Resultado e log: $evidence_dir"
  exit "$result"
}
trap cleanup EXIT
sha256sum packages/db/prisma/schema.prisma \
  packages/db/prisma/migrations/20260929170000_p1_run_transition_storage/migration.sql \
  packages/db/prisma/migrations/20260929180000_p1_transition_immutability/migration.sql \
  apps/api/src/services/p1RunTransitionPersistence.ts \
  packages/db/src/p1RunTransitionPersistence.integration.test.ts > "$evidence_dir/inputs.sha256"

container_id="$(docker run --pull=never --rm -d --name "$name" \
  -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=eiah_p1_migration \
  -p 127.0.0.1::5432 pgvector/pgvector:pg16)"
ready=0
for attempt in $(seq 1 30); do
  if docker exec "$name" pg_isready -h 127.0.0.1 -U postgres -d eiah_p1_migration >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
test "$ready" -eq 1 || { echo "PostgreSQL efêmero não iniciou"; exit 1; }
docker exec "$name" createdb -h 127.0.0.1 -U postgres eiah_p1_shadow
port="$(docker port "$name" 5432/tcp | sed -n 's/.*://p' | head -1)"
[[ "$port" =~ ^[0-9]+$ ]]
base="postgresql://postgres:${password}@127.0.0.1:${port}"
export DATABASE_URL="${base}/eiah_p1_migration"
export SHADOW_DATABASE_URL="${base}/eiah_p1_shadow"
export EIAH_P1_DB_TEST_URL="$DATABASE_URL"
export EIAH_P1_EPHEMERAL=1

pnpm --dir packages/db exec prisma validate
pnpm --dir packages/db exec prisma migrate deploy
pnpm --dir packages/db exec tsc --noEmit --target ES2024 --module ESNext \
  --moduleResolution Bundler --strict --esModuleInterop --skipLibCheck --types node \
  src/p1RunTransitionPersistence.integration.test.ts
pnpm --dir packages/db exec node --import tsx --test src/p1RunTransitionPersistence.integration.test.ts
