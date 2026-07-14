# F1.6c — Workspace node_modules Ownership Recovery

## Resumo
- Objetivo: recuperar o workspace local apos a F1.6b, restaurando um estado saudavel para checks baseados em `tsx` e `pnpm`.
- Escopo: auditoria de ownership/permissoes, tentativa controlada de destravar o relink e evidencia documental do estado final.
- Status: parcial/bloqueado
- Relacao com F1.6b: F1.6b provou que o relink para `~/.pnpm-store` travava em ownership legado `nobody:nogroup` dentro de `packages/*/node_modules`.
- Nao formaliza Playwright.
- Nao altera smoke.
- Nao promove CI.

## Contexto
- F1.6a:
  - comprovou drift entre `node_modules/.modules.yaml` apontando para `/app/.pnpm-store/v10` e o `pnpm` local/CI apontando para `~/.pnpm-store`;
  - recomendou relink controlado para `~/.pnpm-store`.
- F1.6b:
  - confirmou `pnpm config get store-dir=/home/jusall/.pnpm-store`;
  - falhou em `pnpm install --ignore-scripts` com `EACCES` ao remover `packages/core/node_modules/@eiah`;
  - isolou ownership legado `nobody:nogroup` em `packages/core`, `packages/contracts`, `packages/providers` e `packages/mcp-runner`.
- Bloqueio de ownership:
  - os quatro `node_modules` internos acima seguem em `nobody:nogroup`;
  - `packages/db/node_modules` ja estava em `jusall:jusall` e permaneceu intocado.

## Arquivos lidos
- `CODEX.md`
- `IA_EIAH.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f1-06a-pnpm-store-alignment-preflight-2026-07-14.md`
- `ops/evidence/latest/f1-06b-controlled-pnpm-store-relink-playwright-runner-normalization-2026-07-14.md`
- `package.json`
- `pnpm-lock.yaml`
- `node_modules/.modules.yaml` (quando presente; na F1.6c permaneceu ausente)
- `.github/workflows/ci.yml`

## Auditoria inicial

| Item | Resultado | Implicacao |
|---|---|---|
| `pnpm store path` | `/home/jusall/.pnpm-store/v10` | O `pnpm` local continua apontando para o store sob `$HOME`. |
| `pnpm config get store-dir` | `/home/jusall/.pnpm-store` | A configuracao segue alinhada ao padrao atual do CI. |
| `node_modules/.modules.yaml` | ausente | O metadata file do root nao foi restaurado desde a tentativa abortada da F1.6b. |
| `packages/*/node_modules ownership` | `packages/core`, `packages/contracts`, `packages/providers`, `packages/mcp-runner` em `nobody:nogroup`; `packages/db` em `jusall:jusall` | O ownership legado continua sendo o menor escopo de correcao necessario para um relink completo. |
| `tsx` | `node -e "import('tsx')..."` => `tsx_import_ok` | O root workspace voltou a resolver `tsx`, entao parte da recuperacao local aconteceu mesmo sem `.modules.yaml`. |
| `pnpm exec tsx --version` | falha com `listen EPERM ... /tmp/tsx-1000/14.pipe` | O binario resolve, mas o wrapper CLI do `tsx` esbarra em restricao de IPC do ambiente atual; nao indica falta de dependencia. |

## Correcao aplicada
- Comando usado:
  - tentativa autorizada inicialmente com `sudo chown -R jusall:jusall packages/core/node_modules packages/contracts/node_modules packages/providers/node_modules packages/mcp-runner/node_modules`
  - resultado: `sudo` falhou porque exigia TTY para ler senha.
  - tentativa equivalente sem `sudo`: `chown -R jusall:jusall packages/core/node_modules packages/contracts/node_modules packages/providers/node_modules packages/mcp-runner/node_modules`
  - resultado: execucao rejeitada na aprovacao.
- Escopo da correcao:
  - nenhum arquivo ou diretorio teve ownership alterado nesta etapa.
- Diretorios afetados:
  - nenhum.
- Diretorios nao tocados:
  - `packages/db/node_modules`
  - `package.json`
  - `pnpm-lock.yaml`
  - `scripts/**`
  - `.github/workflows/**`
  - `apps/**`
  - `packages/**` versionados
- Justificativa:
  - a F1.6c exige parada conservadora se a correcao minima depender de `chown` e nao puder ser concluida com autorizacao/execucao validas.

## Relink/restauracao
- `pnpm install --ignore-scripts`:
  - reexecutado para medir o estado real do workspace apos a F1.6b;
  - iniciou resolucao do monorepo, mas encontrou instabilidade de rede/registry:

```text
ERR_PNPM_META_FETCH_FAIL GET https://registry.npmjs.org/zod
reason: getaddrinfo EAI_AGAIN registry.npmjs.org
```

  - a execucao foi interrompida apos expor o bloqueio de rede, sem concluir relink completo.
- Resultado:
  - sem relink completo;
  - ownership legado permanece;
  - metadata root `.modules.yaml` segue ausente.
- `node_modules/.modules.yaml`:
  - continua ausente.
- `tsx`:
  - importacao direta via Node voltou a funcionar (`tsx_import_ok`);
  - o CLI `pnpm exec tsx --version` continua sujeito a `EPERM` de IPC no ambiente.
- `docs-link-integrity`:
  - voltou a passar com `ok: true`, `filesChecked: 15`.

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
- `git switch -c ops/f1-6c-node-modules-ownership-recovery`
- `git status --short`
- `git branch --show-current`
- `pnpm store path`
- `pnpm config get store-dir`
- `ls -la node_modules/.modules.yaml 2>/dev/null || true`
- `find packages -maxdepth 3 -type d -name node_modules -printf '%M %u %g %p\n' | sort`
- `ls -ld packages/core/node_modules packages/core/node_modules/@eiah packages/contracts/node_modules packages/providers/node_modules packages/mcp-runner/node_modules packages/db/node_modules 2>/dev/null || true`
- `find packages -path '*/node_modules/@eiah' -maxdepth 4 -type d -printf '%M %u %g %p\n' 2>/dev/null | sort`
- `node -e "import('tsx').then(()=>console.log('tsx_import_ok')).catch(e=>{console.error(e.message); process.exit(1)})"`
- `pnpm exec tsx --version || true`
- tentativa de `sudo chown -R jusall:jusall packages/core/node_modules packages/contracts/node_modules packages/providers/node_modules packages/mcp-runner/node_modules`
- tentativa de `chown -R jusall:jusall packages/core/node_modules packages/contracts/node_modules packages/providers/node_modules packages/mcp-runner/node_modules`
- `pnpm install --ignore-scripts`
- `pnpm check:docs-link-integrity`

## Riscos remanescentes
- Workspace recuperado ou nao:
  - recuperacao parcial do root workspace;
  - relink completo do monorepo continua nao comprovado.
- F1.6 Playwright ainda pendente:
  - nao formalizado;
  - fora do escopo desta etapa.
- Proxima etapa:
  - obter aprovacao/executar `chown` minimo nos quatro `node_modules` legados;
  - repetir `pnpm install --ignore-scripts` em ambiente com registry estavel;
  - somente depois retomar a formalizacao de `playwright`.

## Conclusao
- Status final: parcial/bloqueado
- A F1.6c recuperou checks locais importantes do root (`tsx` importavel e `pnpm check:docs-link-integrity` verde), mas nao restaurou o relink completo do workspace porque:
  - a correcao minima de ownership nao foi aplicada;
  - o `pnpm install --ignore-scripts` ainda encontrou `EAI_AGAIN` no registry.
- Nao declarar F1.6 concluida.
