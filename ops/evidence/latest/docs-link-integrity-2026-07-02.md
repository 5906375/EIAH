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
