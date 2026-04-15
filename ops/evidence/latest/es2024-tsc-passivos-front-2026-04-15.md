# Abertura de frente separada — ES2024 + tsc --noEmit (2026-04-15)

## Objetivo
Tratar passivos remanescentes sem misturar com a frente já encerrada de deduplicação do self-service:
- warning de target `ES2024` no build web;
- erros históricos de `tsc --noEmit`.

## Escopo
1. Inventário e baseline de warnings/erros.
2. Correção do warning de compatibilidade de target no toolchain.
3. Redução progressiva da dívida de tipagem (`tsc --noEmit`) por lotes.
4. Gates de anti-regressão no CI.

## DoD
- Build web sem warning de target `ES2024` não reconhecido.
- Baseline de `tsc --noEmit` reduzido conforme meta aprovada (ideal: zerado).
- Evidências indexadas no `docs/EVIDENCE_INDEX.md`.
- Proteções de CI ativas para prevenir reintrodução.

## Fora de escopo
- Qualquer novo refactor da frente self-service dedup.
