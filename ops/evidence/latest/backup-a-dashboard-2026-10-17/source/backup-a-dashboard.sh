#!/usr/bin/env bash
# BACKUP-A dashboard local — iniciar/parar/abrir. Não instala nada, não altera inicialização do terminal/Windows.
#   backup-a-dashboard start|stop|status|url|open|run
set -uo pipefail
HERE=$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)
SD=${BAD_STATE_DIR:-$HOME/.eiah-aws/dashboard-state}; SJ=$SD/server.json
mkdir -p "$SD" && chmod 700 "$SD"
pid_alive() { [ -n "${1:-}" ] && [ -d "/proc/$1" ] && grep -q "server.py" "/proc/$1/cmdline" 2>/dev/null; }
info() { [ -r "$SJ" ] && python3 -I -c 'import json,sys;d=json.load(open(sys.argv[1]));print(d["pid"],d["port"])' "$SJ" 2>/dev/null; }
cur() { read -r P PORT < <(info) || return 1; pid_alive "$P" || return 1; echo "$P $PORT"; }
cmd=${1:-status}
case $cmd in
  start) if x=$(cur); then set -- $x; echo "já em execução (pid $1): http://127.0.0.1:$2/"; exit 0; fi
    rm -f "$SJ"; ( cd "$HERE" && setsid nohup python3 -I "$HERE/server.py" >> "$SD/server.log" 2>&1 < /dev/null & )
    for i in $(seq 1 50); do sleep 0.1; if x=$(cur); then set -- $x; echo "iniciado (pid $1): http://127.0.0.1:$2/  (somente loopback; parar: backup-a-dashboard stop)"; exit 0; fi; done
    echo "falha ao iniciar; veja $SD/server.log" >&2; exit 1;;
  stop) if x=$(cur); then set -- $x; kill -TERM "$1"; for i in $(seq 1 30); do sleep 0.1; pid_alive "$1" || { echo "parado (pid $1). Timers, capturas e uploads em andamento NÃO foram afetados."; exit 0; }; done; echo "não encerrou; kill -KILL $1" >&2; exit 1; else echo "não está em execução"; fi;;
  status) if x=$(cur); then set -- $x; echo "em execução (pid $1): http://127.0.0.1:$2/"; else echo "parado"; exit 3; fi;;
  url) x=$(cur) && { set -- $x; echo "http://127.0.0.1:$2/"; } || { echo "parado" >&2; exit 3; };;
  open) x=$(cur) || { "$0" start >/dev/null; x=$(cur) || exit 1; }; set -- $x; U="http://127.0.0.1:$2/"
    if command -v wslview >/dev/null; then wslview "$U" >/dev/null 2>&1 & else ( cd /mnt/c && cmd.exe /c start "" "$U" >/dev/null 2>&1 & ); fi; echo "abrindo $U no navegador do Windows";;
  run) exec python3 -I "$HERE/server.py";;
  *) echo "uso: backup-a-dashboard start|stop|status|url|open|run" >&2; exit 78;;
esac
