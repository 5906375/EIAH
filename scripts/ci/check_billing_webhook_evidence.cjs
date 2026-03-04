#!/usr/bin/env node
const fs = require('node:fs');

const file = process.env.BILLING_WEBHOOK_EVIDENCE_PATH || 'ops/evidence/latest/billing-webhook-replay-attack.json';
if (!fs.existsSync(file)) {
  console.error(JSON.stringify({ ok: false, check: 'check:billing-webhook-evidence', message: 'missing evidence', file }, null, 2));
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
if (data.replayRejected !== true) {
  console.error(JSON.stringify({ ok: false, check: 'check:billing-webhook-evidence', message: 'replayRejected must be true', file }, null, 2));
  process.exit(1);
}
if (Number(data.duplicateSideEffects || 0) !== 0) {
  console.error(JSON.stringify({ ok: false, check: 'check:billing-webhook-evidence', message: 'duplicateSideEffects must be 0', file }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, check: 'check:billing-webhook-evidence', file }, null, 2));
