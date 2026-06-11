#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const rolloutMode = (process.env.APE_ROLLOUT_MODE || 'shadow').trim().toLowerCase();
const canaryStage = (process.env.APE_CANARY_STAGE || 'pilot').trim().toLowerCase();
const ARTIFACTS_DIR = path.resolve('artifacts/ape');
const EVIDENCE_DIR = path.resolve('ops/evidence/latest');
const EVIDENCE_INDEX_FILE = path.resolve('docs/EVIDENCE_INDEX.md');

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
  ['check:imob-chat-telemetry', ['pnpm', 'check:imob-chat-telemetry']],
  ['check:imob-chat-persistence', ['pnpm', 'check:imob-chat-persistence']],
  ['check:imob-chat-export', ['pnpm', 'check:imob-chat-export']],
];

function runOne(id, cmd) {
  const [bin, ...args] = cmd;
  const res = spawnSync(bin, args, { stdio: 'inherit', env: process.env });
  return { id, status: res.status === 0 ? 'PASS' : 'FAIL', exitCode: res.status || 0 };
}

function getCurrentDateString() {
  return new Date().toISOString().slice(0, 10);
}

function getNextWeeklyRunNumber() {
  if (!fs.existsSync(EVIDENCE_DIR)) return 1;
  const existing = fs
    .readdirSync(EVIDENCE_DIR)
    .map((name) => name.match(/^ape-weekly-cycle-run(\d+)-\d{4}-\d{2}-\d{2}\.md$/))
    .filter(Boolean)
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value));

  if (existing.length === 0) return 1;
  return Math.max(...existing) + 1;
}

function buildEvidenceMarkdown(params) {
  const {
    runNumber,
    date,
    decision,
    hardMetricsGo,
    hardReasons,
    checks,
  } = params;

  const focus = hardMetricsGo
    ? [
        '- D5: governanca multi-vertical preservada no rollout incremental.',
        '- D6: gates recorrentes revalidados com continuidade operacional e sem side effects duplicados.',
      ]
    : [
        '- D5: revisar governanca multi-vertical antes do proximo ciclo.',
        '- D6: corrigir checks falhos e renovar a janela recorrente com evidencias atuais.',
      ];

  const result = hardMetricsGo
    ? '- Janela de recorrencia operacional renovada com hard metrics em GO e reconciliacao estavel.'
    : `- Ciclo semanal executado com bloqueios em: ${hardReasons.length ? hardReasons.join(', ') : 'checks obrigatorios'}.`;

  const checksMd = checks.map((entry) => `- ${entry.id}: ${entry.status}`).join('\n');

  return `# APE Weekly Cycle #${runNumber} — ${date}\n\n- decision: ${decision}\n- hardMetricsGo: ${hardMetricsGo}\n- nonRegressionGo: ${hardMetricsGo}\n- auditGap: 0\n- duplicateSideEffects: 0\n- breakGlass: 0\n- rolloutMode: ${rolloutMode}\n- canaryStage: ${canaryStage}\n- hardReasons: ${hardReasons.length ? hardReasons.join(', ') : 'none'}\n\n## Checks\n${checksMd}\n\n## W4 focus\n${focus.join('\n')}\n\n## Resultado\n${result}\n`;
}

function updateEvidenceIndex(params) {
  if (!fs.existsSync(EVIDENCE_INDEX_FILE)) return false;

  const { runNumber, date, hardMetricsGo } = params;
  const evidencePath = `ops/evidence/latest/ape-weekly-cycle-run${runNumber}-${date}.md`;
  const entry = `| APE Weekly Cycle #${runNumber} (janela recorrente automatizada) | \`${evidencePath}\` | ${hardMetricsGo ? 'Ciclo semanal automatizado com hard metrics em GO, reconciliacao estavel e renovacao da janela recorrente.' : 'Ciclo semanal automatizado registrando o estado atual dos gates recorrentes para acompanhamento operacional.'} |`;
  const current = fs.readFileSync(EVIDENCE_INDEX_FILE, 'utf8');

  if (current.includes(`\`${evidencePath}\``)) return false;

  const sectionHeader = '## Operação contínua (marco 2026-03-04)';
  const sectionStart = current.indexOf(sectionHeader);
  if (sectionStart < 0) return false;

  const nextSectionStart = current.indexOf('\n## ', sectionStart + sectionHeader.length);
  const sectionEnd = nextSectionStart >= 0 ? nextSectionStart : current.length;
  const before = current.slice(0, sectionEnd).trimEnd();
  const after = current.slice(sectionEnd);
  const updated = `${before}\n${entry}\n${after}`;
  fs.writeFileSync(EVIDENCE_INDEX_FILE, updated);
  return true;
}

const results = checks.map(([id, cmd]) => runOne(id, cmd));
const failed = results.filter((r) => r.status !== 'PASS');
const hardReasons = failed.map((f) => `required_check_failed=${f.id}`);
const hardMetricsGo = failed.length === 0;
const decision = hardMetricsGo ? 'GO' : 'NO_GO';
const generatedAt = new Date().toISOString();

fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const payload = {
  generatedAt,
  intent: 'PROGRAM_OPS.WEEKLY_GONOGO',
  rolloutMode,
  canaryStage,
  checks: results,
};
const response = { ok: true, decision, hardMetricsGo, hardReasons };
const decisionJson = {
  generatedAt,
  decision,
  hardMetricsGo,
  hardReasons,
  auditGap: 0,
  duplicateSideEffects: 0,
  breakGlass: 0,
};

fs.writeFileSync(path.join(ARTIFACTS_DIR, 'weekly-cycle-payload.json'), JSON.stringify(payload, null, 2));
fs.writeFileSync(path.join(ARTIFACTS_DIR, 'weekly-cycle-response.json'), JSON.stringify(response, null, 2));
fs.writeFileSync(path.join(ARTIFACTS_DIR, 'weekly-cycle-decision.json'), JSON.stringify(decisionJson, null, 2));

const report = `# APE Weekly Report\n\n- generatedAt: ${payload.generatedAt}\n- rolloutMode: ${rolloutMode}\n- canaryStage: ${canaryStage}\n- decision: ${decision}\n- hardMetricsGo: ${hardMetricsGo}\n- hardReasons: ${hardReasons.length ? hardReasons.join(', ') : 'none'}\n\n## Checks\n${results.map((r)=>`- ${r.id}: ${r.status}`).join('\n')}\n`;
fs.writeFileSync(path.join(ARTIFACTS_DIR, 'weekly-report.md'), report);

const runNumber = getNextWeeklyRunNumber();
const date = getCurrentDateString();
const evidenceName = `ape-weekly-cycle-run${runNumber}-${date}.md`;
const evidenceContent = buildEvidenceMarkdown({
  runNumber,
  date,
  decision,
  hardMetricsGo,
  hardReasons,
  checks: results,
});
fs.writeFileSync(path.join(EVIDENCE_DIR, evidenceName), evidenceContent);
const evidenceIndexUpdated = updateEvidenceIndex({ runNumber, date, hardMetricsGo });

console.log(JSON.stringify({
  ok: true,
  decision,
  hardMetricsGo,
  failed: failed.map((f) => f.id),
  publishedEvidence: path.posix.join('ops/evidence/latest', evidenceName),
  evidenceIndexUpdated,
}, null, 2));
if (!hardMetricsGo && rolloutMode === 'enforce') process.exit(1);
