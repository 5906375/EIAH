#!/usr/bin/env bash
set -euo pipefail

OWNER="${OWNER:-}"
REPO="${REPO:-}"
ENV_NAME="${ENV_NAME:-staging}"
WORKFLOW_FILE="${WORKFLOW_FILE:-ape-weekly.yml}"

for v in OWNER REPO APE_API_BASE_URL APE_API_BEARER_TOKEN APE_TENANT_ID APE_WORKSPACE_ID; do
  if [[ -z "${!v:-}" ]]; then
    echo "Variavel obrigatoria ausente: ${v}"
    exit 1
  fi
done

APE_WRITE_LABEL="${APE_WRITE_LABEL:-ops:release}"

printf "%s" "$APE_API_BASE_URL" | gh secret set APE_API_BASE_URL --repo "${OWNER}/${REPO}" --env "${ENV_NAME}" --body -
printf "%s" "$APE_API_BEARER_TOKEN" | gh secret set APE_API_BEARER_TOKEN --repo "${OWNER}/${REPO}" --env "${ENV_NAME}" --body -
printf "%s" "$APE_TENANT_ID" | gh secret set APE_TENANT_ID --repo "${OWNER}/${REPO}" --env "${ENV_NAME}" --body -
printf "%s" "$APE_WORKSPACE_ID" | gh secret set APE_WORKSPACE_ID --repo "${OWNER}/${REPO}" --env "${ENV_NAME}" --body -
printf "%s" "$APE_WRITE_LABEL" | gh secret set APE_WRITE_LABEL --repo "${OWNER}/${REPO}" --env "${ENV_NAME}" --body -

gh workflow run "${WORKFLOW_FILE}" --repo "${OWNER}/${REPO}" -f rollout_mode=shadow -f canary_stage=pilot -f break_glass_enabled=false
sleep 3
gh workflow run "${WORKFLOW_FILE}" --repo "${OWNER}/${REPO}" -f rollout_mode=shadow -f canary_stage=pilot -f break_glass_enabled=false

echo "Execucoes disparadas."
