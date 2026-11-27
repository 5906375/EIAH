# PRE_DUIMP — status literal de instalação (2026-09-30)

## Escopo e resultado

Correção restrita de `evaluatePreDuimpEntitlementGate`: somente `active` literal permite avançar. A capability e a autorização final usam os mesmos fatos nos testes de regressão. O gate genérico permanece inalterado; suspensão, instalação ausente, escopo/produto incorretos e decisões existentes de billing/grace continuam cobertos.

| Execução local no WSL | Resultado | Log |
| --- | --- | --- |
| Antes da correção, testes afetados | 27/29; duas divergências em `ACTIVE` e ` active ` | `before.log.gz` |
| Depois da correção, testes afetados | 29/29 | `after.log.gz` |
| Contratos governados e PRE_DUIMP/sessão | 15/15 e 67/67 | `contracts.log.gz` |
| HTTP da rota shadow | 9/9 | `http.log.gz` |

Os testes afetados também integram a suíte de contratos; os números não representam conjuntos independentes. Erros sintéticos registrados pelas dependências são casos negativos aprovados.

## Comandos executados pelo usuário

```bash
node --import tsx --test apps/api/src/tests/pre-duimp-access-resolver.contract.test.ts apps/api/src/tests/pre-duimp-context.contract.test.ts
pnpm test:pre-duimp-contracts
pnpm test:pre-duimp-runtime-shadow-route
git diff --check -- apps/api/src/types/preDuimpContextContract.ts apps/api/src/tests/pre-duimp-access-resolver.contract.test.ts apps/api/src/tests/pre-duimp-context.contract.test.ts
git diff -- apps/api/src/types/preDuimpContextContract.ts apps/api/src/tests/pre-duimp-access-resolver.contract.test.ts apps/api/src/tests/pre-duimp-context.contract.test.ts
```

Os quatro logs fornecidos foram preservados byte a byte dentro dos arquivos gzip, com SHA-256 em `results.json`. Códigos de saída não foram registrados separadamente. Diff-check sem saída e diff restrito foram apresentados no terminal pelo usuário; não há log separado desses dois comandos no pacote recebido.

## Arquivos do incremento de código

- `apps/api/src/types/preDuimpContextContract.ts`
- `apps/api/src/tests/pre-duimp-access-resolver.contract.test.ts`
- `apps/api/src/tests/pre-duimp-context.contract.test.ts`

## Limites

Evidência de testes locais com fatos simulados e HTTP shadow; não comprova a árvore integral, fonte financeira canônica conectada, produção, transmissão externa ou novo E2E com banco. Não houve typecheck integral nesta etapa. A jornada E2E de 2026-08-29 permanece histórica, sem ser reapresentada como execução atual. Nenhum commit, push ou deploy integra esta evidência. ADR-009 permanece Proposta; os bloqueios financeiros/P1 não são liberados por este incremento.

Agentes envolvidos: Codex na preparação e revisão; usuário na aplicação e execução WSL. Status: evidenciado para o escopo dos testes locais acima.
