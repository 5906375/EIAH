# F1.6l — Controlled Official Playwright Runner Execution

## Status

evidenciado

## Objetivo

Executar o mesmo smoke mobile F1 em runner dedicado usando imagem oficial Playwright compativel com `playwright@1.61.1`, conforme recomendado em F1.6k, sem alterar UI, runtime, engine, `apps/**`, `packages/**`, workflows ou `eiah-web`.

## Fontes lidas

- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f1-06j-controlled-chromium-provisioning-execution-2026-07-14.md`
- `ops/evidence/latest/f1-06k-dedicated-playwright-runtime-base-image-selection-2026-07-14.md`
- `scripts/smoke-f1-4-front-door-mobile.mjs`

## Tag escolhida

Imagem oficial Playwright usada:

- `mcr.microsoft.com/playwright:v1.61.1-noble`

Justificativa:
- compativel com `playwrightVersion=1.61.1`;
- segue a recomendacao de F1.6k;
- inclui runtime/browser stack oficial da propria Playwright;
- evita `apt-get`, `playwright install-deps`, `docker build` e contaminacao do `eiah-web`.

## Inventario Docker local antes da execucao

Comando:
```bash
docker image ls
```

Constatacao:
- a imagem oficial Playwright nao existia localmente antes da aprovacao explicita do `docker pull`.

## Pull autorizado e controlado

Comando:
```bash
docker pull mcr.microsoft.com/playwright:v1.61.1-noble
```

Resultado:
- imagem registrada localmente para uso unico na F1.6l

## Runner dedicado utilizado

Caracteristicas:
- runner efemero
- imagem: `mcr.microsoft.com/playwright:v1.61.1-noble`
- repositório montado read-only em `/app`
- rede: `--network container:eiah-web`
- `--ipc=host`
- `F1_FRONT_DOOR_BASE_URL=http://127.0.0.1:5173`

## Comando executado

```bash
docker run --rm \
  --network container:eiah-web \
  --ipc=host \
  -e F1_FRONT_DOOR_BASE_URL=http://127.0.0.1:5173 \
  -v /home/jusall/projects/EIAH_BUILDER:/app:ro \
  -w /app \
  mcr.microsoft.com/playwright:v1.61.1-noble \
  bash -lc "node -v; pnpm -v || true; node -e \"fetch('http://127.0.0.1:5173/app/imob/chat').then(async r=>{console.log('route_status',r.status); const t=await r.text(); console.log(t.slice(0,160)); process.exit(r.ok?0:1)}).catch(e=>{console.error('route_fetch_error',e.message);process.exit(1)})\"; node scripts/smoke-f1-4-front-door-mobile.mjs"
```

## Metadados observados

- `nodeVersion`: `v24.17.0`
- `pnpm`: ausente na imagem (`bash: pnpm: command not found`)
- `playwrightVersion`: `1.61.1`
- `runnerImport`: `formal_dependency:playwright`
- `fallbackUsed`: `false`
- `baseUrl`: `http://127.0.0.1:5173`
- `route`: `/app/imob/chat`
- `route_status`: `200`
- `exitCode`: `0`

## Resultado do smoke

Saida JSON completa relevante:

```json
{
  "ok": true,
  "check": "f1-4-front-door-mobile-smoke",
  "classification": "PASS",
  "runnerImport": "formal_dependency:playwright",
  "fallbackUsed": false,
  "nodeVersion": "v24.17.0",
  "playwrightVersion": "1.61.1",
  "baseUrl": "http://127.0.0.1:5173",
  "route": "/app/imob/chat",
  "viewports": [
    {
      "name": "mobile-360",
      "width": 360,
      "height": 740,
      "pageUrl": "http://127.0.0.1:5173/app/imob/chat",
      "clientWidth": 360,
      "scrollWidth": 360,
      "horizontalOverflow": false,
      "composerVisible": true,
      "selectorPresent": true,
      "selectorOverflow": false,
      "toggleVisible": true,
      "toggleOpenOk": true,
      "hasContextBadge": true,
      "hasPilotCopy": false,
      "hasMainContent": true,
      "ok": true,
      "reasons": []
    },
    {
      "name": "mobile-390",
      "width": 390,
      "height": 844,
      "pageUrl": "http://127.0.0.1:5173/app/imob/chat",
      "clientWidth": 390,
      "scrollWidth": 390,
      "horizontalOverflow": false,
      "composerVisible": true,
      "selectorPresent": true,
      "selectorOverflow": false,
      "toggleVisible": true,
      "toggleOpenOk": true,
      "hasContextBadge": true,
      "hasPilotCopy": false,
      "hasMainContent": true,
      "ok": true,
      "reasons": []
    },
    {
      "name": "tablet-768",
      "width": 768,
      "height": 1024,
      "pageUrl": "http://127.0.0.1:5173/app/imob/chat",
      "clientWidth": 768,
      "scrollWidth": 768,
      "horizontalOverflow": false,
      "composerVisible": true,
      "selectorPresent": true,
      "selectorOverflow": false,
      "toggleVisible": true,
      "toggleOpenOk": true,
      "hasContextBadge": true,
      "hasPilotCopy": false,
      "hasMainContent": true,
      "ok": true,
      "reasons": []
    },
    {
      "name": "tablet-1024",
      "width": 1024,
      "height": 768,
      "pageUrl": "http://127.0.0.1:5173/app/imob/chat",
      "clientWidth": 1024,
      "scrollWidth": 1024,
      "horizontalOverflow": false,
      "composerVisible": true,
      "selectorPresent": true,
      "selectorOverflow": false,
      "toggleVisible": true,
      "toggleOpenOk": true,
      "hasContextBadge": true,
      "hasPilotCopy": false,
      "hasMainContent": true,
      "ok": true,
      "reasons": []
    }
  ]
}
```

## Leitura tecnica

Conclusao:
- a imagem oficial Playwright resolve o bloqueio residual de F1.6j;
- o smoke passou em `360x740`, `390x844`, `768x1024` e `1024x768`;
- nao houve overflow horizontal;
- `composerVisible`, `selectorPresent`, `toggleVisible` e `toggleOpenOk` ficaram `true` em todas as viewports;
- o badge neutro `Contexto IMOB` permaneceu presente;
- `PILOTO CONTROLADO` permaneceu ausente;
- `runnerImport=formal_dependency:playwright` e `fallbackUsed=false` foram preservados.

## Arquivos alterados

- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f1-06l-controlled-official-playwright-runner-execution-2026-07-14.md`

## Prova de nao escopo

Confirmado:
- sem alteracao em `ChatAgentLauncher`
- sem alteracao em runtime
- sem alteracao em engine
- sem alteracao em `apps/**`
- sem alteracao em `packages/**`
- sem alteracao em workflows/CI
- sem alteracao em `release.yml`
- sem `apt-get`
- sem `playwright install-deps`
- sem `docker build`
- sem `docker push`
- sem `publish`
- sem `secrets`
- sem `tags/releases`
- sem avancar F2/F3
- sem alteracao no `eiah-web`

## Status final

evidenciado
