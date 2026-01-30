#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.dev.yml"
OUT=""
NO_DOCKER=0
WITH_DOCKER_LOGS=0

usage() {
  cat <<'TXT'
Usage: scripts/collect-environment.sh [options]

Collects a diagnostic snapshot (redacted) of the local dev environment.

Options:
  --out <file>           Write output to a file (default: stdout)
  --project-root <dir>   Project root (default: auto-detected)
  --compose-file <file>  docker compose file (default: docker-compose.dev.yml)
  --no-docker            Skip Docker checks
  --with-docker-logs     Include a short tail of service logs (may still contain secrets)
  -h, --help             Show help
TXT
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)
      OUT="${2:-}"
      shift 2
      ;;
    --project-root)
      PROJECT_ROOT="${2:-}"
      shift 2
      ;;
    --compose-file)
      COMPOSE_FILE="${2:-}"
      shift 2
      ;;
    --no-docker)
      NO_DOCKER=1
      shift
      ;;
    --with-docker-logs)
      WITH_DOCKER_LOGS=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -n "$OUT" ]]; then
  mkdir -p "$(dirname "$OUT")"
  : >"$OUT"
fi

has_cmd() { command -v "$1" >/dev/null 2>&1; }

redact_stream() {
  # Best-effort redaction for common secrets and credentialed URLs.
  sed -E \
    -e 's/(Authorization:[[:space:]]*Bearer[[:space:]]+)[^[:space:]]+/\1[REDACTED]/g' \
    -e 's/([A-Za-z0-9_]*(TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY)[A-Za-z0-9_]*=).*/\1[REDACTED]/g' \
    -e 's#(postgres(ql)?://)[^/@:]+(:[^@/]+)?@#\1[REDACTED]@#g' \
    -e 's#(redis(s)?://)[^/@:]+(:[^@/]+)?@#\1[REDACTED]@#g' \
    -e 's#(mysql://)[^/@:]+(:[^@/]+)?@#\1[REDACTED]@#g' \
    -e 's#(mongodb(\+srv)?://)[^/@:]+(:[^@/]+)?@#\1[REDACTED]@#g'
}

emit() {
  if [[ -n "$OUT" ]]; then
    printf "%s\n" "$*" | redact_stream >>"$OUT"
  else
    printf "%s\n" "$*" | redact_stream
  fi
}

section() {
  emit ""
  emit "## $1"
}

run_cmd() {
  local title="$1"
  shift
  local cmd="$*"
  section "$title"
  emit "\$ $cmd"
  local output=""
  if output="$(bash -lc "$cmd" 2>&1)"; then
    emit "$output"
  else
    emit "(!) command failed"
    emit "$output"
  fi
}

env_presence() {
  local name="$1"
  if [[ -n "${!name:-}" ]]; then
    emit "$name=set"
  else
    emit "$name=unset"
  fi
}

env_value_redacted() {
  local name="$1"
  if [[ -n "${!name:-}" ]]; then
    emit "$name=${!name}"
  else
    emit "$name=unset"
  fi
}

emit "# Environment snapshot (redacted)"
emit "timestamp=$(date -Is 2>/dev/null || date)"
emit "project_root=$PROJECT_ROOT"

run_cmd "Repo" "cd \"$PROJECT_ROOT\" && pwd && ls"

if has_cmd git; then
  run_cmd "Git" "cd \"$PROJECT_ROOT\" && git rev-parse --is-inside-work-tree >/dev/null 2>&1 && (git status --porcelain -b; git log -1 --oneline; git rev-parse HEAD) || echo 'not a git repo'"
else
  section "Git"
  emit "git not found"
fi

run_cmd "System" "uname -a || true; (test -f /etc/os-release && cat /etc/os-release) || true"

section "Runtime"
for cmd in node npm pnpm corepack; do
  if has_cmd "$cmd"; then
    run_cmd "$cmd" "$cmd --version 2>/dev/null || $cmd -v"
  else
    emit "$cmd=not_found"
  fi
done

section "Env (safe subset)"
env_presence "NODE_ENV"
env_presence "PORT"
env_value_redacted "NEXT_PUBLIC_API_URL"
env_presence "ADMIN_API_TOKEN"
env_value_redacted "DATABASE_URL"
env_value_redacted "REDIS_URL"
env_value_redacted "BULLMQ_REDIS_URL"
env_value_redacted "RUN_QUEUE_REDIS_URL"
env_value_redacted "ACTION_QUEUE_REDIS_URL"
env_value_redacted "QUEUE_REDIS_URL"

run_cmd "HTTP health" "curl -sS -o /dev/null -w 'api_health_http=%{http_code}\\n' http://127.0.0.1:8080/api/health || true"

if [[ "$NO_DOCKER" -eq 1 ]]; then
  section "Docker"
  emit "skipped (--no-docker)"
else
  if has_cmd docker; then
    run_cmd "Docker version" "docker version"
    run_cmd "Docker compose version" "docker compose version || docker-compose version || true"

    if [[ -f "$COMPOSE_FILE" ]]; then
      run_cmd "Docker compose ps" "cd \"$PROJECT_ROOT\" && docker compose -f \"$COMPOSE_FILE\" ps || true"
      run_cmd "Docker compose health (queues)" "curl -sS -o /dev/null -w 'queues_health_http=%{http_code}\\n' http://127.0.0.1:8080/health/queues || true"

      run_cmd "DB quick checks" "cd \"$PROJECT_ROOT\" && docker compose -f \"$COMPOSE_FILE\" exec -T eiah-postgres psql -U postgres -d eiah_builder -Atc \"select 'migration', count(*) from _prisma_migrations union all select 'tenants', count(*) from tenants union all select 'workspaces', count(*) from workspaces union all select 'api_tokens', count(*) from api_tokens;\" || true"

      if [[ "$WITH_DOCKER_LOGS" -eq 1 ]]; then
        run_cmd "Docker logs (tail)" "cd \"$PROJECT_ROOT\" && docker compose -f \"$COMPOSE_FILE\" logs --tail 200 api action-runner maintenance-worker 2>/dev/null || true"
      fi
    else
      section "Docker compose"
      emit "compose file not found: $COMPOSE_FILE"
    fi
  else
    section "Docker"
    emit "docker not found"
  fi
fi

section "Done"
emit "ok"
