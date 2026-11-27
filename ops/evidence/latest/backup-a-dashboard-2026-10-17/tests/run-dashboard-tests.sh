#!/usr/bin/env bash
# Testes LOCAIS do dashboard com fixture sintética + mock-aws. Nenhuma chamada AWS real; não toca o BACKUP-A real.
HB=$HOME/.eiah-aws/automation/backup-a; MYDIR=$(cd "$(dirname "$0")" && pwd)
PRE=$(mktemp "${TMPDIR:-/tmp}/bad-pre.XXXXXX"); sed -n 1,47p "$HB/tests/run-tests.sh" | sed "s#^HERE=.*#HERE=$HB/tests; A=$HB#" > "$PRE"
# shellcheck disable=SC1090
source "$PRE"; rm -f "$PRE"
for i in 1 2 3 4; do $BA capture --kind daily --force > "$T/cap$i.out" 2>&1 || { echo "captura de fixture $i falhou"; cat "$T/cap$i.out"; exit 1; }; sleep 1; done
export T BA MOCK_STORE HERE_BA_TESTS=$HB/tests
python3 -I "$MYDIR/test_dashboard.py" 2>&1; code=$?
echo "DASHBOARD_TESTS_EXIT=$code | fixture: ${T/#$HOME/~}"; rm -f /dev/shm/BA-AUTO* 2>/dev/null; exit $code
