#!/usr/bin/env bash
# Provisiona role/banco/extensão no PostgreSQL DESCARTÁVEL desta tarefa. Não aplica migrations.
# Para em qualquer falha e informa a etapa e os recursos parcialmente criados.
set -euo pipefail
umask 077

S=/tmp/claude-1000/-home-jusall-projects-EIAH-IMOB-ASSET-DESTINATION/8af490ba-6ed0-479d-87b1-c55dc224b216/scratchpad
STEP="0-verificacao-de-origem"
CREATED=()
on_err() {
  echo "FALHA na etapa: $STEP" >&2
  if ((${#CREATED[@]})); then echo "Recursos parcialmente criados: ${CREATED[*]}" >&2; else echo "Recursos criados nesta execução: nenhum" >&2; fi
  echo "Nada foi removido; pgpw.tmp e resources.env preservados." >&2
}
trap on_err ERR

# ── 0. Origem: INFRA e porta pertencem à infra descartável desta tarefa ────────────────────────────────────────
INFRA=$(cat "$S/INFRA_DIR.txt")
case "$INFRA" in "$S"/infra-eval-*) ;; *) echo "INFRA fora do scratchpad desta tarefa" >&2; exit 10 ;; esac
[ -d "$INFRA/data/pg" ] && [ -f "$INFRA/data/pg/postmaster.pid" ] && [ -f "$INFRA/resources.env" ] && [ -f "$INFRA/pgpw.tmp" ]
. "$INFRA/pgport.env"                       # PGPORT
PG="$INFRA/pg/bin"
PID_FILE_PORT=$(sed -n 4p "$INFRA/data/pg/postmaster.pid")
[ "$PID_FILE_PORT" = "$PGPORT" ] || { echo "porta do postmaster.pid ($PID_FILE_PORT) != PGPORT ($PGPORT)" >&2; exit 11; }
PM_PID=$(sed -n 1p "$INFRA/data/pg/postmaster.pid")
[ "$(readlink -f /proc/$PM_PID/exe)" = "$(readlink -f "$PG/postgres")" ] || { echo "processo $PM_PID não é o postgres desta infra" >&2; exit 12; }
[ "$(stat -c %a "$INFRA/resources.env")" = "600" ]
# Redis existente preservado: exatamente as chaves esperadas e nada além
[ "$(cut -d= -f1 "$INFRA/resources.env" | sort | tr '\n' ' ')" = "REDIS_PASSWORD REDIS_PORT " ] || { echo "resources.env já tem chaves além de REDIS_*: possível tentativa anterior; parar" >&2; exit 13; }

ADMIN_PW=$(cat "$INFRA/pgpw.tmp")
psql_admin() { PGPASSWORD="$ADMIN_PW" "$PG/psql" -h 127.0.0.1 -p "$PGPORT" -U eiah_disp_admin -v ON_ERROR_STOP=1 -X -q -At "$@"; }

# Estado prévio: role/banco já criados por tentativa anterior?
STEP="0b-estado-previo"
EXIST_ROLE=$(psql_admin -d postgres -c "select count(*) from pg_roles where rolname='eiah_eval_app'")
EXIST_DB=$(psql_admin -d postgres -c "select count(*) from pg_database where datname like 'eiah_logistica_core_evaldisp_%'")
REUSE_ROLE=0
if [ "$EXIST_DB" != "0" ]; then
  echo "Banco de tentativa anterior detectado (bancos=$EXIST_DB); não duplico. Parar para decisão." >&2
  exit 14
fi
if [ "$EXIST_ROLE" != "0" ]; then
  # Origem do role provada no cluster descartável identificado (e só então reutilizado):
  #  (a) cluster é o da infra (postmaster.pid/exe/porta/data_dir, verificados acima);
  #  (b) os únicos roles não-builtin são o admin do initdb e eiah_eval_app, com OID posterior ao do admin;
  #  (c) o log DESTE servidor registra a verificação da tentativa anterior sobre eiah_eval_app (STATEMENT pós-CREATE ROLE).
  ROLESET=$(psql_admin -d postgres -c "select string_agg(rolname, ',' order by oid) from pg_roles where rolname !~ '^pg_'")
  [ "$ROLESET" = "eiah_disp_admin,eiah_eval_app" ] || { echo "conjunto de roles inesperado: $ROLESET" >&2; exit 14; }
  [ "$(sed -n 2p "$INFRA/data/pg/postmaster.pid")" = "$INFRA/data/pg" ]
  grep -q "STATEMENT:  select rolsuper::int||rolcanlogin::int from pg_roles where rolname='eiah_eval_app'" "$INFRA/logs/pg-server2.log" \
    || { echo "sem registro no log do servidor da tentativa anterior sobre o role; origem não provada" >&2; exit 14; }
  OWNED=$(psql_admin -d postgres -c "select count(*) from pg_database where datdba=(select oid from pg_roles where rolname='eiah_eval_app')")
  SUP=$(psql_admin -d postgres -c "select rolsuper::text from pg_roles where rolname='eiah_eval_app'")
  CONNS=$(psql_admin -d postgres -c "select count(*) from pg_stat_activity where usename='eiah_eval_app'")
  [ "$OWNED" = "0" ] && [ "$SUP" = "false" ] && [ "$CONNS" = "0" ] || { echo "role existente não é reutilizável com segurança (owned=$OWNED super=$SUP conns=$CONNS)" >&2; exit 14; }
  REUSE_ROLE=1
fi

# ── 1. Usuário de aplicação ───────────────────────────────────────────────────────────────────────────────────
STEP="1-role-aplicacao"
APP_PW=$(head -c 24 /dev/urandom | base64 | tr -d '/+=')
[ "${#APP_PW}" -ge 20 ]
if [ "$REUSE_ROLE" = "1" ]; then
  psql_admin -d postgres -c "ALTER ROLE eiah_eval_app LOGIN PASSWORD '$APP_PW' NOSUPERUSER NOCREATEDB NOCREATEROLE"
  CREATED+=("role:eiah_eval_app(reutilizado, senha redefinida)")
else
  psql_admin -d postgres -c "CREATE ROLE eiah_eval_app LOGIN PASSWORD '$APP_PW' NOSUPERUSER NOCREATEDB NOCREATEROLE"
  CREATED+=("role:eiah_eval_app")
fi
[ "$(psql_admin -d postgres -c "select rolsuper::text||'/'||rolcanlogin::text from pg_roles where rolname='eiah_eval_app'")" = "false/true" ]

# ── 2. Banco descartável e proprietário ───────────────────────────────────────────────────────────────────────
STEP="2-banco-e-proprietario"
DBNAME="eiah_logistica_core_evaldisp_$(head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n')"
[[ "$DBNAME" =~ ^eiah_logistica_core_evaldisp_[0-9a-f]{8}$ ]]
psql_admin -d postgres -c "CREATE DATABASE $DBNAME OWNER eiah_eval_app"
CREATED+=("database:$DBNAME")
[ "$(psql_admin -d postgres -c "select pg_get_userbyid(datdba) from pg_database where datname='$DBNAME'")" = "eiah_eval_app" ]

# ── 3. Extensão vector (exige superusuário; só neste banco) ───────────────────────────────────────────────────
STEP="3-extensao-vector"
psql_admin -d "$DBNAME" -c "CREATE EXTENSION IF NOT EXISTS vector"
[ "$(psql_admin -d "$DBNAME" -c "select extversion from pg_extension where extname='vector'")" = "0.8.0" ]
CREATED+=("extension:vector@$DBNAME")

# ── 4. Conexão autenticada como usuário de aplicação ──────────────────────────────────────────────────────────
STEP="4-conexao-app"
APP_URL="postgresql://eiah_eval_app:$APP_PW@127.0.0.1:$PGPORT/$DBNAME"
CHECK=$(PGPASSWORD="$APP_PW" "$PG/psql" "postgresql://eiah_eval_app@127.0.0.1:$PGPORT/$DBNAME" -X -q -At -F'|' \
  -c "select current_user, current_database(), inet_server_port(), (select count(*) from pg_tables where schemaname='public')")
[ "$CHECK" = "eiah_eval_app|$DBNAME|$PGPORT|0" ] || { echo "conexão app divergente do esperado" >&2; exit 15; }

# ── 5. Só agora: atualizar resources.env (0600, sem imprimir segredos, preservando Redis) ──────────────────────
STEP="5-resources-env"
RPASS=$(grep '^REDIS_PASSWORD=' "$INFRA/resources.env" | cut -d= -f2-)
RPORT=$(grep '^REDIS_PORT=' "$INFRA/resources.env" | cut -d= -f2-)
[ -n "$RPASS" ] && [ -n "$RPORT" ]
NEW="$INFRA/resources.env.new"
[ ! -e "$NEW" ]
cp -p "$INFRA/resources.env" "$NEW"
{
  echo "PG_PORT=$PGPORT"
  echo "PG_DB=$DBNAME"
  echo "DATABASE_URL=$APP_URL"
  echo "ADMIN_DATABASE_URL=postgresql://eiah_disp_admin:$ADMIN_PW@127.0.0.1:$PGPORT/$DBNAME"
  echo "REDIS_URL=redis://:$RPASS@127.0.0.1:$RPORT"
} >> "$NEW"
chmod 600 "$NEW"
[ "$(cut -d= -f1 "$NEW" | sort | uniq -d | wc -l)" = "0" ]               # sem chaves duplicadas
grep -q "^REDIS_PASSWORD=$RPASS\$" "$NEW" && grep -q "^REDIS_PORT=$RPORT\$" "$NEW"
mv "$NEW" "$INFRA/resources.env"
[ "$(stat -c %a "$INFRA/resources.env")" = "600" ]

STEP="concluido"
trap - ERR
echo "OK: role=eiah_eval_app db=$DBNAME porta=$PGPORT extensão=vector@0.8.0 (chaves em resources.env: $(cut -d= -f1 "$INFRA/resources.env" | tr '\n' ' '))"
echo "pgpw.tmp preservado (será removido só após o ciclo de uso)."
