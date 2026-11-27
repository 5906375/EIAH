#!/usr/bin/env bash
# Executa "$@" com env LIMPO (sem DATABASE_URL/REDIS_URL herdados), apontando só para a infra descartável desta tarefa.
# Antes de executar valida, por parser, as URLs (host/porta/banco/usuário/autenticação) e confirma no servidor que o alvo é o
# da infra: PostgreSQL (banco|porta|data_directory|usuário) e Redis (INFO server: process_id == redis.pid, tcp_port).
set -euo pipefail
S=/tmp/claude-1000/-home-jusall-projects-EIAH-IMOB-ASSET-DESTINATION/8af490ba-6ed0-479d-87b1-c55dc224b216/scratchpad
INFRA=$(cat "$S/INFRA_DIR.txt")
case "$INFRA" in "$S"/infra-eval-*) ;; *) echo "INFRA inválida" >&2; exit 20 ;; esac
[ "$(stat -c %a "$INFRA/resources.env")" = "600" ] || { echo "resources.env sem 0600" >&2; exit 21; }
get() { local v; v=$(grep "^$1=" "$INFRA/resources.env" | cut -d= -f2-); [ -n "$v" ] || { echo "chave ausente: $1" >&2; exit 25; }; printf '%s' "$v"; }
DATABASE_URL=$(get DATABASE_URL); ADMIN_DATABASE_URL=$(get ADMIN_DATABASE_URL); REDIS_URL=$(get REDIS_URL)
PG_PORT=$(get PG_PORT); PG_DB=$(get PG_DB); REDIS_PORT=$(get REDIS_PORT)

# 1. Parser das três URLs (sem imprimir credenciais)
python3 - "$DATABASE_URL" "$ADMIN_DATABASE_URL" "$REDIS_URL" "$PG_PORT" "$PG_DB" "$REDIS_PORT" <<'PY'
import sys, urllib.parse as u
app, admin, redis, pgport, db, rport = sys.argv[1:7]
def pg(url, user):
    x = u.urlparse(url)
    assert x.scheme in ("postgresql", "postgres"), "esquema pg"
    assert x.hostname == "127.0.0.1", "host pg"
    assert str(x.port) == pgport, "porta pg"
    assert x.path == "/" + db, "banco"
    assert x.username == user, "usuário pg esperado " + user
    assert x.password, "senha pg ausente"
    assert not x.query, "query inesperada"
pg(app, "eiah_eval_app"); pg(admin, "eiah_disp_admin")
assert db.startswith("eiah_logistica_core_evaldisp_"), "prefixo do banco descartável"
r = u.urlparse(redis)
assert r.scheme == "redis", "esquema redis"
assert r.hostname == "127.0.0.1", "host redis"
assert str(r.port) == rport, "porta redis"
assert r.password, "redis sem autenticação"
assert (r.path or "") in ("", "/"), "db redis inesperado"
PY

# 2. PostgreSQL: processo, porta e identidade confirmados no servidor, depois de validar a URL
PG="$INFRA/pg/bin"
PMPID=$(sed -n 1p "$INFRA/data/pg/postmaster.pid")
[ "$(readlink -f /proc/$PMPID/exe)" = "$(readlink -f "$PG/postgres")" ] || { echo "postmaster não é o da infra" >&2; exit 22; }
[ "$(sed -n 4p "$INFRA/data/pg/postmaster.pid")" = "$PG_PORT" ] || { echo "porta do postmaster.pid diverge" >&2; exit 22; }
GUARD=$("$PG/psql" "$ADMIN_DATABASE_URL" -X -q -At -F'|' -c "select current_user, current_database(), inet_server_port(), current_setting('data_directory')")
[ "$GUARD" = "eiah_disp_admin|$PG_DB|$PG_PORT|$INFRA/data/pg" ] || { echo "guard PG falhou (usuário|banco|porta|data_directory divergem)" >&2; exit 23; }
APPG=$("$PG/psql" "$DATABASE_URL" -X -q -At -F'|' -c "select current_user, current_database(), inet_server_port()")
[ "$APPG" = "eiah_eval_app|$PG_DB|$PG_PORT" ] || { echo "guard PG (usuário de aplicação) falhou" >&2; exit 23; }

# 3. Redis: autenticado e o PID do servidor conectado == redis.pid
RPID=$(tr -d '[:space:]' < "$INFRA/redis.pid")
[ "$(readlink -f /proc/$RPID/exe)" = "$(readlink -f "$INFRA/redis/bin/redis-server")" ] || { echo "Redis (redis.pid) não é o da infra" >&2; exit 24; }
# senha extraída da REDIS_URL pelo parser e passada por REDISCLI_AUTH (não por argv); a URL (":senha@") é a mesma dos clientes
REDIS_PW=$(python3 -c 'import sys,urllib.parse as u; print(u.urlparse(sys.argv[1]).password or "", end="")' "$REDIS_URL")
INFO=$(REDISCLI_AUTH="$REDIS_PW" "$INFRA/redis/bin/redis-cli" -h 127.0.0.1 -p "$REDIS_PORT" INFO server | tr -d '\r')
INFO_PID=$(printf '%s\n' "$INFO" | sed -n 's/^process_id://p'); INFO_PORT=$(printf '%s\n' "$INFO" | sed -n 's/^tcp_port://p')
[ "$INFO_PID" = "$RPID" ] && [ "$INFO_PORT" = "$REDIS_PORT" ] || { echo "Redis conectado diverge de redis.pid/porta (INFO pid=$INFO_PID porta=$INFO_PORT)" >&2; exit 24; }
# sem credencial a conexão deve ser recusada (prova de autenticação ativa)
if "$INFRA/redis/bin/redis-cli" -h 127.0.0.1 -p "$REDIS_PORT" PING 2>&1 | grep -q PONG; then echo "Redis aceita conexão sem senha" >&2; exit 24; fi

echo "[guard] alvo descartável confirmado: banco=$PG_DB pg_porta=$PG_PORT redis_porta=$REDIS_PORT redis_pid=$RPID" >&2
exec env -i PATH="$PATH" HOME="$HOME" TZ="${TZ_OVERRIDE:-UTC}" LANG=C.UTF-8 \
  DATABASE_URL="$DATABASE_URL" REDIS_URL="$REDIS_URL" EIAH_DISPOSABLE_INFRA=1 \
  "$@"
