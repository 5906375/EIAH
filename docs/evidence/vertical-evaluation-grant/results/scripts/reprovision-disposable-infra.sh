#!/usr/bin/env bash
# Recria a infra descartável DESTA tarefa (dados e credenciais foram removidos na limpeza anterior), reutilizando os binários
# compilados. Para em qualquer falha informando a etapa e os recursos parcialmente criados. Não aplica migrations.
set -euo pipefail
umask 077
S=/tmp/claude-1000/-home-jusall-projects-EIAH-IMOB-ASSET-DESTINATION/8af490ba-6ed0-479d-87b1-c55dc224b216/scratchpad
STEP="0-origem"; CREATED=()
trap 'echo "FALHA na etapa: $STEP | recursos parcialmente criados: ${CREATED[*]:-nenhum} | nada removido" >&2' ERR

INFRA=$(cat "$S/INFRA_DIR.txt")
case "$INFRA" in "$S"/infra-eval-*) ;; *) echo "INFRA fora do scratchpad" >&2; exit 10 ;; esac
PG="$INFRA/pg/bin"; RD="$INFRA/redis/bin"
[ -x "$PG/postgres" ] && [ -x "$PG/initdb" ] && [ -x "$RD/redis-server" ] && [ -x "$RD/redis-cli" ]
[ ! -e "$INFRA/data/pg" ] && [ ! -e "$INFRA/data/redis" ] && [ ! -e "$INFRA/resources.env" ] && [ ! -e "$INFRA/redis.pid" ]
. "$INFRA/pgport.env"                                  # PGPORT
REDIS_PORT=56379
for port in "$PGPORT" "$REDIS_PORT"; do ! ss -ltn | grep -q ":$port " || { echo "porta $port ocupada" >&2; exit 11; }; done
mkdir -p "$INFRA/data/redis"; CREATED+=("dir:data/redis")

# ── PostgreSQL ───────────────────────────────────────────────────────────────────────────────────────────────────
STEP="1-initdb"
ADMIN_PW=$(head -c 24 /dev/urandom | base64 | tr -d '/+=')
PWFILE="$INFRA/pgpw2.tmp"; printf '%s' "$ADMIN_PW" > "$PWFILE"
"$PG/initdb" -D "$INFRA/data/pg" -U eiah_disp_admin --auth=scram-sha-256 --pwfile="$PWFILE" -E UTF8 --locale=C.UTF-8 > "$INFRA/logs/pg-initdb2.log" 2>&1
shred -u "$PWFILE"; CREATED+=("pgdata")
STEP="2-start-pg"
"$PG/pg_ctl" -D "$INFRA/data/pg" -l "$INFRA/logs/pg-server3.log" -o "-p $PGPORT -c listen_addresses=127.0.0.1 -c unix_socket_directories= -c max_connections=100" -w start > "$INFRA/logs/pg-start3.out" 2>&1
CREATED+=("postgres:$PGPORT")
[ "$(sed -n 4p "$INFRA/data/pg/postmaster.pid")" = "$PGPORT" ]
[ "$(readlink -f /proc/$(sed -n 1p "$INFRA/data/pg/postmaster.pid")/exe)" = "$(readlink -f "$PG/postgres")" ]
psql_admin() { PGPASSWORD="$ADMIN_PW" "$PG/psql" -h 127.0.0.1 -p "$PGPORT" -U eiah_disp_admin -v ON_ERROR_STOP=1 -X -q -At "$@"; }
STEP="3-role-banco-extensao"
APP_PW=$(head -c 24 /dev/urandom | base64 | tr -d '/+=')
DBNAME="eiah_logistica_core_evaldisp_$(head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n')"
[[ "$DBNAME" =~ ^eiah_logistica_core_evaldisp_[0-9a-f]{8}$ ]]
psql_admin -d postgres -c "CREATE ROLE eiah_eval_app LOGIN PASSWORD '$APP_PW' NOSUPERUSER NOCREATEDB NOCREATEROLE"; CREATED+=("role")
psql_admin -d postgres -c "CREATE DATABASE $DBNAME OWNER eiah_eval_app"; CREATED+=("db:$DBNAME")
psql_admin -d "$DBNAME" -c "CREATE EXTENSION IF NOT EXISTS vector"
[ "$(psql_admin -d "$DBNAME" -c "select extversion from pg_extension where extname='vector'")" = "0.8.0" ]
CHECK=$(PGPASSWORD="$APP_PW" "$PG/psql" "postgresql://eiah_eval_app@127.0.0.1:$PGPORT/$DBNAME" -X -q -At -F'|' -c "select current_user, current_database(), inet_server_port()")
[ "$CHECK" = "eiah_eval_app|$DBNAME|$PGPORT" ]

# ── Redis (autenticado, sem persistência) ────────────────────────────────────────────────────────────────────────
STEP="4-redis"
RPW=$(head -c 24 /dev/urandom | base64 | tr -d '/+=')
"$RD/redis-server" --bind 127.0.0.1 --port "$REDIS_PORT" --requirepass "$RPW" --save "" --appendonly no --dir "$INFRA/data/redis" \
  --daemonize yes --pidfile "$INFRA/redis.pid" --logfile "$INFRA/logs/redis-server3.log" > "$INFRA/logs/redis-start3.out" 2>&1
CREATED+=("redis:$REDIS_PORT")
for _ in $(seq 1 50); do [ -s "$INFRA/redis.pid" ] && break; sleep 0.1; done
[ "$(readlink -f /proc/$(tr -d '[:space:]' < "$INFRA/redis.pid")/exe)" = "$(readlink -f "$RD/redis-server")" ]
[ "$(REDISCLI_AUTH="$RPW" "$RD/redis-cli" -h 127.0.0.1 -p "$REDIS_PORT" PING)" = "PONG" ]

# ── resources.env (0600), só depois de tudo validado ─────────────────────────────────────────────────────────────
STEP="5-resources-env"
{
  echo "REDIS_PORT=$REDIS_PORT"; echo "REDIS_PASSWORD=$RPW"; echo "PG_PORT=$PGPORT"; echo "PG_DB=$DBNAME"
  echo "DATABASE_URL=postgresql://eiah_eval_app:$APP_PW@127.0.0.1:$PGPORT/$DBNAME"
  echo "ADMIN_DATABASE_URL=postgresql://eiah_disp_admin:$ADMIN_PW@127.0.0.1:$PGPORT/$DBNAME"
  echo "REDIS_URL=redis://:$RPW@127.0.0.1:$REDIS_PORT"
} > "$INFRA/resources.env.new"
chmod 600 "$INFRA/resources.env.new"; [ "$(cut -d= -f1 "$INFRA/resources.env.new" | sort | uniq -d | wc -l)" = "0" ]
mv "$INFRA/resources.env.new" "$INFRA/resources.env"; [ "$(stat -c %a "$INFRA/resources.env")" = "600" ]
STEP="concluido"; trap - ERR
echo "OK: db=$DBNAME pg_porta=$PGPORT redis_porta=$REDIS_PORT vector=0.8.0 (chaves: $(cut -d= -f1 "$INFRA/resources.env" | tr '\n' ' '))"
