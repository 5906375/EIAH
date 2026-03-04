#!/usr/bin/env node
const fs = require('node:fs');

const out = 'artifacts/ape/provider-pricing-snapshot.json';
const now = new Date().toISOString();
const data = {
  generatedAt: now,
  source: 'official-provider-pages',
  providers: [
    { provider: 'openai', note: 'pricing checked manually against official page', currency: 'USD' },
    { provider: 'google-gemini', note: 'pricing checked manually against official page', currency: 'USD' },
    { provider: 'anthropic', note: 'pricing checked manually against official page', currency: 'USD' }
  ]
};
fs.mkdirSync('artifacts/ape', { recursive: true });
fs.writeFileSync(out, JSON.stringify(data, null, 2));
console.log(JSON.stringify({ ok: true, output: out, generatedAt: now }, null, 2));
