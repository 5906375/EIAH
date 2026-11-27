#!/usr/bin/env bash
# BACKUP-A — painel de acompanhamento SOMENTE CONSULTA (STORAGE-02B.11-DEC-20261017-01).
#   backup-a-panel [-i SEGUNDOS] [--once]      padrão: atualiza a cada 5 s; Ctrl+C (ou q) encerra.
# Fontes reais: systemd --user (show/is-enabled), loginctl show-user, diretórios/arquivos do BACKUP-A (STATE, receipts.tsv, alerts), df.
# NÃO inicia captura/login/upload/limpeza/restauração, NÃO chama AWS, NÃO escreve em lugar algum, NÃO recalcula hashes,
# NÃO mostra credenciais nem conteúdo de backups. Não usa `backup-a.sh status` porque ele executa mkdir/chmod -R ao iniciar;
# aqui a fila e os limites são lidos com a mesma regra dele (soma dos runs que não estão em UPLOADED_VERIFIED).
# Cada atualização consulta tudo de novo; consulta que falha mostra "não disponível" (nada é reaproveitado de atualização anterior).
set -u
export LC_ALL=C.UTF-8 2>/dev/null || true
INTERVAL=5; ONCE=0
while [ $# -gt 0 ]; do case $1 in -i) INTERVAL=${2:-5}; shift 2;; --once) ONCE=1; shift;; -h|--help) sed -n 2,4p "$0"; exit 0;; *) echo "uso: backup-a-panel [-i SEGUNDOS] [--once]" >&2; exit 78;; esac; done
case $INTERVAL in ''|*[!0-9]*) echo "intervalo inválido" >&2; exit 78;; esac; [ "$INTERVAL" -ge 2 ] || INTERVAL=2
CONF=${BA_CONF:-$HOME/.eiah-aws/automation/backup-a/backup-a.env}
NA="não disponível"
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then R=$'\033[31m'; G=$'\033[32m'; Y=$'\033[33m'; B=$'\033[1m'; D=$'\033[2m'; Z=$'\033[0m'; else R=; G=; Y=; B=; D=; Z=; fi
cfg() { # chave padrão -> valor lido do .env SEM executá-lo
  local v; v=$(grep -E "^$1=" "$CONF" 2>/dev/null | tail -1 | cut -d= -f2- | sed 's/[[:space:]]*#.*$//; s/^"//; s/"$//'); v=${v//\$HOME/$HOME}; v=${v//\$\{HOME\}/$HOME}; printf '%s' "${v:-$2}"; }
# --- tempo: conversão SEMPRE por `date` + tzdata (nunca por subtração manual). Formato ISO-8601 com offset explícito.
TZ_BR=America/Sao_Paulo
tfmt() { local e=$1 b u; b=$(TZ=$TZ_BR date -d "@$e" '+%Y-%m-%dT%H:%M:%S%:z' 2>/dev/null) && u=$(TZ=UTC date -d "@$e" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null) || { printf '%s' "$NA"; return; }; printf '%s (Brasília, America/Sao_Paulo) | %s (UTC)' "$b" "$u"; }
ts2() { local s=$1 e; case $s in ''|"$NA"|'(vazio)') printf '%s' "$NA"; return;; esac; e=$(date -d "$s" +%s 2>/dev/null) || { printf '%s' "$NA"; return; }; tfmt "$e"; }
runid_ts() { local t; t=$(printf '%s' "$1" | grep -oE '[0-9]{8}T[0-9]{6}' | head -1); [ -n "$t" ] || { printf '%s' "$NA"; return; }; local e; e=$(date -u -d "${t:0:4}-${t:4:2}-${t:6:2} ${t:9:2}:${t:11:2}:${t:13:2} UTC" +%s 2>/dev/null) || { printf '%s' "$NA"; return; }; tfmt "$e"; }
sd() { systemctl --user "$@" 2>/dev/null; }
prop() { local v; v=$(sd show "$1" -p "$2" --value --no-pager) || { printf '%s' "$NA"; return; }; [ -n "$v" ] && printf '%s' "$v" || printf '(vazio)'; }

render() {
  local BA_HOME QMAX AMAX MINF SP Q now
  BA_HOME=$(cfg BA_HOME "$HOME/.eiah-aws/backup-a-auto"); QMAX=$(cfg BA_QUEUE_MAX_MB 1500); AMAX=$(cfg BA_ARCHIVE_MAX_MB 4000); MINF=$(cfg BA_MIN_FREE_MB 3000); SP=$(cfg BA_SPACE_PATH /mnt/c); Q=$BA_HOME/queue
  [ -r "$CONF" ] || echo "${Y}aviso: config $CONF ilegível — usando padrões${Z}"
  echo "${B}BACKUP-A — painel de acompanhamento (SOMENTE CONSULTA)${Z}"
  echo "Consulta (agora): $(tfmt "$(date +%s)")"
  echo "Fuso do sistema: $(cat /etc/timezone 2>/dev/null || echo "$NA") (esperado America/Sao_Paulo = Brasília) · atualizado a cada ${INTERVAL}s · legenda: AGENDADO = horário do calendário · INÍCIO/TÉRMINO REAIS = execução · CONSULTA = momento desta tela"
  echo "${R}${B}UPLOAD AO S3 MANUAL — iniciado pelo owner${Z}"
  echo "${Y}Windows e WSL precisam estar funcionando no horário; horários perdidos não são recuperados automaticamente.${Z}"
  echo
  echo "${B}AGENDA (decisão STORAGE-02B.11-DEC-20261017-01): captura diária todos os dias às 08h · captura semanal sextas-feiras às 18h${Z}"
  local t kind
  for kind in daily weekly; do t=backup-a-capture-$kind.timer
    local en ac sub last next cal per
    en=$(sd is-enabled "$t") || en=$NA; ac=$(prop $t ActiveState); sub=$(prop $t SubState); last=$(prop $t LastTriggerUSec); next=$(prop $t NextElapseUSecRealtime); per=$(prop $t Persistent)
    cal=$(sd show "$t" -p TimersCalendar --value --no-pager | sed 's/.*OnCalendar=\([^;]*\);.*/\1/; s/ *$//'); [ -n "$cal" ] || cal=$NA
    local lastf nextf; if [ "$last" = "(vazio)" ]; then lastf="nunca disparou desde que o timer foi carregado"; else lastf="$(ts2 "$last")  ${D}[systemd: $last]${Z}"; fi; nextf="$(ts2 "$next")  ${D}[systemd: $next]${Z}"
    echo "  timer $kind: enabled=$en active=$ac/$sub · Persistent=$per"
    echo "     horário AGENDADO (calendário real): $cal"
    echo "     último disparo real    : $lastf"
    echo "     próximo agendado       : $nextf"
  done
  echo
  echo "${B}ÚLTIMA EXECUÇÃO DOS SERVIÇOS (systemd)${Z}"
  local s st rs
  for kind in daily weekly; do s=backup-a-capture@$kind.service
    st=$(prop $s ActiveState); rs=$(prop $s Result)
    local ss se; ss=$(prop $s ExecMainStartTimestamp); se=$(prop $s ExecMainExitTimestamp)
    case $st in active|activating) echo "  $kind: ${G}${B}EM EXECUÇÃO${Z}"; echo "     início real: $(ts2 "$ss")";;
      *) if [ "$ss" = "(vazio)" ]; then echo "  $kind: sem execução registrada pelo systemd (estado=$st)"; else echo "  $kind: resultado=$rs · código=$(prop $s ExecMainStatus)"; echo "     início real : $(ts2 "$ss")"; echo "     término real: $(ts2 "$se")"; fi;; esac
  done
  local busy=""; for kind in daily weekly; do case $(prop backup-a-capture@$kind.service ActiveState) in active|activating) busy="serviço $kind";; esac; done
  for d in "$Q"/*/; do [ -d "$d" ] && [ "$(cat "$d/STATE" 2>/dev/null)" = CAPTURING ] && busy="$busy run $(basename "$d") em CAPTURING"; done
  pgrep -f 'backup-a(-run)?\.sh capture' >/dev/null 2>&1 && busy="$busy processo de captura ativo"
  [ -n "$busy" ] && echo "  ${G}${B}CAPTURA EM ANDAMENTO:${Z} $busy" || echo "  captura em andamento: nenhuma"
  echo
  echo "${B}RUNS (CAPTURED = só local, NÃO enviado · UPLOADED_VERIFIED = enviado e verificado no S3)${Z}"
  if [ ! -d "$Q" ]; then echo "  fila $Q: $NA"; else
    local rows; rows=$(for d in "$Q"/*/; do [ -d "$d" ] || continue; b=$(basename "$d"); st=$(cat "$d/STATE" 2>/dev/null || echo "$NA"); [ "$st" = DRYRUN ] && continue; ts=$(echo "$b" | grep -oE '[0-9]{8}T[0-9]{9}Z'); echo "$ts|$b|$st|$(du -sm "$d" 2>/dev/null | cut -f1)"; done | sort -r | head -5)
    if [ -z "$rows" ]; then echo "  nenhum run encontrado"; else echo "$rows" | while IFS='|' read -r ts b st mb; do
      case $st in UPLOADED_VERIFIED) c=$G;; CAPTURED|UPLOADING) c=$Y;; *) c=$R;; esac; printf '  %s%-18s%s %6s MB  %s\n' "$c" "$st" "$Z" "${mb:-?}" "$b"; done; fi
    local last; last=$(echo "$rows" | head -1 | cut -d'|' -f2)
    if [ -n "$last" ] && [ -d "$Q/$last" ]; then
      echo
      echo "${B}ÚLTIMO BACKUP${Z}: $last · estado=${B}$(cat "$Q/$last/STATE" 2>/dev/null || echo "$NA")${Z}"
      echo "  criado (timestamp do id do run, UTC; ms omitidos): $(runid_ts "$last")"
      if [ -r "$Q/$last/run.json" ]; then echo "  captura concluída (run.json 'at'): $(ts2 "$(jq -r '.at // empty' "$Q/$last/run.json" 2>/dev/null)")"; else echo "  captura concluída: $NA"; fi
      if [ -s "$Q/$last/uploaded.tsv" ]; then echo "  envio ao S3 (uploaded.tsv, último objeto): PUT $(ts2 "$(tail -1 "$Q/$last/uploaded.tsv" | cut -f7)") · verificado $(ts2 "$(tail -1 "$Q/$last/uploaded.tsv" | cut -f8)")"; else echo "  envio ao S3: não realizado (sem uploaded.tsv)"; fi
      echo "  pasta (WSL)      : $Q/$last/objects"
      echo "  pasta (Windows)  : $(wslpath -w "$Q/$last/objects" 2>/dev/null || echo "$NA")"
      if [ -r "$Q/$last/receipts.tsv" ]; then
        awk -F'\t' 'NR>1{print $1"\t"$2"\t"$5}' "$Q/$last/receipts.tsv" | while IFS=$'\t' read -r id name rb; do
          f="$Q/$last/objects/$name"
          if [ -f "$f" ]; then sz=$(stat -c %s "$f" 2>/dev/null || echo "?"); [ "$sz" = "$rb" ] && ok="${G}tamanho confere com receipts.tsv${Z}" || ok="${R}TAMANHO DIVERGE do receipts.tsv (arquivo=$sz recibo=$rb)${Z}"
            echo "  $id  $sz B  $ok"; echo "      $f"
          else echo "  $id  ${R}arquivo ausente${Z} (esperado: $f)"; fi; done
        echo "  recibos: $Q/$last/receipts.tsv  ${D}(SHA-256 não é recalculado aqui)${Z}"
      else echo "  recibos: $NA"; fi
    fi
  fi
  echo
  echo "${B}FILA E ESPAÇO${Z}"
  if [ -d "$Q" ]; then
    local qm=0 am=0 st mb
    for d in "$Q"/*/; do [ -d "$d" ] || continue; st=$(cat "$d/STATE" 2>/dev/null); mb=$(du -sm "$d" 2>/dev/null | cut -f1); mb=${mb:-0}; if [ "$st" = UPLOADED_VERIFIED ]; then am=$((am+mb)); else qm=$((qm+mb)); fi; done
    local cq="$G"; [ "$qm" -ge $((QMAX*8/10)) ] && cq="$Y"; [ "$qm" -ge "$QMAX" ] && cq="$R"
    echo "  fila aguardando envio : ${cq}${B}${qm} MB${Z} de ${QMAX} MB (limite BA_QUEUE_MAX_MB) · arquivo local já verificado: ${am} MB de ${AMAX} MB"
  else echo "  fila aguardando envio : $NA"; fi
  echo "  ${Y}Ao atingir ${QMAX} MB de fila a captura é RECUSADA com código 77 (idem se o arquivo local verificado atingir ${AMAX} MB ou o espaço livre ficar abaixo do piso de ${MINF} MB). Envie e acompanhe o crescimento.${Z}"
  local fq fc
  fq=$(df -Pm "$BA_HOME" 2>/dev/null | awk 'NR==2{printf "%s MB livres em %s (sistema de arquivos %s, %s usado)", $4, $6, $1, $5}'); fc=$(df -Pm "$SP" 2>/dev/null | awk 'NR==2{printf "%s MB livres (%s, %s usado)", $4, $1, $5}')
  echo "  espaço do sistema de arquivos da FILA (WSL, $BA_HOME): ${fq:-$NA}"
  echo "  espaço livre no C: ($SP)                          : ${fc:-$NA}"
  echo
  echo "${B}ALERTAS${Z}"
  local AL="$BA_HOME/alerts"
  if [ -d "$AL" ]; then
    local act; act=$(ls "$AL"/ACTIVE-* 2>/dev/null)
    if [ -n "$act" ]; then for f in $act; do echo "  ${R}ATIVO${Z} $(basename "$f"): $(head -c 300 "$f")"; done; else echo "  alertas ativos: nenhum"; fi
    if [ -s "$AL/alerts.log" ]; then echo "  últimos registros em alerts.log:"; tail -n 3 "$AL/alerts.log" | cut -c1-200 | sed 's/^/    /'; else echo "  alerts.log: vazio ou inexistente"; fi
  else echo "  diretório de alertas inexistente (nenhum alerta já gerado)"; fi
  echo
  echo "${B}AMBIENTE${Z}"
  local lg; lg=$(loginctl show-user "$USER" -p Linger --value 2>/dev/null) || lg=""; [ -n "$lg" ] || lg=$NA
  echo "  Linger=$lg (no = o gerenciador systemd do usuário pode parar sem sessão aberta) · Persistent: ver timers acima (no = horário perdido não é recuperado)"
  local sr fl; sr=$(sd is-system-running); [ -n "$sr" ] || sr=$NA; fl=$(sd --failed --no-legend --no-pager | grep -c 'backup-a' )
  local ck; ck=$(timedatectl show -p Timezone -p NTPSynchronized -p NTP 2>/dev/null | tr '\n' ' '); echo "  relógio WSL (timedatectl, somente leitura): ${ck:-$NA}"
  echo "  ${D}NTPSynchronized=yes é a flag do kernel e NTP=no indica que não há cliente NTP próprio: o relógio do WSL é fornecido pelo host Windows (diferença medida na evidência de tempo). Conversão de fuso NÃO comprova sincronização; ver evidência de tempo.${Z}"
  echo "  systemd --user: $sr (degraded = alguma unit de usuário falhou, ex.: pulseaudio) · units backup-a em falha: ${fl:-$NA}"
  echo
  echo "${D}Última atualização (consulta): $(tfmt "$(date +%s)") · Ctrl+C ou q para sair (não interrompe timers nem serviços)${Z}"
}

if [ "$ONCE" = 1 ] || [ ! -t 1 ]; then render; exit 0; fi
trap 'printf "\033[?25h\n"; exit 0' INT TERM HUP
printf '\033[?25l'
while :; do
  out=$(render 2>&1)
  printf '\033[H\033[2J%s\n' "$out"
  if read -r -t "$INTERVAL" -n 1 k 2>/dev/null; then [ "$k" = q ] || [ "$k" = Q ] && { printf '\033[?25h\n'; exit 0; }; fi
done
