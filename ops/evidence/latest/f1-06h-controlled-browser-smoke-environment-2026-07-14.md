# F1.6h — Controlled Browser-Smoke Environment

## Objetivo
Validar o mesmo smoke mobile F1.4/F1.6g em um ambiente controlado compativel com Chromium, sem alterar UI, runtime, engine, `apps/**`, `packages/**` ou workflows CI.

## Arquivos lidos
- `CODEX.md`
- `IA_EIAH.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docker-compose.dev.yml`
- `ops/evidence/latest/f1-04-front-door-mobile-recurring-smoke-minimal-implementation-2026-07-14.md`
- `ops/evidence/latest/f1-05-front-door-mobile-smoke-reproducibility-ci-readiness-2026-07-14.md`
- `ops/evidence/latest/f1-06e-relink-stabilization-after-host-ownership-repair-2026-07-14.md`
- `ops/evidence/latest/f1-06f-playwright-runner-normalization-after-relink-stabilization-2026-07-14.md`
- `ops/evidence/latest/f1-06g-front-door-mobile-chromium-sandbox-validation-2026-07-14.md`
- `scripts/smoke-f1-4-front-door-mobile.mjs`

## Contexto herdado
- F1.6f formalizou `playwright` como devDependency root e removeu o fallback fragil em `~/.npm/_npx`.
- F1.6g provou que o host atual permanece bloqueado em launch Chromium e classificou o erro como `ENV_SANDBOX_BLOCKED`.
- F1.6h nao muda o script nem tenta promover CI; apenas valida o mesmo smoke em ambiente controlado ja existente.

## Ambiente controlado identificado
Origem:
- `docker-compose.dev.yml`
- evidencias anteriores de browser smoke em Docker (`phase9-1-1` e `phase9-2`)

Container reutilizado:
- `eiah-web`
- imagem: `node:20-bookworm`
- `working_dir`: `/app`
- Vite exposto em `5173`

## Comandos executados

### Inspecao do ambiente controlado
```bash
docker exec eiah-web sh -lc 'pwd && node -v && pnpm -v && ls -la /app/scripts/smoke-f1-4-front-door-mobile.mjs && node -e "const p=require(\"/app/node_modules/playwright/package.json\"); console.log(p.version)"'
```

Resultado:
- `pwd`: `/app`
- `nodeVersion`: `v20.19.6`
- `pnpmVersion`: `10.12.4`
- `playwrightVersion`: `1.61.1`
- script presente em `/app/scripts/smoke-f1-4-front-door-mobile.mjs`

### Execucao do mesmo smoke no ambiente controlado
```bash
docker exec eiah-web sh -lc 'cd /app && node scripts/smoke-f1-4-front-door-mobile.mjs'
```

Exit code:
- `1`

Saida relevante:
```json
{
  "ok": false,
  "check": "f1-4-front-door-mobile-smoke",
  "classification": "CHROMIUM_BINARY_MISSING",
  "runnerImport": "formal_dependency:playwright",
  "fallbackUsed": false,
  "nodeVersion": "v20.19.6",
  "playwrightVersion": "1.61.1",
  "baseUrl": "http://127.0.0.1:5173",
  "route": "/app/imob/chat",
  "viewports": [],
  "reasons": [
    "browserType.launch: Executable doesn't exist at /root/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell"
  ]
}
```

## Classificacao do resultado
- `parcial`
- classificacao do ambiente controlado: `CHROMIUM_BINARY_MISSING`

## Comparacao host x ambiente controlado
| Ambiente | nodeVersion | playwrightVersion | fallbackUsed | Resultado |
| --- | --- | --- | --- | --- |
| Host local (F1.6g) | `v22.17.1` | `1.61.1` | `false` | `ENV_SANDBOX_BLOCKED` |
| Container `eiah-web` (F1.6h) | `v20.19.6` | `1.61.1` | `false` | `CHROMIUM_BINARY_MISSING` |

Leitura conservadora:
- o runner formal funciona nos dois ambientes;
- no host, o bloqueio e de sandbox/permissao do Chromium;
- no container controlado existente, o bloqueio ocorre antes, por ausencia do binario Chromium no cache do Playwright;
- nao ha base para declarar smoke verde neste PR sem instalar browser no container, o que permanece fora do escopo autorizado.

## Alternativas documentadas, nao executadas
- runner manual dedicado com cache de browser previamente provisionado;
- container manual derivado de ambiente compatível com Chromium e Playwright ja instalado;
- futura validacao controlada separada, ainda sem CI, caso haja aprovacao explicita para provisionar browser no ambiente manual.

Essas alternativas nao foram executadas aqui para preservar:
- ausencia de install global de browser;
- ausencia de alteracao em workflows;
- ausencia de promocao a CI;
- ausencia de side effects externos.

## Arquivos alterados
- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f1-06h-controlled-browser-smoke-environment-2026-07-14.md`

## Prova de nao escopo
Confirmado:
- sem alteracao em `ChatAgentLauncher`;
- sem alteracao em runtime;
- sem alteracao em engine;
- sem alteracao em `apps/**`;
- sem alteracao em `packages/**`;
- sem alteracao em workflows CI;
- sem alteracao em `release.yml`;
- sem install global de browser;
- sem secrets;
- sem publish;
- sem registry login;
- sem Docker/GHCR push;
- sem tags/releases;
- sem rollback real;
- sem HITL real;
- sem side effects externos.

## Checks seguros executados
- `docker exec eiah-web sh -lc 'pwd && node -v && pnpm -v && ls -la /app/scripts/smoke-f1-4-front-door-mobile.mjs && node -e "const p=require(\"/app/node_modules/playwright/package.json\"); console.log(p.version)"'`
- `docker exec eiah-web sh -lc 'cd /app && node scripts/smoke-f1-4-front-door-mobile.mjs'`
- `pnpm check:evidence-index`
- `pnpm check:docs-link-integrity`
- `git diff --check`

## Status final
- `parcial`

## Conclusao
F1.6h ampliou a evidencia do smoke mobile para um ambiente controlado real ja existente (`eiah-web`), sem mudar o script nem o escopo do PR. O resultado permaneceu fail-closed: o host segue bloqueado por `ENV_SANDBOX_BLOCKED`, e o container controlado revelou um bloqueio distinto e mais precoce, `CHROMIUM_BINARY_MISSING`. Portanto, a etapa fica `parcial`, com validacao real de ambiente controlado, mas sem smoke verde e sem promocao para CI.
