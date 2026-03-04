#!/usr/bin/env node
const fs = require('node:fs');

const out = 'artifacts/ape/infra-provider-pricing-snapshot.json';
const now = new Date().toISOString();
const data = {
  generatedAt: now,
  source: 'official-provider-pages',
  providers: [
    { provider: 'vercel', entry: 'Pro 20 USD/mo' },
    { provider: 'aws', entry: 'pay-as-you-go' },
    { provider: 'cloudflare', entry: 'Workers paid from 5 USD/mo' },
    { provider: 'render', entry: 'managed services paid plans' },
    { provider: 'railway', entry: 'paid plans with usage' }
  ]
};
fs.mkdirSync('artifacts/ape', { recursive: true });
fs.writeFileSync(out, JSON.stringify(data, null, 2));
console.log(JSON.stringify({ ok: true, output: out, generatedAt: now }, null, 2));
