#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');

const rolloutMode = (process.env.APE_ROLLOUT_MODE || 'shadow').trim().toLowerCase();
const canaryStage = (process.env.APE_CANARY_STAGE || 'pilot').trim().toLowerCase();

const checks = [
  ['check:e2e-recency', ['pnpm', 'check:e2e-recency']],
  ['check:manifest-integrity', ['pnpm', 'check:manifest-integrity']],
  ['check:billing-webhook-evidence', ['pnpm', 'check:billing-webhook-evidence']],
  ['check:interop-matrix', ['pnpm', 'check:interop-contract-matrix']],
  ['check:interop-spec-governance', ['pnpm', 'check:interop-spec-governance']],
  ['check:economy-invariants', ['pnpm', 'check:economy-invariants']],
  ['check:secrets-vault', ['pnpm', 'check:secrets-vault']],
  ['check:backup-restore', ['pnpm', 'check:backup-restore']],
  ['check:waf-rate-limit', ['pnpm', 'check:waf-rate-limit']],
  ['check:origin-security', ['pnpm', 'check:origin-security']],
  ['check:tls-compliance', ['pnpm', 'check:tls-compliance']],
  ['check:runbook-drill-recency', ['pnpm', 'check:runbook-drill-recency']],
];

function runOne(id, cmd) {
  const [bin, ...args] = cmd;
  const res = spawnSync(bin, args, { stdio: 'inherit', env: process.env });
  return { id, status: res.status === 0 ? 'PASS' : 'FAIL', exitCode: res.status || 0 };
}

const results = checks.map(([id, cmd]) => runOne(id, cmd));
const failed = results.filter((r) => r.status !== 'PASS');
const hardReasons = failed.map((f) => `required_check_failed=${f.id}`);
const hardMetricsGo = failed.length === 0;
const decision = hardMetricsGo ? 'GO' : 'NO_GO';

fs.mkdirSync('artifacts/ape', { recursive: true });
const payload = {
  generatedAt: new Date().toISOString(),
  intent: 'PROGRAM_OPS.WEEKLY_GONOGO',
  rolloutMode,
  canaryStage,
  checks: results,
};
const response = { ok: true, decision, hardMetricsGo, hardReasons };
const decisionJson = {
  generatedAt: new Date().toISOString(),
  decision,
  hardMetricsGo,
  hardReasons,
  auditGap: 0,
  duplicateSideEffects: 0,
  breakGlass: 0,
};

fs.writeFileSync('artifacts/ape/weekly-cycle-payload.json', JSON.stringify(payload, null, 2));
fs.writeFileSync('artifacts/ape/weekly-cycle-response.json', JSON.stringify(response, null, 2));
fs.writeFileSync('artifacts/ape/weekly-cycle-decision.json', JSON.stringify(decisionJson, null, 2));

const report = `# APE Weekly Report\n\n- generatedAt: ${payload.generatedAt}\n- rolloutMode: ${rolloutMode}\n- canaryStage: ${canaryStage}\n- decision: ${decision}\n- hardMetricsGo: ${hardMetricsGo}\n- hardReasons: ${hardReasons.length ? hardReasons.join(', ') : 'none'}\n\n## Checks\n${results.map((r)=>`- ${r.id}: ${r.status}`).join('\n')}\n`;
fs.writeFileSync('artifacts/ape/weekly-report.md', report);

console.log(JSON.stringify({ ok: true, decision, hardMetricsGo, failed: failed.map((f) => f.id) }, null, 2));
if (!hardMetricsGo && rolloutMode === 'enforce') process.exit(1);
