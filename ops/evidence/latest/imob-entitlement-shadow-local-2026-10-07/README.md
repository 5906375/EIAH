# Passo 2C.2 — IMOB entitlement shadow (local)

Status: evidenciado no recorte local sintético. Não é migração de enforcement.

## Implementação e reconciliação

| Estrutura auditada | Reutilização / decisão |
| --- | --- |
| session.ts / resolveExperienceSnapshot | Mesma leitura tenant + workspace/null + allowed=true; P7, select actionName, sem take; Set e sort. P5/P7 privados. |
| imobEntitlements.ts | Mantido integralmente; I OR P7 observado com os mesmos fatos, sem chamar o leitor novamente. Testes comparam também com o leitor compartilhado real. |
| imobAccessGate.ts | Normalização existente de instalação e erro 403 reutilizados sem alterações. |
| logging/logger.ts | createLogger Pino existente; contexto tenant/workspace e x-trace-id da resposta; try/catch criação e emissão. |
| requestLogger / express.d.ts | Symbol runtime não garante req.logger; novo evento não depende dessa propriedade. Nenhuma ponte ou trace novo. |
| registry / experienceResolver | Não alterados; sem diagnóstico em projeções públicas. |
| vertical.access.v1 / resolver | Step 1 preservado; nenhum consumidor novo ou enforcement. |
| activation / approval / provisioning / Prisma | Sem alteração ou escrita nova; provisioning tem responsabilidade distinta de P5/P7. |

Enforcement continua **I OR P5 OR M**. Shared shadow = **I OR P7**.
Aligned compara os dois aliases legados, não a instalação.
Diagnóstico privado emitido em GET /session/context após leitura dos fatos e antes do gate IMOB, tanto em allow quanto deny. Não é persistido nem projetado no HTTP.

## Execução real

Logs e exit codes em results.json e respectivos *.log.txt. O log shadow-final contém diagnósticos reais capturados do logger controlado da rota, com escopo inteiramente sintético e sem tokens. O baseline-session.ts.txt foi copiado antes de editar e permite repetir a comparação HTTP integral.

Comando de reprodução local da comparação:

```bash
IMOB_SESSION_BASELINE_SOURCE=ops/evidence/latest/imob-entitlement-shadow-local-2026-10-07/baseline-session.ts.txt IMOB_SHADOW_PRINT_DIAGNOSTICS=1 node --import tsx apps/api/src/tests/session-entitlement-shadow.contract.test.ts
```

A suíte cobre A–M: instalação, todas as cinco actions P5, ambas exclusivas P7, marketplace, nenhuma fonte, fontes simultâneas, deduplicação/ordem, tenant-wide versus false, isolamento de escopo, fallback de erro da instalação, instalação inativa, falha de criação/emissão do logger e emissão anterior ao 403. O teste local de baseline compara status e body completos para todos os cenários; CI executa os 21 testes permanentes sem exigir Git ou arquivo temporário.

Regressões: Step 1 (16), entitlement (4), billing (4), registry (5), front door (7), knowledge service (3), revogação (5). Typecheck da API e do teste. Gates launcher, orphan, docs, reason canon e diff. Evidence Index validado depois de indexar arquivos físicos.

## Falhas intermediárias preservadas

- initial-failure.json: teste assumiu export default, corrigido para sessionRouter; resumo observado, não log bruto completo.
- shadow.log.txt: sockets Supertest bloqueados por listen EPERM no sandbox; reexecução autorizada passou.
- typecheck-test-initial-failure.json: req.traceId sem augmentation no check isolado; corrigido apenas no request sintético por interseção de tipo. O log original foi sobrescrito; resumo transparente mantido.
- evidence-index.log.txt: teste do checker falhou no sandbox; reexecução autorizada em evidence-index-authorized.log.txt passou (8 testes do checker e 651 referências).
- revocation.log.txt: import exigia DATABASE_URL. Suite puramente funcional rerodada com URL sintética inacessível em 127.0.0.1:1; nenhum acesso a DB e nenhuma integração alegada.

## Limitações / gates não executados

Não executados: vertical-access.contract.test.ts, marketplace.installations.activate.test.ts, session-context-cache-control.contract.test.ts e imob.knowledge.search.contract.test.ts. Exigem DB real, DDL/backfill/fixtures e em alguns casos Redis/bootstrap global. Nenhum ambiente isolado de integração foi estabelecido nesta rodada; não foram usados .env ou bancos de desenvolvimento/produtivos. Risco: integração com Prisma real e bootstrap completo não ratificada. Validar depois em PostgreSQL/Redis descartáveis, com fixtures próprias, sem credenciais de ambiente real. As respostas HTTP da sessão foram validadas via Express/Supertest com dependências controladas.

Logger capturado nos testes é controlado; os testes não provam ingestão/retenção do transport Pino em produção. A nova leitura não tem take:1 e pode retornar mais linhas; custo/volume requer observação operacional. As listas legadas privadas podem divergir no futuro; comparação contra resolveImobEntitlements nos testes ajuda detectar drift, não estabelece catálogo canônico.

Não prova produção, staging, CI remoto, migração de enforcement, remoção de fallback, autorização HIGH, convergência definitiva P5/P7 ou mudança canônica de entitlement.

## Limites preservados

Sem alteração de enforcement, body/status público, IMOB_INSTALLED, IMOB_INSTALLATION_STATUS, fallback policy/marketplace, vertical.access.v1, HIGH, TenantActionPolicy persistida, provisioning, activation, approval, handlers, workers, receipt, frontend ou ChatAgentLauncher. Sem schema/migration, novas policies, infraestrutura nova ou commit/push. Run Archive, Funil + Equipe e IMOB Cost não afetados; frentes fechadas não reabertas. Checklists IMOB Data e Trilha B consultados para preservar escopo, isolamento, fail-closed e ausência de schema; runtime de responsible actor não alterado.

Agente envolvido: Codex /root; sem subagentes.
