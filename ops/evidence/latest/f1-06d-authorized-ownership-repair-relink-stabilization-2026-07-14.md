# F1.6d — Authorized Ownership Repair and Relink Stabilization

## Resumo
- Objetivo: executar a correcao operacional autorizada da F1.6c para corrigir ownership legado dos `node_modules` internos e estabilizar o relink do workspace.
- Escopo: ownership repair restrito, tentativa de relink via `pnpm install --ignore-scripts` e evidencia documental do estado final.
- Status: parcial/bloqueado
- Relacao com F1.6c: a F1.6c isolou corretamente o menor escopo de correcao; a F1.6d tentou aplicar exatamente esse escopo.
- Nao formaliza Playwright.
- Nao altera smoke.
- Nao promove CI.

## Contexto
- F1.6a:
  - comprovou drift de `storeDir` entre `/app/.pnpm-store/v10` e `~/.pnpm-store`.
- F1.6b:
  - falhou em `pnpm install --ignore-scripts` com `EACCES` ao remover `packages/core/node_modules/@eiah`.
- F1.6c:
  - confirmou ownership legado `nobody:nogroup` em `packages/core`, `packages/contracts`, `packages/providers` e `packages/mcp-runner`;
  - confirmou `packages/db/node_modules` como `jusall:jusall`;
  - recuperou `tsx` importavel e `pnpm check:docs-link-integrity`, mas sem corrigir ownership.
- Bloqueio remanescente:
  - ownership legado nos quatro `node_modules` internos;
  - ausencia de permissao operacional suficiente para executar o `chown` autorizado sem senha interativa do host.

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
- `package.json`
- `pnpm-lock.yaml`
- `node_modules/.modules.yaml` (permaneceu ausente)
- `.github/workflows/ci.yml`

## Auditoria inicial

| Item | Resultado | Implicacao |
|---|---|---|
| `pnpm store path` | `/home/jusall/.pnpm-store/v10` | O `pnpm` local continua alinhado ao store sob `$HOME`. |
| `pnpm config get store-dir` | `/home/jusall/.pnpm-store` | A configuracao ativa segue coerente com o padrao do CI. |
| `node_modules/.modules.yaml` | ausente | O metadata file do root continua nao restaurado. |
| `packages/*/node_modules ownership` | core/contracts/providers/mcp-runner em `nobody:nogroup`; db em `jusall:jusall` | A auditoria confirmou exatamente o escopo restrito autorizado para correcao. |
| `tsx` | `tsx_import_ok` via `node -e "import('tsx')..."` | O root workspace continua resolvendo `tsx`. |
| `docs-link-integrity` | `ok: true`, `filesChecked: 15` | O workspace continua funcional para checks documentais locais. |

## Correcao aplicada
- Comando usado:
  - tentativa 1: `sudo chown -R jusall:jusall packages/core/node_modules packages/contracts/node_modules packages/providers/node_modules packages/mcp-runner/node_modules`
  - tentativa 2: `chown -R jusall:jusall packages/core/node_modules packages/contracts/node_modules packages/providers/node_modules packages/mcp-runner/node_modules`
- Escopo:
  - exatamente os quatro `node_modules` internos confirmados pela auditoria.
- Diretorios corrigidos:
  - nenhum.
- Diretorios nao tocados:
  - `packages/db/node_modules`
  - `package.json`
  - `pnpm-lock.yaml`
  - `scripts/**`
  - `.github/workflows/**`
  - `apps/**`
  - `packages/**` versionados
- Resultado pos-correcao:
  - nenhuma alteracao materializada.

Se falhar:
- Erro exato:
  - `sudo` ficou bloqueado em prompt interativo: `[sudo] password for jusall:`
  - a tentativa equivalente sem `sudo` foi rejeitada pela camada de execucao.
- Proximo bloqueio:
  - a F1.6d nao consegue concluir enquanto a correcao de ownership depender de senha interativa do host ou de aprovacao operacional adicional fora da sessao.

## Relink/restauracao
- `pnpm install --ignore-scripts`:
  - nao executado nesta etapa.
- Resultado:
  - nao ha como validar relink completo sem primeiro corrigir ownership.
- `node_modules/.modules.yaml`:
  - continua ausente.
- `tsx`:
  - continua resolvivel por import direto.
- `docs-link-integrity`:
  - continua passando.

## Prova de isolamento
Confirmado:
- Sem alteracao em `package.json`.
- Sem alteracao em `pnpm-lock.yaml`.
- Sem alteracao em scripts.
- Sem alteracao em workflows.
- Sem alteracao em apps/packages versionados.
- Sem alteracao em runtime/engine/APIs/contracts.
- Sem alteracao em `ChatAgentLauncher`.
- Sem Playwright.
- Sem promocao CI.

## Checks executados
- `git switch main`
- `git pull --ff-only`
- `git switch -c ops/f1-6d-authorized-ownership-repair-relink-stabilization`
- `git status --short`
- `git branch --show-current`
- `pnpm store path`
- `pnpm config get store-dir`
- `ls -la node_modules/.modules.yaml 2>/dev/null || true`
- `find packages -maxdepth 3 -type d -name node_modules -printf '%M %u %g %p\n' | sort`
- `ls -ld packages/core/node_modules packages/core/node_modules/@eiah packages/contracts/node_modules packages/providers/node_modules packages/mcp-runner/node_modules packages/db/node_modules 2>/dev/null || true`
- `node -e "import('tsx').then(()=>console.log('tsx_import_ok')).catch(e=>{console.error(e.message); process.exit(1)})"`
- `pnpm check:docs-link-integrity`
- tentativa de `sudo chown -R jusall:jusall packages/core/node_modules packages/contracts/node_modules packages/providers/node_modules packages/mcp-runner/node_modules`
- tentativa de `chown -R jusall:jusall packages/core/node_modules packages/contracts/node_modules packages/providers/node_modules packages/mcp-runner/node_modules`

## Riscos remanescentes
- Workspace estabilizado ou nao:
  - nao estabilizado por completo; relink continua pendente.
- F1.6 Playwright ainda pendente:
  - segue fora de escopo e sem formalizacao.
- Proxima etapa:
  - executar o `sudo chown -R jusall:jusall ...` com senha/TTY validos no host, ou destravar uma aprovacao operacional equivalente;
  - depois rerodar `pnpm install --ignore-scripts` e validar restauracao de `node_modules/.modules.yaml`.

## Conclusao
- Status final: parcial/bloqueado
- A F1.6d confirmou novamente o escopo correto e preservou o isolamento, mas nao conseguiu materializar a correcao autorizada porque a elevacao necessaria depende de senha interativa do host ou aprovacao externa adicional.
- Nao declarar F1.6 concluida.
