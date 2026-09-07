# ADR-002 v2-r3 — Verificação do registro de ratificação

Data de execução: 2026-09-07. Executor: Codex. Escopo: documental.

## Objeto e resultado

A resposta humana “Ratifico a arquitetura v2-r3” foi transcrita na [ficha de ratificação](../../../docs/ops/adr-002-v2-r3-ratification-record.md), vinculada à pergunta com versão, PR e hash exatos. A proveniência, o horário de referência e os metadados não fornecidos estão explícitos nessa ficha.

Verificações executadas em Python e Git durante a atualização:

- PASS: worktree documental estava limpo antes da edição.
- PASS: SHA-256 do ADR antes e depois da atualização da ficha: `13f6c01d3fb5fc739d0cc1b2a844a302a2bd7cbcdc1810f746109c20885e4431`.
- PASS: manifestação literal presente na ficha; status da ficha atualizado.
- PASS: todos os links relativos da ficha resolvem para arquivos existentes.
- PASS: `git diff --check` após a atualização da ficha.

O ADR submetido permaneceu byte a byte intacto; seus campos de submissão são históricos e o estado posterior está nesta ficha. O hash é identificador de conteúdo, não assinatura humana.

## Verificações complementares executadas

- PASS: `node --import /home/jusall/projects/EIAH_BUILDER/node_modules/tsx/dist/loader.mjs scripts/checkDocsLinkIntegrity.ts` — 23 arquivos canônicos verificados; os links da ficha nova foram verificados separadamente em Python.
- PASS: `node --import /home/jusall/projects/EIAH_BUILDER/node_modules/tsx/dist/loader.mjs --test scripts/tests/checkEvidenceIndex.test.ts` — 2 testes, 2 sucessos.
- Runtime usado: `/usr/local/bin/node`; não houve instalação de dependências nem execução de testes de runtime de autorização.

## Limites

Esta execução comprova consistência documental e preservação do objeto ratificado. Não autentica externamente a identidade civil do ratificador, não supre a justificativa adicional não fornecida e não comprova comportamento de runtime. Não concede scopes, grants, autorização de implementação, liberação de piloto ou merge.

Os resultados anteriores de CI (29 sucessos e duas falhas por evidências operacionais antigas no commit d52134b9e2f7d76bc651996c7c1292ca90e2e435) permanecem históricos daquele commit. O novo commit precisa de seus próprios checks; datas de evidências operacionais e gates não foram alterados.
