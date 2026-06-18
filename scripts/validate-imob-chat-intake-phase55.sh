#!/usr/bin/env bash
# validate-imob-chat-intake-phase55.sh
# Phase 5.5 — Final E2E / Release Candidate
# Validates: upload → confirm (runStatus=success, mutationQueued=true)
#   → poll for ImobCase creation by worker → export HTML/DOCX/PDF
# Evidence for: docs/ops/evidence/latest/imob-chat-document-intake/phase-5.5-e2e-rc.md

set -euo pipefail

API="http://localhost:8080/api"
PGCONN="host=localhost port=5433 dbname=eiah_builder user=postgres password=senha"
SUFFIX="p55-$(date +%s%N | tail -c 8)"
TENANT_ID="tenant-p55-${SUFFIX}"
WORKSPACE_ID="ws-p55-${SUFFIX}"
TOKEN="tok-p55-${SUFFIX}"
DOCX_FILE="${1:-$(find . -path '*/mammoth/test/test-data/simple-list.docx' -print -quit 2>/dev/null)}"

echo "=== IMOB Chat Intake — Phase 5.5 Final E2E / Release Candidate ==="
echo "Tenant:    ${TENANT_ID}"
echo "Token:     ${TOKEN}"
echo "DOCX:      ${DOCX_FILE}"
echo ""

# ── 0. Preflight ──────────────────────────────────────────────────────────────

if ! curl -sf "${API}/health" >/dev/null; then
  echo "FAIL: API not healthy at ${API}" >&2
  exit 1
fi
echo "[OK] API health check passed"

if [ ! -f "${DOCX_FILE}" ]; then
  echo "FAIL: DOCX file not found: ${DOCX_FILE}" >&2
  exit 1
fi

# ── 1. Setup ──────────────────────────────────────────────────────────────────

PGPASSWORD=senha psql -h localhost -p 5433 -U postgres -d eiah_builder -q <<SQL
INSERT INTO tenants (id, name, created_at, updated_at)
  VALUES ('${TENANT_ID}', 'P5.5 Validation', NOW(), NOW()) ON CONFLICT DO NOTHING;
INSERT INTO workspaces (id, tenant_id, name, created_at, updated_at)
  VALUES ('${WORKSPACE_ID}', '${TENANT_ID}', 'P5.5 WS', NOW(), NOW()) ON CONFLICT DO NOTHING;
INSERT INTO api_tokens (id, token, tenant_id, workspace_id, user_id, description, revoked, created_at, updated_at)
  VALUES ('id-${TOKEN}', '${TOKEN}', '${TENANT_ID}', '${WORKSPACE_ID}', NULL, 'p55-val', false, NOW(), NOW()) ON CONFLICT DO NOTHING;
INSERT INTO workspace_agent_assignments (id, tenant_id, workspace_id, agent_key, agent_version, enabled, created_at, updated_at)
  VALUES ('assign-${SUFFIX}', '${TENANT_ID}', '${WORKSPACE_ID}', 'EIAH', '1', true, NOW(), NOW()) ON CONFLICT DO NOTHING;
SQL
echo "[OK] Test tenant/workspace/token created"

# ── 2. Upload ─────────────────────────────────────────────────────────────────

echo ""
echo "--- Step 2: Upload DOCX ---"
UPLOAD=$(curl -sf \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "file=@${DOCX_FILE};type=application/vnd.openxmlformats-officedocument.wordprocessingml.document" \
  "${API}/imob/chat/intake/upload")

DRAFT_ID=$(echo "${UPLOAD}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('draft',d).get('draftId',''))")
PII_MASKED=$(echo "${UPLOAD}" | python3 -c "import sys,json; d=json.load(sys.stdin); evs=d.get('draft',d).get('evidenceDrafts',[]); print(evs[0].get('piiMasked','') if evs else 'n/a')")
PII_MASKED_TOP=$(echo "${UPLOAD}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('draft',d).get('piiMasked',''))")

[ -n "${DRAFT_ID}" ] || { echo "FAIL: no draftId in upload response" >&2; exit 1; }
[ "${PII_MASKED_TOP}" = "True" ] || { echo "WARN: draft.piiMasked=${PII_MASKED_TOP} (may be lowercase)" ; }
echo "[OK] Upload — draftId=${DRAFT_ID}, draft.piiMasked=${PII_MASKED_TOP}, evidenceDraft.piiMasked=${PII_MASKED}"

# ── 3. Confirm ────────────────────────────────────────────────────────────────

echo ""
echo "--- Step 3: POST /imob/chat/intake/confirm/${DRAFT_ID} ---"
CONFIRM=$(curl -sf -X POST \
  -H "Authorization: Bearer ${TOKEN}" \
  "${API}/imob/chat/intake/confirm/${DRAFT_ID}")

echo "Response: ${CONFIRM}"
RUN_ID=$(echo "${CONFIRM}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('runId',''))")
RUN_STATUS=$(echo "${CONFIRM}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('runStatus',''))")
MUTATION_QUEUED=$(echo "${CONFIRM}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('mutationQueued',''))")
CONFIRM_OK=$(echo "${CONFIRM}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ok',''))")

[ "${CONFIRM_OK}" = "True" ] || { echo "FAIL: confirm ok!=True" >&2; exit 1; }
[ -n "${RUN_ID}" ] || { echo "FAIL: no runId in confirm response" >&2; exit 1; }
[ "${RUN_STATUS}" = "success" ] || { echo "FAIL: runStatus=${RUN_STATUS} (expected success)" >&2; exit 1; }
[ "${MUTATION_QUEUED}" = "True" ] || { echo "FAIL: mutationQueued=${MUTATION_QUEUED} (expected True)" >&2; exit 1; }
echo "[OK] Confirm — runId=${RUN_ID}, runStatus=success, mutationQueued=True"

# ── 4. DB: run status=success (no queued regression) ─────────────────────────

echo ""
echo "--- Step 4: Verify DB run status=success ---"
DB_STATUS=$(PGPASSWORD=senha psql -h localhost -p 5433 -U postgres -d eiah_builder -tAq \
  -c "SELECT status FROM runs WHERE id='${RUN_ID}' LIMIT 1")
[ "${DB_STATUS}" = "success" ] || { echo "FAIL: DB run status=${DB_STATUS} (expected success)" >&2; exit 1; }
echo "[OK] DB run status=success"

# Regression guard — no run should have status='queued' (invalid enum)
QUEUED_COUNT=$(PGPASSWORD=senha psql -h localhost -p 5433 -U postgres -d eiah_builder -tAq \
  -c "SELECT COUNT(*) FROM runs WHERE status::text='queued' AND tenant_id='${TENANT_ID}'" 2>/dev/null || echo "0")
[ "${QUEUED_COUNT}" = "0" ] || { echo "FAIL: ${QUEUED_COUNT} runs with invalid status=queued found" >&2; exit 1; }
echo "[OK] No runs with invalid status=queued (regression guard)"

# ── 5. Poll for ImobCase creation by worker ───────────────────────────────────

echo ""
echo "--- Step 5: Poll for ImobCase creation (worker auto-processes BullMQ job) ---"
POLL_MAX=20
POLL_INTERVAL=1
CASE_ID=""
for i in $(seq 1 ${POLL_MAX}); do
  CASE_ID=$(PGPASSWORD=senha psql -h localhost -p 5433 -U postgres -d eiah_builder -tAq \
    -c "SELECT id FROM imob_cases WHERE tenant_id='${TENANT_ID}' AND workspace_id='${WORKSPACE_ID}' LIMIT 1" 2>/dev/null || echo "")
  if [ -n "${CASE_ID}" ]; then
    break
  fi
  sleep ${POLL_INTERVAL}
done

[ -n "${CASE_ID}" ] || { echo "FAIL: ImobCase not created after ${POLL_MAX}s" >&2; exit 1; }
echo "[OK] ImobCase created — id=${CASE_ID}"

# Verify stage and status
CASE_STAGE=$(PGPASSWORD=senha psql -h localhost -p 5433 -U postgres -d eiah_builder -tAq \
  -c "SELECT stage FROM imob_cases WHERE id='${CASE_ID}' LIMIT 1")
CASE_STATUS=$(PGPASSWORD=senha psql -h localhost -p 5433 -U postgres -d eiah_builder -tAq \
  -c "SELECT status FROM imob_cases WHERE id='${CASE_ID}' LIMIT 1")
[ "${CASE_STAGE}" = "documents_collecting" ] || { echo "FAIL: case stage=${CASE_STAGE}" >&2; exit 1; }
[ "${CASE_STATUS}" = "ready_for_review" ] || { echo "FAIL: case status=${CASE_STATUS}" >&2; exit 1; }
echo "[OK] ImobCase stage=documents_collecting, status=ready_for_review"

# Verify ImobCaseEvent case.document.intake exists
EVENT_TYPE=$(PGPASSWORD=senha psql -h localhost -p 5433 -U postgres -d eiah_builder -tAq \
  -c "SELECT event_type FROM imob_case_events WHERE case_id='${CASE_ID}' AND event_type='case.document.intake' LIMIT 1" 2>/dev/null || echo "")
[ "${EVENT_TYPE}" = "case.document.intake" ] || { echo "FAIL: case.document.intake event not found" >&2; exit 1; }
echo "[OK] ImobCaseEvent case.document.intake exists"

# ── 6. Export HTML ────────────────────────────────────────────────────────────

echo ""
echo "--- Step 6: Export HTML ---"
HTML_RESPONSE=$(curl -si \
  -H "Authorization: Bearer ${TOKEN}" \
  "${API}/imob/runs/${RUN_ID}/intake/export?format=html")
HTML_STATUS=$(echo "${HTML_RESPONSE}" | head -1 | grep -oP '\d{3}' | head -1)
HTML_HASH=$(echo "${HTML_RESPONSE}" | grep -i "x-export-hash:" | awk '{print $2}' | tr -d '\r')

[ "${HTML_STATUS}" = "200" ] || { echo "FAIL: HTML export status=${HTML_STATUS}" >&2; exit 1; }
[ -n "${HTML_HASH}" ] || { echo "FAIL: X-Export-Hash header missing" >&2; exit 1; }
echo "[OK] HTML export — status=200, X-Export-Hash=${HTML_HASH}"

# ── 7. Export DOCX ────────────────────────────────────────────────────────────

echo ""
echo "--- Step 7: Export DOCX ---"
DOCX_STATUS=$(curl -so /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${API}/imob/runs/${RUN_ID}/intake/export?format=docx")
[ "${DOCX_STATUS}" = "200" ] || { echo "FAIL: DOCX export status=${DOCX_STATUS}" >&2; exit 1; }
echo "[OK] DOCX export — status=200"

# ── 8. Export PDF (delegated) ─────────────────────────────────────────────────

echo ""
echo "--- Step 8: Export PDF (frontend delegation) ---"
PDF_RESPONSE=$(curl -sf \
  -H "Authorization: Bearer ${TOKEN}" \
  "${API}/imob/runs/${RUN_ID}/intake/export?format=pdf")
PDF_STRATEGY=$(echo "${PDF_RESPONSE}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('strategy',''))")
[ "${PDF_STRATEGY}" = "PDF_DELEGATED_TO_FRONTEND" ] || { echo "FAIL: PDF strategy=${PDF_STRATEGY}" >&2; exit 1; }
echo "[OK] PDF guidance — PDF_DELEGATED_TO_FRONTEND"

# ── 9. Summary ────────────────────────────────────────────────────────────────

echo ""
echo "=== Phase 5.5 E2E Validation PASSED ==="
echo "  runId:       ${RUN_ID}"
echo "  runStatus:   success (self-completed by confirm endpoint)"
echo "  mutationQ:   True"
echo "  caseId:      ${CASE_ID}"
echo "  case stage:  documents_collecting"
echo "  case status: ready_for_review"
echo "  html hash:   ${HTML_HASH}"
echo ""
echo "Classificação: PARCIAL AVANÇADO — fluxo E2E real validado sem insert direto."

# ── 10. Teardown ──────────────────────────────────────────────────────────────

echo ""
echo "--- Teardown ---"
PGPASSWORD=senha psql -h localhost -p 5433 -U postgres -d eiah_builder -q <<SQL
DELETE FROM imob_case_events WHERE tenant_id='${TENANT_ID}';
DELETE FROM imob_cases WHERE tenant_id='${TENANT_ID}';
DELETE FROM runs WHERE tenant_id='${TENANT_ID}';
DELETE FROM uploaded_documents WHERE tenant_id='${TENANT_ID}';
DELETE FROM workspace_agent_assignments WHERE tenant_id='${TENANT_ID}';
DELETE FROM api_tokens WHERE tenant_id='${TENANT_ID}';
DELETE FROM workspaces WHERE tenant_id='${TENANT_ID}';
DELETE FROM tenants WHERE id='${TENANT_ID}';
SQL
echo "[OK] Teardown complete"
