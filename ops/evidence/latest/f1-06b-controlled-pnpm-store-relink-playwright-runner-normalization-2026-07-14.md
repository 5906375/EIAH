# F1.6b — Controlled pnpm Store Relink for Playwright Runner Normalization

## Resumo
- Objetivo: retomar a F1.6 após F1.6a, alinhando o workspace local a `~/.pnpm-store` e formalizando `playwright` para normalizar o smoke F1.4.
- Escopo: relink controlado do workspace com `--ignore-scripts`, formalização futura de `playwright` e normalização do smoke somente após import formal funcionar.
- Status: parcial/bloqueado
- Relação com F1.6a: F1.6a identificou o drift `storeDir=/app/.pnpm-store/v10` vs `~/.pnpm-store`; F1.6b tentou executar o relink recomendado.
- Não promove CI.
- Não altera workflows/apps/packages/runtime/ChatAgentLauncher.

## Contexto
- F1.4: criou o smoke local `scripts/smoke-f1-4-front-door-mobile.mjs` com fallback `_npx`.
- F1.5: provou o smoke local, mas sem dependência formal `playwright`.
- F1.6: tentou formalizar `playwright` e falhou em `ERR_PNPM_UNEXPECTED_STORE`.
- F1.6a: comprovou o drift entre `node_modules/.modules.yaml` e a config ativa do `pnpm`, recomendando relink controlado para `~/.pnpm-store`.
- Bloqueio removido ou não:
  - drift de configuração do `pnpm`: parcialmente tratado;
  - bloqueio novo: ownership/permissão em diretórios `node_modules` internos de `packages/`, impedindo a reinstalação controlada.

## Arquivos lidos
- `CODEX.md`
- `IA_EIAH.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f1-04-front-door-mobile-recurring-smoke-minimal-implementation-2026-07-14.md`
- `ops/evidence/latest/f1-05-front-door-mobile-smoke-reproducibility-ci-readiness-2026-07-14.md`
- `ops/evidence/latest/f1-06a-pnpm-store-alignment-preflight-2026-07-14.md`
- `scripts/smoke-f1-4-front-door-mobile.mjs`
- `package.json`
- `pnpm-lock.yaml`
- `node_modules/.modules.yaml` da raiz
- `.github/workflows/ci.yml`

## Auditoria inicial

| Item | Antes | Depois | Implicação |
|---|---|---|---|
| `pnpm store path` | `/home/jusall/.pnpm-store/v10` | `/home/jusall/.pnpm-store/v10` | O path efetivo do store já estava alinhado ao `$HOME`. |
| `pnpm config get store-dir` | `/home/jusall/.pnpm-store` | `/home/jusall/.pnpm-store` | A config global ficou confirmada, sem mudança funcional adicional. |
| `node_modules/.modules.yaml storeDir` | `/app/.pnpm-store/v10` | arquivo ausente após tentativa abortada de relink | O relink iniciou remoção/recriação do root `node_modules`, mas abortou antes de reconstruir o metadata file. |
| `import("playwright")` | falha: `Cannot find package 'playwright'` | permanece falhando | Sem relink completo e sem `pnpm add`, o import formal continua indisponível. |

## Execução controlada

Comandos executados e resultados:

1. `git switch main && git pull --ff-only && git switch -c test/f1-6b-controlled-pnpm-store-relink-playwright`
   - resultado: `main` atualizado e branch de trabalho criada com sucesso.

2. `pnpm config set store-dir ~/.pnpm-store --global`
   - resultado: executado com sucesso.

3. confirmação:
   - `pnpm store path` -> `/home/jusall/.pnpm-store/v10`
   - `pnpm config get store-dir` -> `/home/jusall/.pnpm-store`

4. `pnpm install --ignore-scripts`
   - primeira execução: confirmou necessidade de recriar `node_modules`, mas não deixou prova de relink completo;
   - segunda execução, confirmada de forma não interativa, falhou com:

```text
Recreating /home/jusall/projects/EIAH_BUILDER/node_modules
EACCES: permission denied, rmdir '/home/jusall/projects/EIAH_BUILDER/packages/core/node_modules/@eiah'
```

5. inspeção pós-erro:
   - `packages/core/node_modules`, `packages/contracts/node_modules`, `packages/providers/node_modules` e `packages/mcp-runner/node_modules` continuam owned por `nobody:nogroup`;
   - `packages/db/node_modules` está em `jusall:jusall`;
   - `node_modules/.modules.yaml` da raiz ficou ausente após a tentativa abortada.

6. `pnpm add -Dw playwright --ignore-scripts`
   - não executado.
   - motivo: a tarefa exige parada em erro e o relink controlado não concluiu com segurança.

7. confirmação de import formal:
   - `node -e "import('playwright')..."` continua falhando com `Cannot find package 'playwright'`.

## Normalização do smoke
- Arquivo alterado: nenhum.
- Como o fallback foi removido/desativado:
  - não executado.
- Campos JSON:
  - `runnerImport`: não aplicável nesta etapa.
  - `fallbackUsed`: não aplicável nesta etapa.
- Viewports validados:
  - não executados nesta etapa.

## Resultados dos smokes

| Comando | Exit | runnerImport | fallbackUsed | Viewports | Resultado |
|---|---:|---|---:|---|---|
| `node scripts/smoke-f1-4-front-door-mobile.mjs` | não executado | n/a | n/a | n/a | bloqueado antes da formalização de `playwright` |
| `F1_FRONT_DOOR_BASE_URL=http://127.0.0.1:5173 node scripts/smoke-f1-4-front-door-mobile.mjs` | não executado | n/a | n/a | n/a | bloqueado antes da formalização de `playwright` |

## Prova de isolamento
- Sem alteração em arquivos sob `.github/workflows/`.
- Sem alteração em arquivos sob `apps/`.
- Sem alteração em arquivos sob `packages/`.
- Sem alteração em runtime/engine/APIs/contracts.
- Sem alteração em `ChatAgentLauncher`.
- Sem promoção CI.
- Sem screenshots.
- Sem side effects externos.
- Sem alteração em `package.json`.
- Sem alteração em `pnpm-lock.yaml`.
- Sem alteração em `scripts/smoke-f1-4-front-door-mobile.mjs`.

## Diffs esperados

Nenhum diff funcional do objetivo final foi materializado nesta etapa.

Arquivos versionados alterados nesta PR:
- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f1-06b-controlled-pnpm-store-relink-playwright-runner-normalization-2026-07-14.md`

Arquivos que **não** mudaram:
- `package.json`
- `pnpm-lock.yaml`
- `scripts/smoke-f1-4-front-door-mobile.mjs`
- `.github/workflows/`
- `apps/`
- `packages/`

## Checks executados
- `git switch main`
- `git pull --ff-only`
- `git switch -c test/f1-6b-controlled-pnpm-store-relink-playwright`
- `git status --short`
- `git branch --show-current`
- `pnpm store path`
- `pnpm config get store-dir`
- `sed -n '1540,1565p' node_modules/.modules.yaml`
- `test -w ~/.pnpm-store`
- `test -w ~/.pnpm-store/v10`
- `node -e "import('playwright')..."`
- `pnpm config set store-dir ~/.pnpm-store --global`
- `pnpm install --ignore-scripts`
- `ls -ld packages/core/node_modules packages/core/node_modules/@eiah packages/core/node_modules/@eiah/*`
- `find packages -maxdepth 3 -type d -name node_modules -printf '%M %u %g %p\n'`
- `ls -ld node_modules packages/core/node_modules packages/contracts/node_modules packages/providers/node_modules packages/mcp-runner/node_modules packages/db/node_modules`
- `find node_modules -maxdepth 2 -type d`
- `ls -la node_modules/.modules.yaml`
- `pnpm check:evidence-index`
- `pnpm check:docs-link-integrity`
- `pnpm check:w4-non-regression`
- `git diff --check`
- `git diff -- .github/workflows apps packages`
- `git diff -- package.json pnpm-lock.yaml`
- `git diff -- scripts/smoke-f1-4-front-door-mobile.mjs`

## Riscos remanescentes
- `playwright` continua não formalizado no grafo do repositório.
- O relink controlado depende de resolver ownership/permissão em diretórios `node_modules` internos de `packages/`.
- `node_modules/.modules.yaml` da raiz foi removido pela tentativa abortada e o workspace local não deve ser tratado como baseline confiável até uma reinstalação controlada bem-sucedida.
- CI ainda não promovido.
- Uma futura F1.6c ou retomada autorizada precisará decidir explicitamente como corrigir a ownership legada (`nobody:nogroup`) antes de repetir `pnpm install`.

## Conclusão
- Status final: parcial/bloqueado
- Resultado da etapa: o alinhamento lógico do `pnpm` para `~/.pnpm-store` foi confirmado, mas o relink controlado falhou por permissões/ownership em diretórios `node_modules` internos de `packages/`.
- Próxima ação recomendada:
  - corrigir ownership/permissões dos `node_modules` legados em PR/etapa separada ou com autorização operacional explícita;
  - só depois repetir `pnpm install --ignore-scripts`, `pnpm add -Dw playwright --ignore-scripts` e a normalização do smoke.
- Não declarar DONE amplo.
