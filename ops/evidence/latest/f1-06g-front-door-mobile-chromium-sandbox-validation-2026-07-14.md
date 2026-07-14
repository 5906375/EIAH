# F1.6g — Front Door Mobile Chromium Sandbox Validation

## Objetivo
Validar o bloqueio remanescente de launch Chromium/sandbox do smoke mobile local/manual apos a F1.6f, mantendo `fallbackUsed=false`, `import('playwright')` formal e sem promover CI.

## Arquivos lidos
- `CODEX.md`
- `IA_EIAH.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f1-04-front-door-mobile-recurring-smoke-minimal-implementation-2026-07-14.md`
- `ops/evidence/latest/f1-05-front-door-mobile-smoke-reproducibility-ci-readiness-2026-07-14.md`
- `ops/evidence/latest/f1-06e-relink-stabilization-after-host-ownership-repair-2026-07-14.md`
- `ops/evidence/latest/f1-06f-playwright-runner-normalization-after-relink-stabilization-2026-07-14.md`
- `scripts/smoke-f1-4-front-door-mobile.mjs`

## Contexto F1.6e/F1.6f
- F1.6e restaurou `node_modules/.modules.yaml` e estabilizou `pnpm install --ignore-scripts`.
- F1.6f formalizou `playwright` como devDependency root e removeu o fallback fragil em `~/.npm/_npx`.
- O bloqueio remanescente estava concentrado no launch do Chromium no host atual.

## Comandos executados

### Baseline do ambiente
```bash
node -v
pnpm -v
node -e "const p=require('./node_modules/playwright/package.json'); console.log('playwright_version', p.version)"
git status --short
```

Resultado:
- `node`: `v22.17.1`
- `pnpm`: `10.12.4`
- `playwright_version`: `1.61.1`
- worktree limpo antes da F1.6g.

### Smoke exatamente como documentado, sem alteracao inicial
```bash
node scripts/smoke-f1-4-front-door-mobile.mjs
```

Resultado antes:
- `runnerImport`: `formal_dependency:playwright`
- `fallbackUsed`: `false`
- `viewports`: `[]`
- erro exato:

```text
browserType.launch: Target page, context or browser has been closed
[FATAL:content/browser/sandbox_host_linux.cc:41] Check failed: . shutdown: Operation not permitted (1)
```

### Diagnostico ad hoc de launch
```bash
node -e "import('playwright').then(async({chromium})=>{try{const browser=await chromium.launch({headless:true,chromiumSandbox:false});console.log('launch_ok:chromiumSandbox_false');await browser.close();}catch(e){console.error('launch_fail:chromiumSandbox_false');console.error(e.message);process.exit(1)}})"

node -e "import('playwright').then(async({chromium})=>{try{const browser=await chromium.launch({headless:true,chromiumSandbox:false,args:['--disable-setuid-sandbox','--no-zygote','--single-process']});console.log('launch_ok:reduced_sandbox_args');await browser.close();}catch(e){console.error('launch_fail:reduced_sandbox_args');console.error(e.message);process.exit(1)}})"

node -e "import('playwright').then(async({chromium})=>{try{const browser=await chromium.launch({headless:true,chromiumSandbox:false,args:['--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote','--single-process']});console.log('launch_ok:extended_args');await browser.close();}catch(e){console.error('launch_fail:extended_args');console.error(e.message);process.exit(1)}})"
```

Resultado:
- todas as tentativas falharam com o mesmo crash em `sandbox_host_linux.cc:41`;
- nenhuma variacao pequena de flags estabilizou o launch;
- isso reclassifica o problema como bloqueio do ambiente, nao do runner nem de browser missing.

## Ajuste aplicado
Arquivo alterado:
- `scripts/smoke-f1-4-front-door-mobile.mjs`

Mudanca minima:
- adiciona classificacao explicita do bloqueio no JSON:
  - `PLAYWRIGHT_IMPORT_ERROR`
  - `CHROMIUM_BINARY_MISSING`
  - `ENV_SANDBOX_BLOCKED`
  - `HOST_PERMISSION_BLOCKED`
  - `UNKNOWN_CHROMIUM_LAUNCH_FAILURE`
  - `PASS`
- adiciona metadados de execucao:
  - `nodeVersion`
  - `playwrightVersion`

Justificativa:
- nenhuma flag pequena resolveu o launch;
- o proximo melhor comportamento fail-closed e tornar o bloqueio explicito e deterministico no relatorio do smoke.

## Resultado apos ajuste
Comando:
```bash
node scripts/smoke-f1-4-front-door-mobile.mjs
```

Saida relevante:
```json
{
  "ok": false,
  "check": "f1-4-front-door-mobile-smoke",
  "classification": "ENV_SANDBOX_BLOCKED",
  "runnerImport": "formal_dependency:playwright",
  "fallbackUsed": false,
  "nodeVersion": "v22.17.1",
  "playwrightVersion": "1.61.1",
  "baseUrl": "http://127.0.0.1:5173",
  "route": "/app/imob/chat",
  "viewports": []
}
```

## Classificacao final
- `ENV_SANDBOX_BLOCKED`

Justificativa:
- o runner formal funciona;
- o browser binario existe e tenta launch;
- o crash persiste mesmo com `chromiumSandbox:false` e flags locais extras;
- o erro central continua `sandbox_host_linux.cc:41` + `Operation not permitted`.

## Arquivos alterados
- `scripts/smoke-f1-4-front-door-mobile.mjs`
- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f1-06g-front-door-mobile-chromium-sandbox-validation-2026-07-14.md`

## Prova de nao escopo
Confirmado:
- sem CI promotion;
- sem publish;
- sem secrets;
- sem registry login;
- sem Docker/GHCR push;
- sem tags/releases;
- sem rollback real;
- sem HITL real;
- sem side effects externos;
- sem alteracao em workflows;
- sem alteracao em `ChatAgentLauncher`;
- sem alteracao em runtime/core/engine/APIs/contracts;
- sem alteracao em `apps/**`;
- sem alteracao em `packages/**`.

## Checks seguros executados
- `node scripts/smoke-f1-4-front-door-mobile.mjs`
- `pnpm check:evidence-index`
- `pnpm check:docs-link-integrity`
- `git diff --check`
- `git diff -- .github/workflows apps packages`

## Status final
- `parcial`

## Conclusao
A F1.6g nao tornou o launch do Chromium verde neste host, mas estabilizou a validacao manual/local do smoke ao:
- manter `fallbackUsed=false`;
- manter resolucao formal via `playwright`;
- provar que o bloqueio nao e `CHROMIUM_BINARY_MISSING` nem `PLAYWRIGHT_IMPORT_ERROR`;
- classificar explicitamente o erro como `ENV_SANDBOX_BLOCKED` com saida JSON deterministica e fail-closed.
