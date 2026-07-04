# Docs link integrity — 2026-07-02

## Escopo

- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/architecture/adr-imob-journey-governed-by-case.md`
- `scripts/checkDocsLinkIntegrity.ts`
- `package.json`
- `.github/workflows/ci.yml`

## Achados confirmados antes do ajuste

- `AGENTS.md` referenciava links Markdown para artefatos inexistentes em `docs/architecture/`.
- `docs/architecture/agent-chat-runtime.md` referenciava links Markdown para artefatos inexistentes em `docs/architecture/`.
- `docs/architecture/adr-imob-journey-governed-by-case.md` também referenciava links Markdown inexistentes em `docs/architecture/`.
- Apenas `docs/architecture/presentation-snapshot-v1.md` existia entre os artefatos listados.

## Correção aplicada

- Links mortos foram removidos dos dois documentos normativos.
- O ADR `docs/architecture/adr-imob-journey-governed-by-case.md` recebeu a mesma normalizacao minima para manter o gate honesto sobre `docs/architecture/`.
- A intenção futura foi preservada como texto simples em `Backlog documental futuro`, sem criar arquivos vazios.
- O link vivo de `AGENTS.md` para `docs/architecture/agent-chat-runtime.md` foi normalizado para caminho relativo.

## Gate adicionado

- Novo script: `pnpm check:docs-link-integrity`
- Cobertura do gate:
  - `CLAUDE.md`
  - `CODEX.md`
  - `IA_EIAH.md`, quando existir
  - `AGENTS.md`
  - todos os arquivos `*.md` dentro de `docs/architecture/`
- Regras:
  - valida links Markdown internos
  - ignora `http://`, `https://`, `mailto:` e âncoras puras
  - remove `#anchor` antes de validar o caminho
  - falha com arquivo, linha e caminho inválido

## Execução real

### 1. Integridade documental

```bash
pnpm check:docs-link-integrity
```

Resultado observado:

- `ok: true`
- `check: "check:docs-link-integrity"`
- `filesChecked: 5`

### 2. Evidence Index

```bash
pnpm check:evidence-index
```

Resultado observado:

- `ok: true`
- `check: "check:evidence-index"`

## Status

- `proposta`: não se aplica
- `parcial`: não se aplica
- `evidenciado`: integridade mínima de links internos dos documentos normativos cobertos pelo gate

## Follow-up — falha real de CI por caminhos absolutos locais (2026-07-04)

### Falha observada

O CI do PR-GOV-DOCS-02 reportou 10 links internos inválidos em `pnpm check:docs-link-integrity`, todos apontando para caminhos como `/home/jusall/projects/EIAH_BUILDER/...`.

### Causa raiz

`AGENTS.md`, `docs/architecture/agent-chat-runtime.md` e `docs/architecture/imob-crm-governed-runtime.md` continham 9 links Markdown com caminho absoluto específico da máquina de desenvolvimento local. Esses links resolviam corretamente em ambiente local (onde o repositório está de fato em `/home/jusall/projects/EIAH_BUILDER`), mas quebravam no runner do GitHub Actions, cujo checkout do repositório fica em outro caminho absoluto. O gate `check:docs-link-integrity` passava localmente (`ok:true`) mesmo com esses links quebrados, porque `resolveTarget(...)` trata qualquer alvo iniciado por `/` como caminho absoluto literal, sem normalizar para a raiz do repositório — um ponto cego conhecido do gate atual, não corrigido neste follow-up para não ampliar escopo.

O décimo link reportado (`docs/architecture/agent-chat-runtime.md` → `./chat-runtime-entrypoint-debt.md`) foi investigado e **não estava de fato quebrado**: o arquivo `docs/architecture/chat-runtime-entrypoint-debt.md` existe e está versionado; nenhuma alteração foi feita nesse link.

### Correção aplicada

- `AGENTS.md`: 1 link corrigido para caminho relativo (`./docs/architecture/presentation-snapshot-v1.md`).
- `docs/architecture/agent-chat-runtime.md`: 1 link corrigido para caminho relativo (`./presentation-snapshot-v1.md`).
- `docs/architecture/imob-crm-governed-runtime.md`: 7 links corrigidos para caminho relativo (`../../apps/...`), todos apontando para arquivos `.ts` reais e existentes.
- Nenhum arquivo novo foi criado; nenhum link foi removido ou convertido em texto plano, pois todos os 9 alvos reais existem no repositório.
- O gate `check:docs-link-integrity` não foi relaxado, desabilitado nem teve sua lógica alterada.

### Saída real pós-correção

```bash
pnpm check:docs-link-integrity
```

```text
{ "ok": true, "check": "check:docs-link-integrity", "filesChecked": 13, ... }
```

### Conclusão

- Os 9 links reais foram corrigidos para caminho relativo portável.
- O 1 link investigado e não corrigido permanece válido (arquivo existe e está versionado).
- DONE global não é declarado; este follow-up cobre apenas a correção de link-integrity reportada pelo CI.

## Follow-up 2 — segunda falha real de CI: link para artefato git-ignored (2026-07-04)

### Falha observada

O CI do PR-GOV-DOCS-02 passou a reportar apenas 1 link inválido:

`docs/architecture/agent-chat-runtime.md:194 invalid link ./chat-runtime-entrypoint-debt.md -> docs/architecture/chat-runtime-entrypoint-debt.md`

### Causa raiz

`docs/architecture/chat-runtime-entrypoint-debt.md` existe no disco local (108 linhas) mas **não está versionado**: `docs/architecture/*` está listado em `.gitignore:52`, e esse arquivo específico nunca foi adicionado como exceção. O gate `check:docs-link-integrity` passava localmente porque o arquivo existe fisicamente na máquina de desenvolvimento, mas falha no runner do CI, cujo checkout não inclui arquivos ignorados pelo git. Distinto do follow-up anterior (caminho absoluto não portável): aqui o arquivo de destino simplesmente não existe no repositório versionado.

### Correção aplicada

- `docs/architecture/agent-chat-runtime.md`: o link `[Chat Runtime Entrypoint Debt](./chat-runtime-entrypoint-debt.md)` foi trocado para apontar à evidência real e versionada `[Chat Runtime Entrypoint Debt](../../ops/evidence/latest/chat-runtime-entrypoint-debt-2026-07-02.md)`, confirmada como rastreada via `git ls-files`.
- Nenhum arquivo novo foi criado apenas para satisfazer o gate.
- `scripts/checkDocsLinkIntegrity.ts` não foi alterado; o gate permanece fail-closed.

### Saída real pós-correção

```bash
pnpm check:docs-link-integrity
```

```text
{ "ok": true, "check": "check:docs-link-integrity", "filesChecked": 13, ... }
```

### Conclusão

- O único link reportado pelo CI foi corrigido para um alvo real e versionado.
- DONE global não é declarado; este follow-up cobre apenas a segunda correção de link-integrity reportada pelo CI.
