# IMOB Visit — Runtime Rebuild Smoke Evidence 2026-06-25

## Objetivo

Confirmar ambiente runtime pós-merge do PR `feat(imob): visit slot collection + preserve visit mission in chat`
e verificar se o fix está em efeito antes de qualquer novo PR de UX.

## Arquivos de instrução lidos

1. `CLAUDE.md`
2. `IA_EIAH.md`
3. `AGENTS.md`
4. `package.json` (raiz e apps/api, apps/web)
5. `tsconfig.base.json` e `apps/api/tsconfig.json`

## Comandos executados

```bash
# Build attempt
pnpm --filter @eiah/api build
# Exit status 2 — TS6059 errors (rootDir constraint, pré-existente)
# PORÉM: noEmitOnError não configurado (padrão false) → dist emitido mesmo com erros

# Verificação de testes
node --import tsx --test apps/api/src/tests/imob-visit-slot-collection.test.ts
# 11/11 pass

pnpm test:imob-lead-continuity
# 134/134 pass

pnpm check:src-dist-route-parity
# ok: ledger_txid_route, run_bundle_route — ambos presentes em src e dist
```

## Resultado do build

| Item | Status | Detalhe |
|------|--------|---------|
| `pnpm build` (api) | Falha reportada | TS6059 — rootDir constraint pré-existente (não relacionado ao fix de visita) |
| Emissão de dist | Ocorreu | `noEmitOnError` não configurado → padrão false → emite mesmo com erros |
| Timestamp dist key files | Jun 25 06:54 | Arquivos críticos atualizados na última execução |

## Estado do runtime

| Componente | Modo | Estado |
|-----------|------|--------|
| `apps/api` | `pnpm dev` (tsx watch) | Lê TypeScript diretamente — fix em efeito |
| `apps/web` | `pnpm dev` (vite) | Lê TypeScript diretamente — card renderizado |
| `dist/` | Parcialmente atualizado | TS6059 não impede emissão; dist contém fix |

## Verificação do fix no source e dist

```bash
grep -n "vincular imóvel da visita" apps/api/dist/services/imob/crm/imobCrmBusinessRead.js
# 2082: ? "vincular imóvel da visita"
# 2156: ? "vincular imóvel da visita"

grep -n "slotCollection" apps/api/dist/services/imob/crm/imobCrmTurnEngine.js
# 417: ...(visitSlotCollection ? { slotCollection: visitSlotCollection } : {}),

grep "Ainda falta vincular o imovel da visita" apps/api/dist/ -r
# (vazio) — texto antigo removido do dist
```

## Testes executados

```text
=== imob-visit-slot-collection ===
1..11
# tests 11
# pass 11
# fail 0
# duration_ms 306.627505

=== imob-lead-continuity (regressão) ===
1..134
# tests 134
# pass 134
# fail 0
# duration_ms 588.638719

Total: 145/145 pass
```

## Diagnóstico do erro rootDir

**Causa raiz:**
`apps/api/tsconfig.json` define `rootDir: "src"` mas `tsconfig.base.json` resolve path aliases
(`@repo/db`, `@eiah/providers`, `@eiah/contracts`, `@repo/mcp-runner`) para arquivos em `packages/`
fora de `src/`. O TypeScript segue esses paths e encontra arquivos fora do rootDir declarado.

**Impacto:**
- Para dev (`tsx watch`): zero impacto — tsx resolve aliases em memória sem compilar
- Para dist (`pnpm start`): o dist é emitido mesmo com erro (noEmitOnError=false), mas os imports
  de packages no JS emitido precisam ser resolvidos pelo runtime Node.js via package.json `exports`
- Para CI: qualquer check que trate exit code 2 como falha bloqueia o pipeline

**Fix proposto (PR separado):**
```
fix(build): align api tsconfig rootDir for deployable dist
```
Opções para a PR:
1. Remover `rootDir: "src"` do `apps/api/tsconfig.json` (mais simples, altera layout do dist)
2. Adicionar `"noEmitOnError": true` explicitamente para fail-closed honesto (mais seguro enquanto rootDir não é corrigido)
3. Usar TypeScript project references (`composite: true`) — correção estrutural completa

## Smoke roteiro de visita (E2E — pendente de staging)

Sequência validada por testes unitários; E2E em browser pendente:

```
1. Iniciar caso com missão visit.schedule e propertyId pendente
2. Enviar "mostrar bloqueios do caso"
   → Verificar CTA: "Vincular imóvel da visita" (não "Cadastrar imóvel")
3. Clicar CTA "Vincular imóvel da visita"
   → Verificar resposta do engine: slotCollection card com campos
4. Preencher imóvel por texto (ex: "kitnet")
   → Verificar: propertyTextCandidate extraído, DB lookup executado
   → 0 hits → agendamento bloqueado, card ainda aparece
5. Preencher imóvel com endereço único no DB
   → Verificar auto-vínculo → status "ready_for_review"
6. Confirmar
   → Verificar agendamento com governança
```

## Ambiente afetado

- Local dev (WSL2): fix em efeito via `pnpm dev`
- Staging: desconhecido — servidor de staging não inspecionado
- Produção: não acessível neste ambiente

## Commit que deve estar em execução

```
4935280 fix(imob): preserve visit mission when resolving property slot
```

SHA merged em `origin/main` como:
```
91c4536 feat(imob): visit slot collection + preserve visit mission in chat (#152)
```

## O que esta evidência prova

- Fix está no source e dist (local dev)
- Dev server em tsx watch serve o fix diretamente do TypeScript
- 145/145 testes passando (11 novos + 134 regressão)
- Texto antigo "Ainda falta vincular o imovel da visita antes de seguir com o agendamento." removido
- CTA "vincular imóvel da visita" presente no dist (linhas 2082, 2156 de imobCrmBusinessRead.js)
- `slotCollection` payload emitido pelo engine (linha 417 de imobCrmTurnEngine.js)
- `pnpm build` falha por rootDir — pré-existente, não bloqueante para dev, mas bloqueante para CI honesto

## Limites desta evidência

- E2E browser não executado (pendente staging)
- Staging não validado
- `pnpm start` (dist mode) não testado em integração real com DB
- rootDir error em build cria risco para CI/deploy pipeline

## Status

parcial — fix evidenciado em source e testes unitários; E2E e staging pendentes
