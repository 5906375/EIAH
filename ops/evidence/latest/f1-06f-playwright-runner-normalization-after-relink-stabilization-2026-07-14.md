# F1.6f — Playwright runner normalization after relink stabilization

## Resumo
- Objetivo: formalizar `playwright` como devDependency root apos a estabilizacao do relink da F1.6e e normalizar o runner do smoke F1.4.
- Escopo: `package.json`, `pnpm-lock.yaml`, `scripts/smoke-f1-4-front-door-mobile.mjs`, evidencia F1.6f e `docs/EVIDENCE_INDEX.md`.
- Status: parcial
- Relacao com F1.6e: a F1.6e restaurou `node_modules/.modules.yaml`, validou `pnpm install --ignore-scripts` e liberou a retomada da normalizacao do runner.
- Nao formaliza CI.
- Nao altera workflows/apps/packages/runtime/ChatAgentLauncher.

## Contexto
- F1.6a: evidenciou drift de store entre `/app/.pnpm-store/v10` e `~/.pnpm-store`.
- F1.6b: falhou no relink controlado por `EACCES` em `packages/core/node_modules/@eiah`.
- F1.6c/F1.6d: isolaram e tentaram a correcao de ownership, mas ficaram bloqueadas operacionalmente.
- F1.6e: comprovou relink estabilizado apos reparo manual de ownership no host, com `pnpm install --ignore-scripts` passando e `.modules.yaml` restaurado.
- A F1.6f retoma o objetivo funcional original: normalizar a resolucao do Playwright pelo workspace, sem fallback fragil em `~/.npm/_npx`.

## Arquivos lidos
- `CODEX.md`
- `IA_EIAH.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f1-06a-pnpm-store-alignment-preflight-2026-07-14.md`
- `ops/evidence/latest/f1-06b-controlled-pnpm-store-relink-playwright-runner-normalization-2026-07-14.md`
- `ops/evidence/latest/f1-06c-workspace-node-modules-ownership-recovery-2026-07-14.md`
- `ops/evidence/latest/f1-06d-authorized-ownership-repair-relink-stabilization-2026-07-14.md`
- `ops/evidence/latest/f1-06e-relink-stabilization-after-host-ownership-repair-2026-07-14.md`
- `package.json`
- `pnpm-lock.yaml`
- `node_modules/.modules.yaml`
- `.github/workflows/ci.yml`
- `scripts/smoke-f1-4-front-door-mobile.mjs`

## Baseline antes da alteracao

| Item | Resultado | Implicacao |
|---|---|---|
| `node_modules/.modules.yaml` | presente (`-rw-r--r-- 1 jusall jusall ...`) | O relink estabilizado da F1.6e permaneceu valido. |
| `pnpm check:docs-link-integrity` | `ok: true`, `filesChecked: 15` | O workspace estava saudavel para checks documentais antes da alteracao. |
| `import('playwright')` antes | `playwright_import_before_failed: Cannot find package 'playwright'` | O Playwright realmente ainda nao estava formalizado no root. |

## Formalizacao de Playwright
- Comando executado:

```text
pnpm add -Dw playwright --ignore-scripts
```

- Resultado:

```text
devDependencies:
+ playwright ^1.61.1
Done in 25.5s using pnpm v10.12.4
```

- Arquivos alterados por essa etapa:
  - `package.json`
  - `pnpm-lock.yaml`

## Resultado do import formal
- Comando:

```text
node -e "import('playwright').then(()=>console.log('playwright_import_ok')).catch(e=>{console.error(e.message); process.exit(1)})"
```

- Resultado:

```text
playwright_import_ok
```

## Ajuste no smoke F1.4
- Arquivo alterado: `scripts/smoke-f1-4-front-door-mobile.mjs`
- Mudancas aplicadas:
  - remove a busca de fallback em `~/.npm/_npx`;
  - remove `F1_PLAYWRIGHT_MODULE` como caminho de escape local;
  - passa a resolver exclusivamente `import('playwright')`;
  - adiciona no JSON:
    - `runnerImport: "formal_dependency:playwright"`
    - `fallbackUsed: false`
- Efeito:
  - o runner deixa de depender de fallback fragil fora do grafo formal do workspace;
  - nao ha alteracao de comportamento de produto, apenas da forma de carregar o runner.

## Resultado do smoke F1.4
- Comando:

```text
node scripts/smoke-f1-4-front-door-mobile.mjs
```

- Resultado:
  - `import('playwright')` foi bem-sucedido;
  - o smoke falhou no launch do Chromium, nao por ausencia de browser executable, mas por bloqueio de sandbox/host:

```text
browserType.launch: Target page, context or browser has been closed
[FATAL:content/browser/sandbox_host_linux.cc:41] Check failed: . shutdown: Operation not permitted (1)
```

- Leitura conservadora:
  - a normalizacao do runner foi comprovada;
  - o smoke local nao ficou verde nesta sessao por restricao de launch do browser no ambiente atual;
  - nao houve necessidade de instalar browser nesta etapa, e nenhum `playwright install` foi executado.

## Fallback
- Fallback removido ou nao usado:
  - removido do script.
- Estado final registrado:
  - `runnerImport: "formal_dependency:playwright"`
  - `fallbackUsed: false`

## Prova de nao escopo
Confirmado:
- sem workflows;
- sem apps;
- sem packages versionados;
- sem runtime/engine/APIs/contracts;
- sem `ChatAgentLauncher`;
- sem promocao CI.

## Checks executados
- `pnpm check:docs-link-integrity` -> `ok: true`, `filesChecked: 15`
- `node -e "import('playwright')..."` antes -> falhou como esperado, pacote ausente
- `pnpm add -Dw playwright --ignore-scripts` -> sucesso
- `node -e "import('playwright')..."` depois -> `playwright_import_ok`
- `node scripts/smoke-f1-4-front-door-mobile.mjs` -> falha parcial por bloqueio de launch do browser no host

## Riscos remanescentes
- Workspace estabilizado ou nao:
  - estabilizado para resolucao formal do runner.
- F1.6 Playwright ainda pendente:
  - a dependencia foi formalizada, mas o smoke nao ficou verde nesta sessao por restricao de launch do Chromium.
- Proxima etapa:
  - reexecutar o smoke em ambiente local com launch de browser permitido, sem alterar o runner novamente;
  - manter CI fora do escopo ate haver prova local verde consistente.

## Conclusao
- Status final: parcial
- A F1.6f formalizou `playwright` no workspace root, provou `import('playwright')` via grafo formal e removeu o fallback fragil do smoke F1.4.
- O fechamento ficou parcial porque o smoke local nao completou o launch do Chromium no ambiente atual, apesar de o runner ja estar normalizado.
- Nao declarar F1.6 concluida sem evidencia adicional do smoke verde ou decisao explicita sobre o bloqueio de launch no host.
