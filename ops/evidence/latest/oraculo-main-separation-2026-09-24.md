# Oráculo SC — separação de main e revalidação, 24/09/2026

O corte foi separado da história de Radar Social/SignalForward. Base: origin/main e75cf1924043c44147e73329e47aec934b81b3d0. Checkout: /home/jusall/projects/EIAH_ORACULO_MAIN. Nenhum commit do PR #446 foi reaplicado. O checkout anterior permanece preservado.

## Reaplicação

| Commit anterior | Novo commit | Conteúdo |
| --- | --- | --- |
| 24bba5a | 48d9b06 | Contratos e persistência sintética |
| d1f1024 | 6118f10 | Correção E1 e checker |
| 7a81734 | efc02fc | Catálogo dedicado para simulação |
| 4c19a4d | 73321c2 | Negativas e recuperação |

Os conflitos ocorreram somente no nome gerado do pacote Prisma. Foram resolvidos com Prisma validate/generate a partir do schema de main acrescido dos modelos Oráculo, sem escolher o client derivado da branch anterior. Código/fixtures/testes Oráculo e migrações permaneceram byte a byte iguais ao corte anterior, conforme comparação registrada. A lista de arquivos alterados não contém arquivos de Radar Social/SignalForward. Os relatórios de 23/09 foram preservados como evidência histórica, não como validação desta base.

## Validação da nova base

79 testes puros/contratuais/mapper e 44 integrados passaram. Os 18 testes dos checkers, dois typechecks, checker de catálogo, Evidence Index, Prisma validate e diff check passaram. Prisma generate foi executado para resolver cada conflito. PostgreSQL 16 exclusivo foi removido após os testes. A validação é do conjunto final reaplicado; não declara testes isolados completos em cada ponta intermediária nem aprovação do CI remoto.

Comandos executados: tsc -p packages/contracts/tsconfig.json --noEmit; tsc -p tsconfig.oraculo-ci1.json --noEmit; test:oraculo-s1; node --import tsx --test scripts/tests/checkEvidenceIndex.test.ts scripts/tests/checkReasonCodeCanon.test.ts; checkEvidenceIndex.ts; checkReasonCodeCanon.ts; Prisma validate/generate --config prisma.oraculo-ci1.config.ts; validateOraculoS1Integrated.ts; git diff --check e75cf19..HEAD.

Evidências: ops/evidence/latest/oraculo-main-separation-2026-09-24.json e ops/evidence/latest/oraculo-ci1-validation/3172d6cd-99d0-4e61-87c7-3ccfc8b9c870/results.json. Incluem saídas, hashes, base, arquivos alterados e comparação com o corte anterior.

## Publicação proposta

1. review/oraculo-main-foundation → main.
2. review/oraculo-main-reason-activation → review/oraculo-main-foundation.
3. review/oraculo-main-negative-results → review/oraculo-main-reason-activation.

As dependências agora existem somente entre os cortes do próprio Oráculo, para preservar o PR dedicado do catálogo. Reavaliar CI/base após cada merge, sem autorizar merge nesta tarefa. As branches review/oraculo-ci1-* antigas ficam preservadas e substituídas por esta sequência; nenhum PR da base antiga estava aberto na conferência. G3/G5 e C0 integrado permanecem abertos. Sem deploy, banco compartilhado, emissão real ou integração física. Agente: Codex, sem subagentes.
