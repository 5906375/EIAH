#!/usr/bin/env bash
# STORAGE-02B.11-DEC-20261017-01 — instala/remove SOMENTE os 2 timers de CAPTURA do BACKUP-A (+ o serviço de captura).
# NÃO instala upload, audit, check nem prune. Padrão = --dry-run. Não toca IAM/S3/AWS nem outros arquivos.
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); D=$HOME/.config/systemd/user; mode=${1:---dry-run}
SVC=backup-a-capture@.service; T="backup-a-capture-daily.timer backup-a-capture-weekly.timer"; U="$SVC $T"
FORBID="backup-a-upload.service backup-a-upload.timer backup-a-audit@.service backup-a-audit-head.timer backup-a-audit-full.timer backup-a-check.service backup-a-check.timer"
validate() { local rc=0 u f
  for u in $U; do [ -r "$HERE/$u" ] || { echo "FALTA $HERE/$u"; rc=2; }; done
  for f in $T; do grep -q '^Persistent=false$' "$HERE/$f" || { echo "$f: Persistent=false ausente"; rc=2; }; grep -q 'America/Sao_Paulo' "$HERE/$f" || { echo "$f: fuso explícito ausente"; rc=2; }; done
  grep -qE '^ExecStart=.*/backup-a-run\.sh capture %i$' "$HERE/$SVC" || { echo "$SVC: ExecStart inesperado"; rc=2; }
  [ "$(grep -hcE '^Exec[A-Za-z]*=' "$HERE/$SVC")" = 1 ] || { echo "$SVC: deve ter exatamente 1 Exec*="; rc=2; }
  grep -hE '^(OnSuccess|OnFailure|Requires|Wants|After|Before|BindsTo)=' "$HERE"/*.service "$HERE"/*.timer | grep -q . && { echo "units de captura não podem encadear outras units"; rc=2; }
  for f in $T; do grep -qE '^Unit=backup-a-capture@(daily|weekly)\.service$' "$HERE/$f" || { echo "$f: Unit= inesperada"; rc=2; }; done
  for u in $FORBID; do [ -e "$D/$u" ] && { echo "já instalado e não autorizado: $D/$u"; rc=2; }; done
  for f in $T; do systemd-analyze calendar "$(sed -n 's/^OnCalendar=//p' "$HERE/$f")" >/dev/null 2>&1 || { echo "$f: calendário inválido"; rc=2; }; done
  systemd-analyze verify --user "$HERE/$SVC" "$HERE"/*.timer 2>&1 | grep -v "^$" | head -5
  return $rc; }
case $mode in
  --dry-run) validate; rc=$?; echo "dry-run (rc=$rc): copiaria $U para $D e executaria: systemctl --user daemon-reload && systemctl --user enable --now $T"
    for f in $T; do systemd-analyze calendar "$(sed -n 's/^OnCalendar=//p' "$HERE/$f")" | grep -E "Normalized|Next elapse"; done; exit $rc;;
  --apply) validate || { echo "validação falhou — nada instalado" >&2; exit 2; }
    [ -r "$HOME/.eiah-aws/automation/backup-a/backup-a.env" ] || { echo "backup-a.env ausente" >&2; exit 78; }
    mkdir -p "$D"; for u in $U; do [ -e "$D/$u" ] && ! cmp -s "$HERE/$u" "$D/$u" && { echo "já existe e difere: $D/$u — abortando" >&2; exit 2; }; done
    for u in $U; do cp -n "$HERE/$u" "$D/$u"; done
    systemctl --user daemon-reload && systemctl --user enable --now $T && systemctl --user list-timers $T --no-pager;;
  --remove) systemctl --user disable --now $T 2>/dev/null; for u in $U; do [ -e "$D/$u" ] && cmp -s "$HERE/$u" "$D/$u" && rm -f "$D/$u"; done; systemctl --user daemon-reload; echo "removidos os 2 timers de captura e o serviço (apenas se idênticos aos da v3)";;
  *) echo "uso: $0 [--dry-run|--apply|--remove]" >&2; exit 78;;
esac
