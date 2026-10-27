#!/usr/bin/env bash
# Teste em NAVEGADOR REAL (Edge/CDP, Windows) dos controles de ação contra uma FIXTURE sintética + mock-aws. Nada real é tocado.
HB=$HOME/.eiah-aws/automation/backup-a; MYDIR=$(cd "$(dirname "$0")" && pwd); W=<WINDOWS_USER_PROFILE>/AppData/Local/Temp; WW='C:\Users\<WINDOWS_USER>\AppData\Local\Temp'
PRE=$(mktemp "${TMPDIR:-/tmp}/bad-pre.XXXXXX"); sed -n 1,47p "$HB/tests/run-tests.sh" | sed "s#^HERE=.*#HERE=$HB/tests; A=$HB#" > "$PRE"; source "$PRE"; rm -f "$PRE"
for i in 1 2; do $BA capture --kind daily --force > "$T/cap$i.out" 2>&1 || { echo "captura de fixture falhou"; exit 1; }; sleep 1; done
export MOCK_STORE; PORT=18800
BAD_CONF=$T/backup-a.env BAD_BACKUP_A_SH=$BA BAD_STATE_DIR=$T/dstate BAD_PORT=$PORT BAD_RECOVERY_FILE=$T/none.json python3 -I "$HB/dashboard/server.py" > "$T/srv.log" 2>&1 &
SP=$!; sleep 1.5
cp "$MYDIR/browser-test.mjs" $W/ba-browser-test.mjs; cd /mnt/c
timeout 280 cmd.exe /c "node --experimental-websocket $WW\\ba-browser-test.mjs http://127.0.0.1:$PORT/ mock 9333 $WW\\ba-browser-mock.json $WW\\ba-shots-mock" 2>&1 | tr -d '\r' | grep -v "ExperimentalWarning\|UNDICI\|trace-warnings"; code=${PIPESTATUS[0]}
cd - >/dev/null
echo "--- verificação do lado do servidor (fixture): PUTs=$(wc -l < $MOCK_STORE/puts.log 2>/dev/null) esperados=3 (1 run, 3 objetos; duplo clique não duplica)"; sort $MOCK_STORE/puts.log | uniq -c | awk '{print "  "$1"x "$2}' | sed 's#/[^ ]*/##' | head -5
for r in $T/auto/queue/*/; do echo "  $(basename $r) $(cat $r/STATE)"; done
kill $SP 2>/dev/null; echo "BROWSER_MOCK_EXIT=$code fixture=${T/#$HOME/~}"; echo $T > /tmp/bad-last-fixture; exit $code
