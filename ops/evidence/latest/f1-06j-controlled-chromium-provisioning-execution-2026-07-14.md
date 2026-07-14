# F1.6j — Controlled Chromium Provisioning Execution

## Status

parcial

## Objetivo

Executar o mesmo smoke mobile F1 em runner Docker dedicado com Chromium provisionado, sem contaminar o servico `eiah-web`, sem CI e sem alterar UI, runtime, engine, `apps/**`, `packages/**` ou workflows.

## Branch

- `test/f1-6j-controlled-chromium-provisioning`

## Fontes lidas

- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docker-compose.dev.yml`
- `scripts/smoke-f1-4-front-door-mobile.mjs`
- `ops/evidence/latest/f1-06g-front-door-mobile-chromium-sandbox-validation-2026-07-14.md`
- `ops/evidence/latest/f1-06h-controlled-browser-smoke-environment-2026-07-14.md`
- `ops/evidence/latest/f1-06i-chromium-provisioning-strategy-2026-07-14.md`

## Contexto herdado

- F1.6g: host local bloqueado em `ENV_SANDBOX_BLOCKED`.
- F1.6h: `eiah-web` bloqueado em `CHROMIUM_BINARY_MISSING`.
- F1.6i: recomendou runner dedicado, separado do `eiah-web`, com Chromium provisionado.
- O smoke obrigatorio permanece `scripts/smoke-f1-4-front-door-mobile.mjs`.
- Invariantes preservadas:
  - `runnerImport="formal_dependency:playwright"`
  - `fallbackUsed=false`

## Ambiente controlado escolhido

Runner efemero:
- imagem local existente: `node:22-bookworm`
- sem `docker build`
- sem `docker push`
- sem alteracao do `eiah-web`
- repositório montado read-only em `/app`
- cache de browsers isolado em `/tmp/eiah-playwright-cache`
- rede reaproveitada via `--network container:eiah-web` para usar `http://127.0.0.1:5173` sem mexer em `allowedHosts`

## Comandos executados

### 1. Inventario Docker local
```bash
docker ps
docker image ls
docker inspect eiah-web --format '{{json .Mounts}}'
```

Constatacao:
- nao havia imagem Playwright pronta no host;
- o `eiah-web` monta o monorepo em `/app` e usa volume separado para `/pnpm/store`.

### 2. Validacao de rota antes do provisioning
```bash
docker run --rm --network container:eiah-web \
  -v /home/jusall/projects/EIAH_BUILDER:/app:ro \
  -w /app \
  node:22-bookworm \
  bash -lc "node -e \"fetch('http://127.0.0.1:5173/app/imob/chat').then(async r=>{console.log('route_status',r.status); const t=await r.text(); console.log(t.slice(0,160)); process.exit(r.ok?0:1)}).catch(e=>{console.error('route_fetch_error',e.message);process.exit(1)})\""
```

Resultado:
- `route_status 200`
- front door acessivel a partir do runner dedicado sem mudar `allowedHosts`.

### 3. Provisioning controlado do Chromium + execucao do smoke
```bash
mkdir -p /tmp/eiah-playwright-cache

docker run --rm \
  --network container:eiah-web \
  --ipc=host \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  -e F1_FRONT_DOOR_BASE_URL=http://127.0.0.1:5173 \
  -v /home/jusall/projects/EIAH_BUILDER:/app:ro \
  -v /tmp/eiah-playwright-cache:/ms-playwright:rw \
  -w /app \
  node:22-bookworm \
  bash -lc "node -v; corepack enable >/dev/null 2>&1 || true; pnpm -v; /app/node_modules/.bin/playwright install chromium; node scripts/smoke-f1-4-front-door-mobile.mjs"
```

## Metadados observados

- `nodeVersion`: `v22.23.1`
- `pnpmVersion`: `10.12.4`
- `playwrightVersion`: `1.61.1`
- `runnerImport`: `formal_dependency:playwright`
- `fallbackUsed`: `false`
- `baseUrl`: `http://127.0.0.1:5173`
- `route`: `/app/imob/chat`
- `exitCode`: `1`

## Provisioning observado

Downloads realizados no cache isolado:
- `Chrome for Testing 149.0.7827.55 (playwright chromium v1228)`
- `FFmpeg (playwright ffmpeg v1011)`
- `Chrome Headless Shell 149.0.7827.55 (playwright chromium-headless-shell v1228)`

Destino:
- `/tmp/eiah-playwright-cache`

## Resultado do smoke

Saida JSON relevante:

```json
{
  "ok": false,
  "check": "f1-4-front-door-mobile-smoke",
  "classification": "UNKNOWN_CHROMIUM_LAUNCH_FAILURE",
  "runnerImport": "formal_dependency:playwright",
  "fallbackUsed": false,
  "nodeVersion": "v22.23.1",
  "playwrightVersion": "1.61.1",
  "baseUrl": "http://127.0.0.1:5173",
  "route": "/app/imob/chat",
  "viewports": [],
  "reasons": [
    "browserType.launch: Target page, context or browser has been closed"
  ]
}
```

Trecho determinante do erro:

```text
/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell:
error while loading shared libraries: libnspr4.so:
cannot open shared object file: No such file or directory
```

## Classificacao final

- `parcial`
- `classification`: `UNKNOWN_CHROMIUM_LAUNCH_FAILURE`

Leitura tecnica conservadora:
- o provisioning do browser funcionou;
- a conectividade com o front door funcionou;
- o runner formal do Playwright funcionou;
- o bloqueio remanescente esta na imagem base `node:22-bookworm`, que nao possui pelo menos uma dependencia nativa exigida pelo Chromium (`libnspr4.so`);
- esta etapa nao instala bibliotecas de sistema nem muda a imagem, porque isso ampliaria escopo para ambiente/base image.

## Diferenca em relacao a F1.6g/F1.6h

| Etapa | Ambiente | Resultado | Classificacao |
| --- | --- | --- | --- |
| F1.6g | host local | Chromium crash no launch | `ENV_SANDBOX_BLOCKED` |
| F1.6h | `eiah-web` | browser nao provisionado | `CHROMIUM_BINARY_MISSING` |
| F1.6j | runner dedicado `node:22-bookworm` + Chromium provisionado | browser provisionado, mas launch falha por dependencia nativa ausente | `UNKNOWN_CHROMIUM_LAUNCH_FAILURE` |

## Arquivos alterados

- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f1-06j-controlled-chromium-provisioning-execution-2026-07-14.md`

## Prova de nao escopo

Confirmado:
- sem alteracao em `ChatAgentLauncher`
- sem alteracao em runtime
- sem alteracao em engine
- sem alteracao em `apps/**`
- sem alteracao em `packages/**`
- sem alteracao em workflows/CI
- sem alteracao em `release.yml`
- sem `docker build`
- sem `docker push`
- sem `registry login`
- sem `publish`
- sem `secrets`
- sem `tags/releases`
- sem avancar F2/F3
- sem contaminar o servico `eiah-web` com browser instalado

## Proxima acao recomendada

Se houver nova autorizacao operacional, a proxima etapa segura nao e mexer no script nem no `eiah-web`; e sim escolher uma base image local/externa que ja inclua as dependencias nativas do Chromium ou um runner manual dedicado com stack Playwright oficial.

## Status final

parcial
