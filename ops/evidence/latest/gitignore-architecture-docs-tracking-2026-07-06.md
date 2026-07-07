# Gitignore Architecture Docs Tracking — Fechamento (2026-07-06)

## Contexto do drift

`docs/architecture/*` é ignorado por `.gitignore` desde a introdução do padrão restritivo, com exceção pontual apenas para `agent-chat-runtime.md`. Esse padrão causou perda silenciosa de rastreamento em pelo menos 3 ocorrências:

1. **PR #173** (`fix(p0): narrow docs/architecture allowlist to agent-chat-runtime only`) — reduziu a allowlist original a um único arquivo, deixando os 5 arquivos legado (`adr-imob-journey-governed-by-case.md`, `imob-crm-governed-runtime.md`, `p3-economy-hardening-closure.md`, `presentation-snapshot-v1.md`, `worker-topology.md`) rastreados por herança do índice, mas fora de qualquer exceção nova do `.gitignore` — situação classificada como "legado tracked ignored" e auditada em `ops/evidence/latest/git-hygiene-tracked-files-2026-07-02.md`.
2. **PRs #182 / #185 / #187** (docs hygiene, white-label runtime gap, fase 3 debt closure) — cada um criou um novo arquivo narrativo em `docs/architecture/` (`chat-runtime-entrypoint-debt.md`, `white-label-runtime-gap.md`, `fase-3-dividas-documentadas-closure.md` respectivamente) que **nunca foi commitado**, por baterem no mesmo padrão `docs/architecture/*` sem exceção — confirmado via `git status --ignored` (`!!`) e `git check-ignore -v` (regra `.gitignore:52`) na sessão de validação de 2026-07-05. Os arquivos existiam fisicamente no disco e eram referenciados como se permanentes por `docs/EVIDENCE_INDEX.md` e pelo próprio `check:docs-link-integrity` (que lê do disco local, não do git), mas eram invisíveis a `git status` padrão e a qualquer `git clone`/checkout de CI.

Esta é, portanto, a **3ª recorrência** do mesmo padrão de drift estrutural do `.gitignore`.

## Correção aplicada (commit `520cddd6f0cabb7bd48fca286ce92bfa46b12f54`)

Diff aplicado em `.gitignore` (8 linhas adicionadas, nenhuma removida/alterada):

```diff
 !docs/architecture/
 docs/architecture/*
 !docs/architecture/agent-chat-runtime.md
+!docs/architecture/adr-imob-journey-governed-by-case.md
+!docs/architecture/chat-runtime-entrypoint-debt.md
+!docs/architecture/fase-3-dividas-documentadas-closure.md
+!docs/architecture/imob-crm-governed-runtime.md
+!docs/architecture/p3-economy-hardening-closure.md
+!docs/architecture/presentation-snapshot-v1.md
+!docs/architecture/white-label-runtime-gap.md
+!docs/architecture/worker-topology.md
```

Arquivos de conteúdo trazidos ao versionamento no mesmo commit (os 3 que estavam ignorados e não rastreados):

- `docs/architecture/chat-runtime-entrypoint-debt.md` (108 linhas)
- `docs/architecture/fase-3-dividas-documentadas-closure.md` (146 linhas)
- `docs/architecture/white-label-runtime-gap.md` (150 linhas)

Os outros 5 arquivos do patch já estavam rastreados (legado) — a negação explícita apenas os torna consistentes com o `.gitignore` declarado, sem mudança de conteúdo.

**Hash do commit**: `520cddd6f0cabb7bd48fca286ce92bfa46b12f54` (curto: `520cddd`), branch `main`, autor humano (`Merlo`), mensagem `fix(docs): track docs architecture source files (#188)`.

`git log --oneline origin/main..HEAD` no momento desta evidência: vazio — commit já sincronizado com `origin/main`.

## Saída real dos gates (execução em 2026-07-06, pós-commit)

### `pnpm check:tracked-ignored-files`

```json
{
  "ok": true,
  "check": "check:tracked-ignored-files",
  "summary": {
    "generated_safe_to_untrack": 8,
    "evidence_keep": 0,
    "contract_keep": 0,
    "source_keep": 14,
    "unknown_review": 23,
    "legacyPending": true,
    "newViolations": 0
  }
}
```
Exit code: `0`.

### `pnpm check:docs-link-integrity`

```json
{
  "ok": true,
  "check": "check:docs-link-integrity",
  "filesChecked": 13,
  "targets": [
    "AGENTS.md",
    "CLAUDE.md",
    "CODEX.md",
    "IA_EIAH.md",
    "docs/architecture/adr-imob-journey-governed-by-case.md",
    "docs/architecture/agent-chat-runtime.md",
    "docs/architecture/chat-runtime-entrypoint-debt.md",
    "docs/architecture/fase-3-dividas-documentadas-closure.md",
    "docs/architecture/imob-crm-governed-runtime.md",
    "docs/architecture/p3-economy-hardening-closure.md",
    "docs/architecture/presentation-snapshot-v1.md",
    "docs/architecture/white-label-runtime-gap.md",
    "docs/architecture/worker-topology.md"
  ]
}
```
Exit code: `0`. Os 3 arquivos antes ignorados já aparecem no `targets`, lidos diretamente de um checkout limpo pós-commit (não mais dependente de estado local não versionado).

### `git ls-files docs/architecture/` (confirmação direta)

```
docs/architecture/adr-imob-journey-governed-by-case.md
docs/architecture/agent-chat-runtime.md
docs/architecture/chat-runtime-entrypoint-debt.md
docs/architecture/fase-3-dividas-documentadas-closure.md
docs/architecture/imob-crm-governed-runtime.md
docs/architecture/p3-economy-hardening-closure.md
docs/architecture/presentation-snapshot-v1.md
docs/architecture/white-label-runtime-gap.md
docs/architecture/worker-topology.md
```
9 arquivos rastreados (8 do padrão de negação + `agent-chat-runtime.md`, já coberto por regra pré-existente).

## O que este fechamento NÃO resolve (registro explícito)

- **Decisão D8 (pendente do CEO)**: o `.gitignore` mantém o padrão de allowlist enumerado (`docs/architecture/*` + 8 negações explícitas por nome de arquivo) em vez de um padrão genérico (`!docs/architecture/*.md`). Isso significa que **qualquer novo arquivo `.md` criado futuramente em `docs/architecture/` voltará a ser ignorado por padrão** até que uma nova linha de negação seja adicionada manualmente — o mecanismo estrutural que já causou 3 recorrências do mesmo drift **permanece ativo**. Esta decisão foi deliberadamente adiada (menor diff seguro, sem trocar o padrão) e aguarda decisão explícita do CEO em frente futura.
- **Limpeza plena de F-09**: `check:tracked-ignored-files` reporta `unknown_review: 23` e `generated_safe_to_untrack: 8` — itens de higiene de repositório não relacionados a `docs/architecture/` e fora do escopo desta correção pontual.
- Nenhum código de runtime, `package.json`, CI ou `docs/EVIDENCE_INDEX.md` foi alterado pelo commit `520cddd` em si — apenas `.gitignore` e os 3 arquivos de conteúdo documental.

## Status

- Correção do `.gitignore` e recuperação dos 3 arquivos: **evidenciado** (commit real + 2 gates executados com `ok:true` + confirmação `git ls-files`).
- Eliminação estrutural da causa raiz (padrão enumerado vs. genérico): **proposta** — decisão D8 pendente, não implementada aqui.
